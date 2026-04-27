/*
  # Super admin normal user soft deletion

  Allows active super admins to soft delete normal/company users.
*/

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE OR REPLACE FUNCTION delete_normal_user(
  super_admin_email text,
  target_user_id uuid
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
    RAISE EXCEPTION 'Only super admin can delete normal users';
  END IF;

  UPDATE app_users
  SET
    is_active = false,
    deleted_at = now(),
    deleted_by = lower(trim(super_admin_email)),
    updated_at = now()
  WHERE app_users.id = target_user_id
    AND app_users.role = 'normal'
    AND app_users.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION delete_normal_user(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_normal_user(text, uuid) TO anon, authenticated;
