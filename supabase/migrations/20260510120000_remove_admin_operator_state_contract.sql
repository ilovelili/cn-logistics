/*
  # Remove admin operator state from the public contract

  The shared app_users.is_active column remains for authentication and
  soft-delete compatibility, but admin operator listing and creation no longer
  require or return a status field.
*/

DROP FUNCTION IF EXISTS list_admin_operators(text);

CREATE OR REPLACE FUNCTION list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
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

CREATE OR REPLACE FUNCTION create_admin_operator(
  operator_email text,
  operator_name text,
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
BEGIN
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
    approval_status = 'approved',
    created_by = normalized_super_admin_email,
    is_active = true,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = now()
  WHERE app_users.deleted_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION create_admin_operator(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_admin_operator(text, text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
