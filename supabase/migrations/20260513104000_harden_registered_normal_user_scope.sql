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
  updated_at timestamptz,
  admin_assignments jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(admin_email))
      AND app_users.role IN ('admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    normal_user.id,
    normal_user.email,
    normal_user.company_name,
    normal_user.zipcode,
    normal_user.company_address,
    normal_user.telephone,
    normal_user.budget,
    normal_user.contact_person,
    normal_user.notes,
    normal_user.approval_status,
    normal_user.created_by,
    normal_user.created_at,
    normal_user.updated_at,
    get_normal_user_admin_assignments(normal_user.id) AS admin_assignments
  FROM app_users normal_user
  CROSS JOIN requester
  WHERE normal_user.role = 'normal'
    AND normal_user.deleted_at IS NULL
    AND (
      requester.role = 'super_admin'
      OR lower(coalesce(normal_user.created_by, '')) = lower(requester.email)
      OR EXISTS (
        SELECT 1
        FROM app_user_admin_assignments assignment
        WHERE assignment.normal_user_id = normal_user.id
          AND assignment.admin_user_id = requester.id
      )
    )
  ORDER BY normal_user.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_registered_normal_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_registered_normal_users(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
