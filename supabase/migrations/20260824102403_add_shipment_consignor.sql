/*
  # Add shipment consignor

  Stores the consignor separately from the registered shipper and consignee,
  exposes it through the accessible shipment RPC, and persists it through both
  the compatibility update RPC and the transactional save RPC.
*/

ALTER TABLE public.shipment_jobs
  ADD COLUMN IF NOT EXISTS consignor_name text;

DROP FUNCTION IF EXISTS public.list_accessible_shipment_jobs(text);

CREATE FUNCTION public.list_accessible_shipment_jobs(requester_email text)
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
  consignor_name text,
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
SET search_path = ''
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM public.app_users
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
      AND public.authenticated_caller_can_assume_email(app_users.email)
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
    shipment_jobs.consignor_name,
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
  FROM public.shipment_jobs
  CROSS JOIN requester
  WHERE shipment_jobs.shipper_name IS NOT NULL
    AND public.can_requester_access_shipment_shipper(
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

REVOKE ALL ON FUNCTION public.list_accessible_shipment_jobs(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_jobs(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_accessible_shipment_job(
  requester_email text,
  target_job_id uuid,
  job_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_record record;
  target_shipper_name text := NULLIF(job_payload->>'shipper_name', '');
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot update shipment jobs'
      USING ERRCODE = '42501';
  END IF;

  SELECT shipment_jobs.id, shipment_jobs.shipper_name
  INTO target_record
  FROM public.shipment_jobs
  WHERE shipment_jobs.id = target_job_id
  LIMIT 1;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'Shipment job not found';
  END IF;

  IF target_record.shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_record.shipper_name
    )
    OR target_shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_shipper_name
    )
  THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipper'
      USING ERRCODE = '42501';
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

  UPDATE public.shipment_jobs
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
    shipper_name = target_shipper_name,
    consignee_name = NULLIF(job_payload->>'consignee_name', ''),
    consignor_name = NULLIF(job_payload->>'consignor_name', ''),
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
      ARRAY(SELECT jsonb_array_elements_text(job_payload->'documents')),
      '{}'::text[]
    ),
    internal_documents = COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(job_payload->'internal_documents')),
      '{}'::text[]
    ),
    notes = NULLIF(job_payload->>'notes', '')
  WHERE shipment_jobs.id = target_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_accessible_shipment_job(text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accessible_shipment_job(text, uuid, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job(
  requester_email text,
  target_job_id uuid,
  job_payload jsonb,
  documents_payload jsonb,
  events_payload jsonb,
  create_new boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text := NULLIF(job_payload->>'shipper_name', '');
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot save shipment jobs'
      USING ERRCODE = '42501';
  END IF;

  IF target_shipper_name IS NULL OR NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipper'
      USING ERRCODE = '42501';
  END IF;

  IF create_new THEN
    INSERT INTO public.shipment_jobs (
      id, status, under_process_from_date, under_process_to_date,
      customs_hold_from_date, customs_hold_to_date, completed_from_date,
      completed_to_date, trade_mode, trade_term, invoice_number, job_number,
      transport_mode, shipper_name, consignee_name, consignor_name, pol_aol,
      pod_aod, vessel_flight_numbers, mbl_mawb, hbl_hawb, bl_awb_date,
      assigned_admin_user_ids, progress_percent, progress_step,
      progress_color_hex, documents, internal_documents, notes
    ) VALUES (
      target_job_id,
      job_payload->>'status',
      NULLIF(job_payload->>'under_process_from_date', '')::date,
      NULLIF(job_payload->>'under_process_to_date', '')::date,
      NULLIF(job_payload->>'customs_hold_from_date', '')::date,
      NULLIF(job_payload->>'customs_hold_to_date', '')::date,
      NULLIF(job_payload->>'completed_from_date', '')::date,
      NULLIF(job_payload->>'completed_to_date', '')::date,
      job_payload->>'trade_mode',
      NULLIF(job_payload->>'trade_term', ''),
      NULLIF(job_payload->>'invoice_number', ''),
      NULLIF(job_payload->>'job_number', ''),
      NULLIF(job_payload->>'transport_mode', ''),
      target_shipper_name,
      NULLIF(job_payload->>'consignee_name', ''),
      NULLIF(job_payload->>'consignor_name', ''),
      NULLIF(job_payload->>'pol_aol', ''),
      NULLIF(job_payload->>'pod_aod', ''),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(job_payload->'vessel_flight_numbers')),
        ARRAY[]::text[]
      ),
      NULLIF(job_payload->>'mbl_mawb', ''),
      NULLIF(job_payload->>'hbl_hawb', ''),
      NULLIF(job_payload->>'bl_awb_date', '')::date,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(job_payload->'assigned_admin_user_ids')::uuid),
        ARRAY[]::uuid[]
      ),
      NULLIF(job_payload->>'progress_percent', '')::integer,
      NULLIF(job_payload->>'progress_step', '')::integer,
      NULLIF(job_payload->>'progress_color_hex', ''),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(job_payload->'documents')),
        ARRAY[]::text[]
      ),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(job_payload->'internal_documents')),
        ARRAY[]::text[]
      ),
      NULLIF(job_payload->>'notes', '')
    );
  ELSE
    PERFORM public.update_accessible_shipment_job(
      requester_email, target_job_id, job_payload
    );
  END IF;

  PERFORM public.replace_accessible_shipment_documents(
    requester_email, target_job_id, COALESCE(documents_payload, '[]'::jsonb)
  );
  PERFORM public.replace_accessible_shipment_tracking_events(
    requester_email, target_job_id, COALESCE(events_payload, '[]'::jsonb)
  );

  RETURN target_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_accessible_shipment_job(text, uuid, jsonb, jsonb, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_accessible_shipment_job(text, uuid, jsonb, jsonb, jsonb, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
