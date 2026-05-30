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
    'delivery'
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
