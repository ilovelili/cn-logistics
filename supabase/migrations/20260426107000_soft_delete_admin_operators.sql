/*
  # Soft delete admin operators

  Allows active super admins to delete admin operators without removing their
  database history.
*/

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

DROP FUNCTION IF EXISTS delete_admin_operator(text, uuid);

CREATE OR REPLACE FUNCTION delete_admin_operator(
  super_admin_email text,
  target_operator_id uuid
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
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only super admin can delete admin operators';
  END IF;

  UPDATE app_users
  SET
    is_active = false,
    deleted_at = now(),
    deleted_by = lower(trim(super_admin_email)),
    updated_at = now()
  WHERE app_users.id = target_operator_id
    AND app_users.role = 'admin'
    AND app_users.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION delete_admin_operator(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_admin_operator(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
