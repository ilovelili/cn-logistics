/*
  # Update admin operator profile

  Allows super admins to edit an admin operator's display name and staff role.
  Company assignments continue to use update_normal_user_admin_assignments.
*/

CREATE OR REPLACE FUNCTION update_admin_operator(
  super_admin_email text,
  target_operator_id uuid,
  operator_name text,
  operator_staff_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
    RAISE EXCEPTION 'Only super admin can update admin operators';
  END IF;

  UPDATE app_users
  SET
    user_name = NULLIF(trim(operator_name), ''),
    staff_role = normalized_staff_role,
    updated_at = now()
  WHERE app_users.id = target_operator_id
    AND app_users.role = 'admin'
    AND app_users.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin operator was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION update_admin_operator(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_admin_operator(text, uuid, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
