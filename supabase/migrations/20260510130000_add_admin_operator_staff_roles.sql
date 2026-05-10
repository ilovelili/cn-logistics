/*
  # Admin operator staff roles

  Adds a staff-role/department marker to admin operators so future backup
  workflows can filter same-level users by sales, customer service, operations,
  or other.
*/

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS staff_role text;

ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_staff_role_check;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_staff_role_check
  CHECK (
    staff_role IS NULL
    OR staff_role IN ('sales', 'customer_service', 'operations', 'other')
  );

UPDATE app_users
SET staff_role = 'other'
WHERE role = 'admin'
  AND staff_role IS NULL
  AND deleted_at IS NULL;

DROP FUNCTION IF EXISTS list_admin_operators(text);

CREATE OR REPLACE FUNCTION list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  staff_role text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_users.id,
    app_users.email,
    app_users.user_name,
    COALESCE(app_users.staff_role, 'other') AS staff_role,
    app_users.created_at,
    app_users.updated_at
  FROM app_users
  WHERE app_users.role = 'admin'
    AND app_users.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM app_users requester
      WHERE lower(requester.email) = lower(trim(super_admin_email))
        AND requester.role = 'super_admin'
        AND requester.is_active = true
        AND requester.deleted_at IS NULL
    )
  ORDER BY app_users.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_admin_operators(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_admin_operators(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS create_admin_operator(text, text, text, text);
DROP FUNCTION IF EXISTS create_admin_operator(text, text, text, text, text);

CREATE OR REPLACE FUNCTION create_admin_operator(
  operator_email text,
  operator_name text,
  operator_staff_role text,
  operator_password text,
  super_admin_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_operator_email text := lower(trim(operator_email));
  normalized_super_admin_email text := lower(trim(super_admin_email));
  normalized_staff_role text := COALESCE(NULLIF(trim(operator_staff_role), ''), 'other');
BEGIN
  IF normalized_staff_role NOT IN ('sales', 'customer_service', 'operations', 'other') THEN
    RAISE EXCEPTION 'Invalid admin operator staff role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = normalized_super_admin_email
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only super admin can create admin operators';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = normalized_operator_email
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Admin operator email already exists';
  END IF;

  INSERT INTO app_users (
    email,
    role,
    temporary_password,
    user_name,
    staff_role,
    approval_status,
    created_by,
    deleted_at,
    deleted_by
  )
  VALUES (
    normalized_operator_email,
    'admin',
    operator_password,
    NULLIF(trim(operator_name), ''),
    normalized_staff_role,
    'approved',
    normalized_super_admin_email,
    NULL,
    NULL
  )
  ON CONFLICT (email) DO UPDATE
  SET
    role = 'admin',
    temporary_password = operator_password,
    user_name = EXCLUDED.user_name,
    staff_role = normalized_staff_role,
    approval_status = 'approved',
    created_by = normalized_super_admin_email,
    is_active = true,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = now()
  WHERE app_users.deleted_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION create_admin_operator(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_admin_operator(text, text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
