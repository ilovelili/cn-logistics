/*
  # Shipment job admin assignments

  Adds case-level admin assignments to shipment jobs. Existing jobs are
  backfilled from the selected company's current assigned admins.
*/

ALTER TABLE shipment_jobs
  ADD COLUMN IF NOT EXISTS assigned_admin_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_shipment_jobs_assigned_admin_user_ids
  ON shipment_jobs USING gin(assigned_admin_user_ids);

CREATE OR REPLACE FUNCTION get_normal_user_admin_assignments(target_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'admin_user_id', admin_user.id,
        'email', admin_user.email,
        'user_name', admin_user.user_name,
        'staff_role', COALESCE(admin_user.staff_role, 'other'),
        'created_at', assignment.created_at,
        'updated_at', assignment.updated_at
      )
      ORDER BY admin_user.email
    ),
    '[]'::jsonb
  )
  FROM app_user_admin_assignments assignment
  JOIN app_users admin_user
    ON admin_user.id = assignment.admin_user_id
  WHERE assignment.normal_user_id = target_user_id
    AND admin_user.role = 'admin'
    AND admin_user.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION get_normal_user_admin_assignments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_normal_user_admin_assignments(uuid) TO anon, authenticated;

UPDATE shipment_jobs
SET assigned_admin_user_ids = assigned_admins.admin_user_ids
FROM (
  SELECT
    shipment_jobs.id AS shipment_job_id,
    array_agg(assignment.admin_user_id ORDER BY admin_user.email) AS admin_user_ids
  FROM shipment_jobs
  JOIN app_users normal_user
    ON normal_user.role = 'normal'
    AND normal_user.deleted_at IS NULL
    AND normal_user.company_name = shipment_jobs.company_name
  JOIN app_user_admin_assignments assignment
    ON assignment.normal_user_id = normal_user.id
  JOIN app_users admin_user
    ON admin_user.id = assignment.admin_user_id
    AND admin_user.role = 'admin'
    AND admin_user.deleted_at IS NULL
  WHERE cardinality(shipment_jobs.assigned_admin_user_ids) = 0
  GROUP BY shipment_jobs.id
) assigned_admins
WHERE shipment_jobs.id = assigned_admins.shipment_job_id;

NOTIFY pgrst, 'reload schema';
