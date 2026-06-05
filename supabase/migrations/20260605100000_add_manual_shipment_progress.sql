ALTER TABLE shipment_jobs
  ADD COLUMN IF NOT EXISTS progress_percent integer,
  ADD COLUMN IF NOT EXISTS progress_step integer,
  ADD COLUMN IF NOT EXISTS progress_color_hex text;

ALTER TABLE shipment_jobs
  DROP CONSTRAINT IF EXISTS shipment_jobs_progress_percent_check,
  DROP CONSTRAINT IF EXISTS shipment_jobs_progress_step_check,
  DROP CONSTRAINT IF EXISTS shipment_jobs_progress_color_hex_check;

ALTER TABLE shipment_jobs
  ADD CONSTRAINT shipment_jobs_progress_percent_check
    CHECK (progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT shipment_jobs_progress_step_check
    CHECK (progress_step IS NULL OR progress_step BETWEEN 1 AND 10),
  ADD CONSTRAINT shipment_jobs_progress_color_hex_check
    CHECK (progress_color_hex IS NULL OR progress_color_hex ~* '^#[0-9a-f]{6}$');

DROP FUNCTION IF EXISTS list_accessible_shipment_jobs(text);

CREATE OR REPLACE FUNCTION list_accessible_shipment_jobs(requester_email text)
RETURNS TABLE(
  id uuid,
  shipper_name text,
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
  job_number text,
  transport_mode text,
  consignee_name text,
  pol_aol text,
  pod_aod text,
  vessel_flight_numbers text[],
  mbl_mawb text,
  hbl_hawb text,
  bl_awb_date date,
  assigned_admin_user_ids uuid[],
  progress_percent integer,
  progress_step integer,
  progress_color_hex text,
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
    shipment_jobs.shipper_name,
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
    shipment_jobs.job_number,
    shipment_jobs.transport_mode,
    shipment_jobs.consignee_name,
    shipment_jobs.pol_aol,
    shipment_jobs.pod_aod,
    shipment_jobs.vessel_flight_numbers,
    shipment_jobs.mbl_mawb,
    shipment_jobs.hbl_hawb,
    shipment_jobs.bl_awb_date,
    shipment_jobs.assigned_admin_user_ids,
    shipment_jobs.progress_percent,
    shipment_jobs.progress_step,
    shipment_jobs.progress_color_hex,
    shipment_jobs.documents,
    shipment_jobs.internal_documents,
    shipment_jobs.notes,
    shipment_jobs.created_at,
    shipment_jobs.updated_at
  FROM shipment_jobs
  CROSS JOIN requester
  WHERE shipment_jobs.shipper_name IS NOT NULL
    AND can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.shipper_name
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

DROP FUNCTION IF EXISTS update_accessible_shipment_job(text, uuid, jsonb);

CREATE OR REPLACE FUNCTION update_accessible_shipment_job(
  requester_email text,
  target_job_id uuid,
  job_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_record record;
  target_record record;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Requester is not allowed to update shipment jobs';
  END IF;

  SELECT shipment_jobs.id, shipment_jobs.shipper_name
  INTO target_record
  FROM shipment_jobs
  WHERE shipment_jobs.id = target_job_id
  LIMIT 1;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'Shipment job not found';
  END IF;

  IF target_record.shipper_name IS NULL
    OR NOT can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_record.shipper_name
    )
  THEN
    RAISE EXCEPTION 'Requester cannot update this shipment job';
  END IF;

  IF job_payload->>'status' NOT IN (
    'under_process',
    'customs_hold',
    'completed',
    'pickup',
    'warehouse_in',
    'customs_origin',
    'terminal_in',
    'departure',
    'arrival',
    'customs_destination',
    'destination_warehouse_in',
    'delivery',
    'delivered'
  ) THEN
    RAISE EXCEPTION 'Unsupported shipment status';
  END IF;

  UPDATE shipment_jobs
  SET
    status = job_payload->>'status',
    under_process_from_date = NULLIF(job_payload->>'under_process_from_date', '')::date,
    under_process_to_date = NULLIF(job_payload->>'under_process_to_date', '')::date,
    customs_hold_from_date = NULLIF(job_payload->>'customs_hold_from_date', '')::date,
    customs_hold_to_date = NULLIF(job_payload->>'customs_hold_to_date', '')::date,
    completed_from_date = NULLIF(job_payload->>'completed_from_date', '')::date,
    completed_to_date = NULLIF(job_payload->>'completed_to_date', '')::date,
    trade_mode = job_payload->>'trade_mode',
    trade_term = NULLIF(job_payload->>'trade_term', ''),
    invoice_number = NULLIF(job_payload->>'invoice_number', ''),
    job_number = NULLIF(job_payload->>'job_number', ''),
    transport_mode = NULLIF(job_payload->>'transport_mode', ''),
    shipper_name = NULLIF(job_payload->>'shipper_name', ''),
    consignee_name = NULLIF(job_payload->>'consignee_name', ''),
    pol_aol = NULLIF(job_payload->>'pol_aol', ''),
    pod_aod = NULLIF(job_payload->>'pod_aod', ''),
    vessel_flight_numbers = COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(job_payload->'vessel_flight_numbers')
      ),
      '{}'::text[]
    ),
    mbl_mawb = NULLIF(job_payload->>'mbl_mawb', ''),
    hbl_hawb = NULLIF(job_payload->>'hbl_hawb', ''),
    bl_awb_date = NULLIF(job_payload->>'bl_awb_date', '')::date,
    assigned_admin_user_ids = COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(job_payload->'assigned_admin_user_ids')::uuid
      ),
      '{}'::uuid[]
    ),
    progress_percent = NULLIF(job_payload->>'progress_percent', '')::integer,
    progress_step = NULLIF(job_payload->>'progress_step', '')::integer,
    progress_color_hex = NULLIF(job_payload->>'progress_color_hex', ''),
    documents = COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(job_payload->'documents')
      ),
      '{}'::text[]
    ),
    internal_documents = COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(job_payload->'internal_documents')
      ),
      '{}'::text[]
    ),
    notes = NULLIF(job_payload->>'notes', '')
  WHERE shipment_jobs.id = target_job_id;
END;
$$;

REVOKE ALL ON FUNCTION update_accessible_shipment_job(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_accessible_shipment_job(text, uuid, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
