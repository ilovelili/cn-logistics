/*
  # Show assigned company users on admin operator list

  Extends list_admin_operators with the company users currently assigned to
  each admin through app_user_admin_assignments.
*/

DROP FUNCTION IF EXISTS list_admin_operators(text);

CREATE OR REPLACE FUNCTION list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  assigned_company_users jsonb,
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
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', normal_user.id,
            'email', normal_user.email,
            'company_name', normal_user.company_name,
            'zipcode', normal_user.zipcode,
            'company_address', normal_user.company_address,
            'telephone', normal_user.telephone,
            'budget', normal_user.budget,
            'contact_person', normal_user.contact_person,
            'notes', normal_user.notes,
            'approval_status', normal_user.approval_status,
            'admin_assignments', get_normal_user_admin_assignments(normal_user.id),
            'created_at', normal_user.created_at,
            'updated_at', normal_user.updated_at
          )
          ORDER BY normal_user.company_name, normal_user.email
        )
        FROM app_user_admin_assignments assignment
        JOIN app_users normal_user
          ON normal_user.id = assignment.normal_user_id
        WHERE assignment.admin_user_id = app_users.id
          AND normal_user.role = 'normal'
          AND normal_user.deleted_at IS NULL
      ),
      '[]'::jsonb
    ) AS assigned_company_users,
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

NOTIFY pgrst, 'reload schema';
