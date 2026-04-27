/*
  # Super admin user approval

  Allows active super admins to approve or reject pending normal users.
*/

CREATE OR REPLACE FUNCTION update_normal_user_approval_status(
  super_admin_email text,
  target_user_id uuid,
  next_approval_status text
)
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF next_approval_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported approval status';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(super_admin_email))
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
  ) THEN
    RAISE EXCEPTION 'Only super admin can approve normal users';
  END IF;

  RETURN QUERY
  UPDATE app_users
  SET
    approval_status = next_approval_status,
    updated_at = now()
  WHERE app_users.id = target_user_id
    AND app_users.role = 'normal'
    AND app_users.approval_status = 'to_be_approved'
  RETURNING
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
    app_users.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION update_normal_user_approval_status(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_normal_user_approval_status(text, uuid, text) TO anon, authenticated;
