DROP POLICY IF EXISTS "Anyone can view shipment jobs" ON shipment_jobs;
DROP POLICY IF EXISTS "Anyone can view shipment documents" ON shipment_documents;
DROP POLICY IF EXISTS "Anyone can view active shipment tracking events" ON shipment_tracking_events;

CREATE OR REPLACE FUNCTION can_requester_access_shipment_company(
  requester_id uuid,
  requester_email text,
  requester_role text,
  target_company_name text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    requester_role = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM app_users normal_user
      WHERE normal_user.role = 'normal'
        AND normal_user.deleted_at IS NULL
        AND lower(trim(normal_user.company_name)) = lower(trim(target_company_name))
        AND (
          (
            requester_role = 'normal'
            AND lower(normal_user.email) = lower(requester_email)
          )
          OR (
            requester_role = 'admin'
            AND (
              lower(coalesce(normal_user.created_by, '')) = lower(requester_email)
              OR EXISTS (
                SELECT 1
                FROM app_user_admin_assignments assignment
                WHERE assignment.normal_user_id = normal_user.id
                  AND assignment.admin_user_id = requester_id
              )
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION can_requester_access_shipment_company(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_requester_access_shipment_company(uuid, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_accessible_shipment_jobs(requester_email text)
RETURNS TABLE(
  id uuid,
  company_name text,
  status text,
  trade_mode text,
  trade_term text,
  invoice_number text,
  transport_mode text,
  shipper_name text,
  consignee_name text,
  pol_aol text,
  pod_aod text,
  vessel_flight_numbers text[],
  mbl_mawb text,
  hbl_hawb text,
  bl_awb_date date,
  assigned_admin_user_ids uuid[],
  documents text[],
  internal_documents text[],
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    shipment_jobs.id,
    shipment_jobs.company_name,
    shipment_jobs.status,
    shipment_jobs.trade_mode,
    shipment_jobs.trade_term,
    shipment_jobs.invoice_number,
    shipment_jobs.transport_mode,
    shipment_jobs.shipper_name,
    shipment_jobs.consignee_name,
    shipment_jobs.pol_aol,
    shipment_jobs.pod_aod,
    shipment_jobs.vessel_flight_numbers,
    shipment_jobs.mbl_mawb,
    shipment_jobs.hbl_hawb,
    shipment_jobs.bl_awb_date,
    shipment_jobs.assigned_admin_user_ids,
    shipment_jobs.documents,
    shipment_jobs.internal_documents,
    shipment_jobs.notes,
    shipment_jobs.created_at,
    shipment_jobs.updated_at
  FROM shipment_jobs
  CROSS JOIN requester
  WHERE shipment_jobs.company_name IS NOT NULL
    AND can_requester_access_shipment_company(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.company_name
    )
  ORDER BY shipment_jobs.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION list_accessible_shipment_jobs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accessible_shipment_jobs(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_accessible_shipment_documents(requester_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  scope text,
  name text,
  storage_path text,
  file_url text,
  approval_status text,
  rejection_reason text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    shipment_documents.id,
    shipment_documents.shipment_job_id,
    shipment_documents.scope,
    shipment_documents.name,
    shipment_documents.storage_path,
    shipment_documents.file_url,
    shipment_documents.approval_status,
    shipment_documents.rejection_reason,
    shipment_documents.approved_at,
    shipment_documents.approved_by,
    shipment_documents.created_at,
    shipment_documents.updated_at
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  CROSS JOIN requester
  WHERE shipment_jobs.company_name IS NOT NULL
    AND (
      requester.role <> 'normal'
      OR shipment_documents.scope = 'customer'
    )
    AND can_requester_access_shipment_company(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.company_name
    )
  ORDER BY shipment_documents.created_at ASC, shipment_documents.id ASC;
$$;

REVOKE ALL ON FUNCTION list_accessible_shipment_documents(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accessible_shipment_documents(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_accessible_shipment_tracking_events(requester_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  event_date date,
  location text,
  description text,
  sort_order integer,
  deleted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    shipment_tracking_events.id,
    shipment_tracking_events.shipment_job_id,
    shipment_tracking_events.event_date,
    shipment_tracking_events.location,
    shipment_tracking_events.description,
    shipment_tracking_events.sort_order,
    shipment_tracking_events.deleted_at,
    shipment_tracking_events.created_at,
    shipment_tracking_events.updated_at
  FROM shipment_tracking_events
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_tracking_events.shipment_job_id
  CROSS JOIN requester
  WHERE shipment_tracking_events.deleted_at IS NULL
    AND shipment_jobs.company_name IS NOT NULL
    AND can_requester_access_shipment_company(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.company_name
    )
  ORDER BY
    shipment_tracking_events.event_date DESC,
    shipment_tracking_events.sort_order ASC,
    shipment_tracking_events.created_at ASC;
$$;

REVOKE ALL ON FUNCTION list_accessible_shipment_tracking_events(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accessible_shipment_tracking_events(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
