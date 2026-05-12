/*
  # Seed admin staff roles and company assignments

  Gives the demo admin operators staff roles and assigned company users so the
  super-admin 管理者一覧 table can show both 担当区分 and 担当会社.
*/

INSERT INTO app_users (
  email,
  role,
  temporary_password,
  user_name,
  staff_role,
  approval_status,
  created_by,
  is_active,
  deleted_at,
  deleted_by
)
VALUES
  (
    'admin@cnlogistics.co.jp',
    'admin',
    '12345',
    'CN Logistics Admin',
    'sales',
    'approved',
    'super_admin@cnlogistics.co.jp',
    true,
    NULL,
    NULL
  ),
  (
    'route666@live.com1',
    'admin',
    '12345',
    'Route 666',
    'operations',
    'approved',
    'super_admin@cnlogistics.co.jp',
    true,
    NULL,
    NULL
  )
ON CONFLICT (email) DO UPDATE
SET
  role = 'admin',
  temporary_password = EXCLUDED.temporary_password,
  user_name = EXCLUDED.user_name,
  staff_role = EXCLUDED.staff_role,
  approval_status = 'approved',
  created_by = EXCLUDED.created_by,
  is_active = true,
  deleted_at = NULL,
  deleted_by = NULL,
  updated_at = now();

INSERT INTO app_users (
  email,
  role,
  temporary_password,
  user_name,
  company_name,
  zipcode,
  company_address,
  telephone,
  budget,
  contact_person,
  notes,
  approval_status,
  created_by,
  is_active,
  deleted_at,
  deleted_by
)
VALUES
  (
    'tokyo-trading@example.com',
    'normal',
    '12345',
    'Tokyo Trading Co., Ltd.',
    'Tokyo Trading Co., Ltd.',
    '100-0001',
    'Tokyo',
    '03-0000-0001',
    120,
    'Tanaka',
    'Demo company assigned to sales.',
    'approved',
    'admin@cnlogistics.co.jp',
    true,
    NULL,
    NULL
  ),
  (
    'osaka-parts@example.com',
    'normal',
    '12345',
    'Osaka Parts Inc.',
    'Osaka Parts Inc.',
    '530-0001',
    'Osaka',
    '06-0000-0002',
    95,
    'Sato',
    'Demo company assigned to sales.',
    'approved',
    'admin@cnlogistics.co.jp',
    true,
    NULL,
    NULL
  ),
  (
    'kobe-foods@example.com',
    'normal',
    '12345',
    'Kobe Foods Ltd.',
    'Kobe Foods Ltd.',
    '650-0001',
    'Kobe',
    '078-000-0003',
    80,
    'Suzuki',
    'Demo company assigned to operations.',
    'approved',
    'route666@live.com1',
    true,
    NULL,
    NULL
  ),
  (
    'nagoya-retail@example.com',
    'normal',
    '12345',
    'Nagoya Retail Corp.',
    'Nagoya Retail Corp.',
    '450-0001',
    'Nagoya',
    '052-000-0004',
    110,
    'Ito',
    'Demo company assigned to operations.',
    'approved',
    'route666@live.com1',
    true,
    NULL,
    NULL
  )
ON CONFLICT (email) DO UPDATE
SET
  role = 'normal',
  temporary_password = EXCLUDED.temporary_password,
  user_name = EXCLUDED.user_name,
  company_name = EXCLUDED.company_name,
  zipcode = EXCLUDED.zipcode,
  company_address = EXCLUDED.company_address,
  telephone = EXCLUDED.telephone,
  budget = EXCLUDED.budget,
  contact_person = EXCLUDED.contact_person,
  notes = EXCLUDED.notes,
  approval_status = 'approved',
  created_by = EXCLUDED.created_by,
  is_active = true,
  deleted_at = NULL,
  deleted_by = NULL,
  updated_at = now();

INSERT INTO app_user_admin_assignments (
  normal_user_id,
  admin_user_id,
  assigned_by
)
SELECT
  normal_user.id,
  admin_user.id,
  'super_admin@cnlogistics.co.jp'
FROM app_users normal_user
JOIN app_users admin_user
  ON lower(admin_user.email) = 'admin@cnlogistics.co.jp'
WHERE lower(normal_user.email) IN (
    'user@test.com',
    'tokyo-trading@example.com',
    'osaka-parts@example.com'
  )
  AND normal_user.role = 'normal'
  AND normal_user.deleted_at IS NULL
  AND admin_user.role = 'admin'
  AND admin_user.deleted_at IS NULL
ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
SET
  assigned_by = EXCLUDED.assigned_by,
  updated_at = now();

INSERT INTO app_user_admin_assignments (
  normal_user_id,
  admin_user_id,
  assigned_by
)
SELECT
  normal_user.id,
  admin_user.id,
  'super_admin@cnlogistics.co.jp'
FROM app_users normal_user
JOIN app_users admin_user
  ON lower(admin_user.email) = 'route666@live.com1'
WHERE lower(normal_user.email) IN (
    'kobe-foods@example.com',
    'nagoya-retail@example.com'
  )
  AND normal_user.role = 'normal'
  AND normal_user.deleted_at IS NULL
  AND admin_user.role = 'admin'
  AND admin_user.deleted_at IS NULL
ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
SET
  assigned_by = EXCLUDED.assigned_by,
  updated_at = now();

DROP FUNCTION IF EXISTS list_admin_operators(text);

CREATE OR REPLACE FUNCTION list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  staff_role text,
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
    COALESCE(app_users.staff_role, 'other') AS staff_role,
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
