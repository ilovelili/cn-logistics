/*
  # Shipment status periods

  Stores optional from/to dates for each shipment status so dashboards can show
  previous/current status durations instead of relying only on updated_at.
*/

ALTER TABLE shipment_jobs
  ADD COLUMN IF NOT EXISTS under_process_from_date date,
  ADD COLUMN IF NOT EXISTS under_process_to_date date,
  ADD COLUMN IF NOT EXISTS customs_hold_from_date date,
  ADD COLUMN IF NOT EXISTS customs_hold_to_date date,
  ADD COLUMN IF NOT EXISTS completed_from_date date,
  ADD COLUMN IF NOT EXISTS completed_to_date date;

UPDATE shipment_jobs
SET under_process_from_date = COALESCE(under_process_from_date, created_at::date)
WHERE under_process_from_date IS NULL;

UPDATE shipment_jobs
SET completed_from_date = COALESCE(completed_from_date, updated_at::date),
    completed_to_date = COALESCE(completed_to_date, updated_at::date)
WHERE status = 'completed';

UPDATE shipment_jobs
SET customs_hold_from_date = COALESCE(customs_hold_from_date, updated_at::date)
WHERE status = 'customs_hold';

DROP FUNCTION IF EXISTS list_accessible_shipment_jobs(text);

CREATE OR REPLACE FUNCTION list_accessible_shipment_jobs(requester_email text)
RETURNS TABLE(
  id uuid,
  company_name text,
  status text,
  under_process_from_date date,
  under_process_to_date date,
  customs_hold_from_date date,
  customs_hold_to_date date,
  completed_from_date date,
  completed_to_date date,
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
    shipment_jobs.under_process_from_date,
    shipment_jobs.under_process_to_date,
    shipment_jobs.customs_hold_from_date,
    shipment_jobs.customs_hold_to_date,
    shipment_jobs.completed_from_date,
    shipment_jobs.completed_to_date,
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
  ORDER BY GREATEST(
    COALESCE(shipment_jobs.under_process_from_date, DATE '0001-01-01'),
    COALESCE(shipment_jobs.customs_hold_from_date, DATE '0001-01-01'),
    COALESCE(shipment_jobs.completed_from_date, DATE '0001-01-01'),
    shipment_jobs.updated_at::date
  ) DESC;
$$;

REVOKE ALL ON FUNCTION list_accessible_shipment_jobs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accessible_shipment_jobs(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
