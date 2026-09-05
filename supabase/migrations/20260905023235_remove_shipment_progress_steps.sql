/* Remove the redundant shipment progress-step model end to end. */

SET lock_timeout = '5s';

DROP FUNCTION public.save_accessible_shipment_job_with_booking_details(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer, jsonb, jsonb
);
DROP FUNCTION IF EXISTS public.save_accessible_shipment_job_with_progress_total(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer
);
DROP FUNCTION IF EXISTS public.list_accessible_shipment_progress_totals(text);
DROP FUNCTION IF EXISTS public.set_shipment_progress_total_steps(text, uuid, integer);

DROP FUNCTION public.list_accessible_shipment_jobs(text);
CREATE FUNCTION public.list_accessible_shipment_jobs(requester_email text)
RETURNS TABLE(
  id uuid, shipper_name text, status text,
  under_process_from_date date, under_process_to_date date,
  customs_hold_from_date date, customs_hold_to_date date,
  completed_from_date date, completed_to_date date,
  trade_mode text, trade_term text, invoice_number text, job_number text,
  transport_mode text, consignee_name text, consignor_name text,
  pol_aol text, pod_aod text, vessel_flight_numbers text[],
  mbl_mawb text, hbl_hawb text, bl_awb_date date,
  assigned_admin_user_ids uuid[], progress_percent integer,
  progress_color_hex text, documents text[], internal_documents text[],
  notes text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
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
    job.id, job.shipper_name, job.status,
    job.under_process_from_date, job.under_process_to_date,
    job.customs_hold_from_date, job.customs_hold_to_date,
    job.completed_from_date, job.completed_to_date,
    job.trade_mode, job.trade_term, job.invoice_number, job.job_number,
    job.transport_mode, job.consignee_name, job.consignor_name,
    job.pol_aol, job.pod_aod, job.vessel_flight_numbers,
    job.mbl_mawb, job.hbl_hawb, job.bl_awb_date,
    job.assigned_admin_user_ids, job.progress_percent,
    job.progress_color_hex, job.documents, job.internal_documents,
    job.notes, job.created_at, job.updated_at
  FROM public.shipment_jobs AS job
  CROSS JOIN requester
  WHERE job.shipper_name IS NOT NULL
    AND job.deleted_at IS NULL
    AND public.can_requester_access_shipment_shipper(
      requester.id, requester.email, requester.role, job.shipper_name
    )
  ORDER BY GREATEST(
    COALESCE(job.under_process_from_date, DATE '0001-01-01'),
    COALESCE(job.customs_hold_from_date, DATE '0001-01-01'),
    COALESCE(job.completed_from_date, DATE '0001-01-01'),
    job.updated_at::date
  ) DESC;
$$;
REVOKE ALL ON FUNCTION public.list_accessible_shipment_jobs(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_jobs(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_accessible_shipment_job(
  requester_email text, target_job_id uuid, job_payload jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_record record;
  target_shipper_name text := NULLIF(job_payload->>'shipper_name', '');
BEGIN
  SELECT app_users.id, app_users.email, app_users.role INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;
  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot update shipment jobs'
      USING ERRCODE = '42501';
  END IF;

  SELECT job.id, job.shipper_name INTO target_record
  FROM public.shipment_jobs AS job WHERE job.id = target_job_id LIMIT 1;
  IF target_record.id IS NULL THEN RAISE EXCEPTION 'Shipment job not found'; END IF;
  IF target_record.shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id, requester_record.email, requester_record.role,
      target_record.shipper_name
    )
    OR target_shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id, requester_record.email, requester_record.role,
      target_shipper_name
    ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipper'
      USING ERRCODE = '42501';
  END IF;
  IF job_payload->>'status' NOT IN (
    'under_process', 'customs_hold', 'completed', 'pickup', 'warehouse_in',
    'customs_origin', 'terminal_in', 'departure', 'arrival',
    'customs_destination', 'destination_warehouse_in', 'delivery', 'delivered'
  ) THEN RAISE EXCEPTION 'Unsupported shipment status'; END IF;

  UPDATE public.shipment_jobs SET
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
    vessel_flight_numbers = COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(job_payload->'vessel_flight_numbers')
    ), '{}'::text[]),
    mbl_mawb = NULLIF(job_payload->>'mbl_mawb', ''),
    hbl_hawb = NULLIF(job_payload->>'hbl_hawb', ''),
    bl_awb_date = NULLIF(job_payload->>'bl_awb_date', '')::date,
    assigned_admin_user_ids = COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(job_payload->'assigned_admin_user_ids')::uuid
    ), '{}'::uuid[]),
    progress_percent = NULLIF(job_payload->>'progress_percent', '')::integer,
    progress_color_hex = NULLIF(job_payload->>'progress_color_hex', ''),
    documents = COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(job_payload->'documents')
    ), '{}'::text[]),
    internal_documents = COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(job_payload->'internal_documents')
    ), '{}'::text[]),
    notes = NULLIF(job_payload->>'notes', '')
  WHERE id = target_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job(
  requester_email text, target_job_id uuid, job_payload jsonb,
  documents_payload jsonb, events_payload jsonb, create_new boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text := NULLIF(job_payload->>'shipper_name', '');
BEGIN
  SELECT app_users.id, app_users.email, app_users.role INTO requester_record
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;
  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot save shipment jobs'
      USING ERRCODE = '42501';
  END IF;
  IF target_shipper_name IS NULL OR NOT public.can_requester_access_shipment_shipper(
    requester_record.id, requester_record.email, requester_record.role,
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
      assigned_admin_user_ids, progress_percent, progress_color_hex,
      documents, internal_documents, notes
    ) VALUES (
      target_job_id, job_payload->>'status',
      NULLIF(job_payload->>'under_process_from_date', '')::date,
      NULLIF(job_payload->>'under_process_to_date', '')::date,
      NULLIF(job_payload->>'customs_hold_from_date', '')::date,
      NULLIF(job_payload->>'customs_hold_to_date', '')::date,
      NULLIF(job_payload->>'completed_from_date', '')::date,
      NULLIF(job_payload->>'completed_to_date', '')::date,
      job_payload->>'trade_mode', NULLIF(job_payload->>'trade_term', ''),
      NULLIF(job_payload->>'invoice_number', ''), NULLIF(job_payload->>'job_number', ''),
      NULLIF(job_payload->>'transport_mode', ''), target_shipper_name,
      NULLIF(job_payload->>'consignee_name', ''), NULLIF(job_payload->>'consignor_name', ''),
      NULLIF(job_payload->>'pol_aol', ''), NULLIF(job_payload->>'pod_aod', ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'vessel_flight_numbers')), ARRAY[]::text[]),
      NULLIF(job_payload->>'mbl_mawb', ''), NULLIF(job_payload->>'hbl_hawb', ''),
      NULLIF(job_payload->>'bl_awb_date', '')::date,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'assigned_admin_user_ids')::uuid), ARRAY[]::uuid[]),
      NULLIF(job_payload->>'progress_percent', '')::integer,
      NULLIF(job_payload->>'progress_color_hex', ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'documents')), ARRAY[]::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'internal_documents')), ARRAY[]::text[]),
      NULLIF(job_payload->>'notes', '')
    );
  ELSE
    PERFORM public.update_accessible_shipment_job(requester_email, target_job_id, job_payload);
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

CREATE OR REPLACE FUNCTION public.shipment_notification_snapshot(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT jsonb_object_agg(item.key, item.value)
    FROM public.shipment_jobs AS job,
      LATERAL jsonb_each(to_jsonb(job)) AS item
    WHERE job.id = target_id AND item.key = ANY(ARRAY[
      'booking_details', 'cargo_details', 'invoice_number', 'job_number',
      'trade_mode', 'trade_term', 'transport_mode', 'consignee_name',
      'consignor_name', 'pol_aol', 'pod_aod', 'vessel_flight_numbers',
      'mbl_mawb', 'hbl_hawb', 'bl_awb_date', 'progress_percent'
    ])
  ), '{}'::jsonb) || jsonb_build_object(
    'tracking_history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', event.event_date, 'location', event.location,
        'description', event.description
      ) ORDER BY event.sort_order, event.event_date, event.description, event.location)
      FROM public.shipment_tracking_events AS event
      WHERE event.shipment_job_id = target_id AND event.deleted_at IS NULL
    ), '[]'::jsonb),
    'customer_documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', document.name, 'storage_path', document.storage_path
      ) ORDER BY document.name, document.storage_path)
      FROM public.shipment_documents AS document
      WHERE document.shipment_job_id = target_id
        AND document.scope = 'customer' AND document.deleted_at IS NULL
        AND document.storage_path IS NOT NULL
    ), '[]'::jsonb)
  );
$$;

CREATE FUNCTION public.save_accessible_shipment_job_with_booking_details(
  requester_email text, target_job_id uuid, job_payload jsonb,
  documents_payload jsonb, events_payload jsonb, create_new boolean,
  booking_details jsonb, cargo_details jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  saved_job_id uuid;
  previous_tracking_status text;
  previous_display_status text;
  current_tracking_status text;
  current_display_status text;
  notification_previous_status text;
  previous_values jsonb := '{}'::jsonb;
  current_values jsonb;
  changed_values jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_users AS operator
    WHERE lower(trim(operator.email)) = lower(trim(requester_email))
      AND operator.role IN ('admin', 'super_admin')
      AND operator.is_active AND operator.deleted_at IS NULL
      AND public.authenticated_caller_can_assume_email(operator.email)
  ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot save shipments'
      USING ERRCODE = '42501';
  END IF;
  IF NOT create_new THEN
    PERFORM 1 FROM public.shipment_jobs AS job
    WHERE job.id = target_job_id AND job.id IN (
      SELECT accessible.id
      FROM public.list_accessible_shipment_jobs(requester_email) AS accessible
    ) FOR UPDATE;
    previous_values := public.shipment_notification_snapshot(target_job_id);
    SELECT NULLIF(trim(event.description), '') INTO previous_tracking_status
    FROM public.shipment_tracking_events AS event
    WHERE event.shipment_job_id = target_job_id AND event.deleted_at IS NULL
      AND event.event_date IS NOT NULL
      AND NULLIF(trim(event.description), '') IS NOT NULL
    ORDER BY event.event_date DESC, event.sort_order DESC, event.created_at DESC
    LIMIT 1;
    SELECT CASE WHEN shipment.progress_percent = 100 THEN 'delivered'
      ELSE COALESCE(previous_tracking_status, shipment.status) END
    INTO previous_display_status
    FROM public.shipment_jobs AS shipment
    WHERE shipment.id = target_job_id AND shipment.deleted_at IS NULL;
  END IF;

  saved_job_id := public.save_accessible_shipment_job(
    requester_email, target_job_id, job_payload, documents_payload,
    events_payload, create_new
  );
  PERFORM public.set_shipment_booking_details(
    requester_email, saved_job_id, booking_details, cargo_details
  );
  current_values := public.shipment_notification_snapshot(saved_job_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'field', item.key, 'before', previous_values->item.key, 'after', item.value
  ) ORDER BY item.key), '[]'::jsonb) INTO changed_values
  FROM jsonb_each(current_values) AS item
  WHERE previous_values->item.key IS DISTINCT FROM item.value
    AND NOT (create_new AND item.value IN ('null'::jsonb, '[]'::jsonb, '""'::jsonb));

  SELECT NULLIF(trim(event.description), '') INTO current_tracking_status
  FROM public.shipment_tracking_events AS event
  WHERE event.shipment_job_id = saved_job_id AND event.deleted_at IS NULL
    AND event.event_date IS NOT NULL
    AND NULLIF(trim(event.description), '') IS NOT NULL
  ORDER BY event.event_date DESC, event.sort_order DESC, event.created_at DESC
  LIMIT 1;
  SELECT CASE WHEN shipment.progress_percent = 100 THEN 'delivered'
    ELSE COALESCE(current_tracking_status, shipment.status) END
  INTO current_display_status
  FROM public.shipment_jobs AS shipment
  WHERE shipment.id = saved_job_id AND shipment.deleted_at IS NULL;

  notification_previous_status := CASE
    WHEN create_new THEN '__created__'
    WHEN previous_tracking_status IS NULL AND current_tracking_status IS NOT NULL
      THEN '__status_set__'
    WHEN previous_display_status IS DISTINCT FROM current_display_status
      THEN COALESCE(previous_display_status, '__updated__')
    ELSE '__updated__'
  END;
  INSERT INTO public.shipment_notifications (
    recipient_user_id, shipment_job_id, previous_status, current_status,
    awb_bl_number, origin, destination, change_details
  )
  SELECT app_user.id, shipment.id, notification_previous_status,
    COALESCE(current_display_status, shipment.status),
    COALESCE(NULLIF(trim(shipment.hbl_hawb), ''),
      NULLIF(trim(shipment.mbl_mawb), ''),
      NULLIF(trim(shipment.invoice_number), '')),
    NULLIF(trim(shipment.pol_aol), ''), NULLIF(trim(shipment.pod_aod), ''),
    changed_values
  FROM public.shipment_jobs AS shipment
  INNER JOIN public.app_users AS app_user
    ON app_user.role = 'normal' AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
    AND app_user.approval_status = 'approved'
    AND shipment.shipper_name IS NOT NULL
    AND lower(trim(app_user.shipper_name)) = lower(trim(shipment.shipper_name))
  WHERE shipment.id = saved_job_id AND shipment.deleted_at IS NULL;
  RETURN saved_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_accessible_shipment_job_with_booking_details(
  text, uuid, jsonb, jsonb, jsonb, boolean, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_accessible_shipment_job_with_booking_details(
  text, uuid, jsonb, jsonb, jsonb, boolean, jsonb, jsonb
) TO authenticated, service_role;

ALTER TABLE public.shipment_jobs
  DROP CONSTRAINT IF EXISTS shipment_jobs_progress_step_check,
  DROP CONSTRAINT IF EXISTS shipment_jobs_progress_total_steps_check,
  DROP COLUMN IF EXISTS progress_step,
  DROP COLUMN IF EXISTS progress_total_steps;

NOTIFY pgrst, 'reload schema';
