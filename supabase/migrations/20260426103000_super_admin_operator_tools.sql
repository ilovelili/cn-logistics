/*
  # Super admin operator tools

  Adds super-admin-only RPCs for managing admin operators and updates the
  registered-user listing so super admins can inspect all normal users.
*/

CREATE OR REPLACE FUNCTION list_registered_normal_users(admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  company_name text,
  zipcode text,
  company_address text,
  telephone text,
  budget numeric,
  contact_person text,
  notes text,
  approval_status text,
  created_by text,
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
    app_users.company_name,
    app_users.zipcode,
    app_users.company_address,
    app_users.telephone,
    app_users.budget,
    app_users.contact_person,
    app_users.notes,
    app_users.approval_status,
    app_users.created_by,
    app_users.created_at,
    app_users.updated_at
  FROM app_users
  WHERE app_users.role = 'normal'
    AND (
      app_users.created_by = admin_email
      OR EXISTS (
        SELECT 1
        FROM app_users requester
        WHERE lower(requester.email) = lower(trim(admin_email))
          AND requester.role = 'super_admin'
          AND requester.is_active = true
      )
    )
  ORDER BY app_users.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_registered_normal_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_registered_normal_users(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  is_active boolean,
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
    app_users.is_active,
    app_users.created_at,
    app_users.updated_at
  FROM app_users
  WHERE app_users.role = 'admin'
    AND EXISTS (
      SELECT 1
      FROM app_users requester
      WHERE lower(requester.email) = lower(trim(super_admin_email))
        AND requester.role = 'super_admin'
        AND requester.is_active = true
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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(super_admin_email))
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
  ) THEN
    RAISE EXCEPTION 'Only super admin can create admin operators';
  END IF;

  INSERT INTO app_users (
    email,
    role,
    temporary_password,
    user_name,
    approval_status,
    created_by,
    is_active
  )
  VALUES (
    lower(trim(operator_email)),
    'admin',
    operator_password,
    NULLIF(trim(operator_name), ''),
    'approved',
    lower(trim(super_admin_email)),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION create_admin_operator(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_admin_operator(text, text, text, text) TO anon, authenticated;
