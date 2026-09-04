/*
  Add customer-visible cargo volume details.

  LCL stores PKG, Kgs and M3. FCL container rows use separate length and type
  values so the table can display consistent volume summaries.
*/

ALTER TABLE public.shipment_jobs
  ADD COLUMN cargo_details jsonb NOT NULL DEFAULT
    '{"package_count":null,"gross_weight_kg":null,"volume_m3":null}'::jsonb,
  ADD CONSTRAINT shipment_jobs_cargo_details_object_check
    CHECK (jsonb_typeof(cargo_details) = 'object');

UPDATE public.shipment_jobs AS job
SET booking_details = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'booking_number', booking->>'booking_number',
    'containers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'length', CASE WHEN upper(container->>'size') ~ '^20' THEN '20' WHEN upper(container->>'size') ~ '^40' THEN '40' ELSE '' END,
        'type', CASE WHEN upper(container->>'size') LIKE '%DRY%' THEN 'Dry' WHEN upper(container->>'size') LIKE '%HQ%' THEN 'HQ' WHEN upper(container->>'size') LIKE '%RF%' THEN 'RF' WHEN upper(container->>'size') LIKE '%FR%' THEN 'FR' WHEN upper(container->>'size') LIKE '%OT%' THEN 'OT' ELSE '' END,
        'quantity', container->'quantity'
      )) FROM jsonb_array_elements(booking->'containers') AS container
    ), '[]'::jsonb)
  )) FROM jsonb_array_elements(job.booking_details) AS booking
), '[]'::jsonb)
WHERE jsonb_array_length(job.booking_details) > 0;

DROP FUNCTION public.list_accessible_shipment_booking_details(text);
DROP FUNCTION public.set_shipment_booking_details(text, uuid, jsonb);
DROP FUNCTION public.save_accessible_shipment_job_with_booking_details(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer, jsonb
);

CREATE FUNCTION public.list_accessible_shipment_booking_details(requester_email text)
RETURNS TABLE (id uuid, booking_details jsonb, cargo_details jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT job.id, job.booking_details, job.cargo_details
  FROM public.shipment_jobs AS job
  INNER JOIN public.list_accessible_shipment_jobs(requester_email) AS accessible
    ON accessible.id = job.id
  WHERE job.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.list_accessible_shipment_booking_details(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_booking_details(text) TO authenticated, service_role;

CREATE FUNCTION public.set_shipment_booking_details(
  requester_email text, target_job_id uuid, new_booking_details jsonb,
  new_cargo_details jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
  target_transport_mode text;
  booking_item jsonb;
  container_item jsonb;
  package_count numeric;
  gross_weight numeric;
  volume numeric;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role INTO requester_record
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;
  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot save cargo details' USING ERRCODE = '42501';
  END IF;

  SELECT shipper_name, transport_mode INTO target_shipper_name, target_transport_mode
  FROM public.shipment_jobs WHERE id = target_job_id AND deleted_at IS NULL;
  IF target_shipper_name IS NULL OR NOT public.can_requester_access_shipment_shipper(
    requester_record.id, requester_record.email, requester_record.role, target_shipper_name
  ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipment' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(new_booking_details, '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(new_cargo_details, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Cargo details have an invalid shape' USING ERRCODE = '22023';
  END IF;

  IF target_transport_mode = 'lcl' THEN
    BEGIN
      package_count := (new_cargo_details->>'package_count')::numeric;
      gross_weight := (new_cargo_details->>'gross_weight_kg')::numeric;
      volume := (new_cargo_details->>'volume_m3')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'LCL volume values must be numeric' USING ERRCODE = '22023';
    END;
    IF package_count IS NULL OR package_count <= 0 OR package_count <> trunc(package_count)
      OR gross_weight IS NULL OR gross_weight <= 0
      OR volume IS NULL OR volume <= 0 THEN
      RAISE EXCEPTION 'LCL requires positive PKG, Kgs and M3 values' USING ERRCODE = '22023';
    END IF;
    new_booking_details := '[]'::jsonb;
  ELSIF target_transport_mode = 'fcl' THEN
    IF jsonb_array_length(COALESCE(new_booking_details, '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'FCL requires at least one booking' USING ERRCODE = '22023';
    END IF;
    FOR booking_item IN SELECT value FROM jsonb_array_elements(new_booking_details)
    LOOP
      IF NULLIF(trim(booking_item->>'booking_number'), '') IS NULL
        OR jsonb_typeof(booking_item->'containers') <> 'array'
        OR jsonb_array_length(booking_item->'containers') = 0 THEN
        RAISE EXCEPTION 'Each FCL booking requires a number and containers' USING ERRCODE = '22023';
      END IF;
      FOR container_item IN SELECT value FROM jsonb_array_elements(booking_item->'containers')
      LOOP
        IF container_item->>'length' NOT IN ('20', '40')
          OR container_item->>'type' NOT IN ('Dry', 'HQ', 'RF', 'FR', 'OT')
          OR COALESCE(container_item->>'quantity', '') !~ '^[1-9][0-9]*$' THEN
          RAISE EXCEPTION 'Invalid FCL container length, type or quantity' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END LOOP;
    new_cargo_details := '{"package_count":null,"gross_weight_kg":null,"volume_m3":null}'::jsonb;
  ELSE
    new_booking_details := '[]'::jsonb;
    new_cargo_details := '{"package_count":null,"gross_weight_kg":null,"volume_m3":null}'::jsonb;
  END IF;

  UPDATE public.shipment_jobs
  SET booking_details = COALESCE(new_booking_details, '[]'::jsonb),
      cargo_details = COALESCE(new_cargo_details, '{}'::jsonb)
  WHERE id = target_job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_shipment_booking_details(text, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shipment_booking_details(text, uuid, jsonb, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shipment_notification_snapshot(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT jsonb_object_agg(item.key, item.value)
    FROM public.shipment_jobs AS job, LATERAL jsonb_each(to_jsonb(job)) AS item
    WHERE job.id = target_id AND item.key = ANY(ARRAY[
      'booking_details', 'cargo_details', 'invoice_number', 'job_number',
      'trade_mode', 'trade_term', 'transport_mode', 'consignee_name',
      'consignor_name', 'pol_aol', 'pod_aod', 'vessel_flight_numbers',
      'mbl_mawb', 'hbl_hawb', 'bl_awb_date', 'progress_percent',
      'progress_step', 'progress_total_steps'
    ])
  ), '{}'::jsonb) || jsonb_build_object('tracking_history', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('date', event_date, 'location', location, 'description', description)
      ORDER BY sort_order, event_date, description, location)
    FROM public.shipment_tracking_events WHERE shipment_job_id = target_id AND deleted_at IS NULL
  ), '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job_with_booking_details(
  requester_email text,
  target_job_id uuid,
  job_payload jsonb,
  documents_payload jsonb,
  events_payload jsonb,
  create_new boolean,
  total_steps integer,
  booking_details jsonb,
  cargo_details jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  saved_job_id uuid;
  existing_progress_step integer;
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
    -- Serialize concurrent edits before taking the before-snapshot.
    PERFORM 1 FROM public.shipment_jobs AS job
    WHERE job.id = target_job_id AND job.id IN (
      SELECT accessible.id FROM public.list_accessible_shipment_jobs(requester_email) AS accessible
    ) FOR UPDATE;
    previous_values := public.shipment_notification_snapshot(target_job_id);
    SELECT NULLIF(trim(event.description), '')
    INTO previous_tracking_status
    FROM public.shipment_tracking_events AS event
    WHERE event.shipment_job_id = target_job_id
      AND event.deleted_at IS NULL
      AND event.event_date IS NOT NULL
      AND NULLIF(trim(event.description), '') IS NOT NULL
    ORDER BY
      event.event_date DESC,
      event.sort_order DESC,
      event.created_at DESC
    LIMIT 1;

    SELECT
      shipment.progress_step,
      CASE
        WHEN shipment.progress_percent = 100 THEN 'delivered'
        ELSE COALESCE(previous_tracking_status, shipment.status)
      END
    INTO existing_progress_step, previous_display_status
    FROM public.shipment_jobs AS shipment
    WHERE shipment.id = target_job_id
      AND shipment.deleted_at IS NULL;

    PERFORM public.set_shipment_progress_total_steps(
      requester_email,
      target_job_id,
      CASE
        WHEN total_steps IS NULL THEN NULL
        ELSE GREATEST(total_steps, COALESCE(existing_progress_step, 1))
      END
    );
  END IF;

  saved_job_id := public.save_accessible_shipment_job(
    requester_email,
    target_job_id,
    job_payload,
    documents_payload,
    events_payload,
    create_new
  );

  PERFORM public.set_shipment_progress_total_steps(
    requester_email,
    target_job_id,
    total_steps
  );

  PERFORM public.set_shipment_booking_details(
    requester_email, saved_job_id, booking_details, cargo_details
  );
  current_values := public.shipment_notification_snapshot(saved_job_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'field', item.key, 'before', previous_values->item.key, 'after', item.value
  ) ORDER BY item.key), '[]'::jsonb)
  INTO changed_values
  FROM jsonb_each(current_values) AS item
  WHERE previous_values->item.key IS DISTINCT FROM item.value
    AND NOT (create_new AND item.value IN ('null'::jsonb, '[]'::jsonb, '""'::jsonb));

  SELECT NULLIF(trim(event.description), '')
  INTO current_tracking_status
  FROM public.shipment_tracking_events AS event
  WHERE event.shipment_job_id = saved_job_id
    AND event.deleted_at IS NULL
    AND event.event_date IS NOT NULL
    AND NULLIF(trim(event.description), '') IS NOT NULL
  ORDER BY
    event.event_date DESC,
    event.sort_order DESC,
    event.created_at DESC
  LIMIT 1;

  SELECT CASE
    WHEN shipment.progress_percent = 100 THEN 'delivered'
    ELSE COALESCE(current_tracking_status, shipment.status)
  END
  INTO current_display_status
  FROM public.shipment_jobs AS shipment
  WHERE shipment.id = saved_job_id
    AND shipment.deleted_at IS NULL;

  notification_previous_status := CASE
    WHEN create_new THEN '__created__'
    WHEN previous_tracking_status IS NULL
      AND current_tracking_status IS NOT NULL
      THEN '__status_set__'
    WHEN previous_display_status IS DISTINCT FROM current_display_status
      THEN COALESCE(previous_display_status, '__updated__')
    ELSE '__updated__'
  END;

  INSERT INTO public.shipment_notifications (
    recipient_user_id,
    shipment_job_id,
    previous_status,
    current_status,
    awb_bl_number,
    origin,
    destination,
    change_details
  )
  SELECT
    app_user.id,
    shipment.id,
    notification_previous_status,
    COALESCE(current_display_status, shipment.status),
    COALESCE(
      NULLIF(trim(shipment.hbl_hawb), ''),
      NULLIF(trim(shipment.mbl_mawb), ''),
      NULLIF(trim(shipment.invoice_number), '')
    ),
    NULLIF(trim(shipment.pol_aol), ''),
    NULLIF(trim(shipment.pod_aod), ''),
    changed_values
  FROM public.shipment_jobs AS shipment
  INNER JOIN public.app_users AS app_user
    ON app_user.role = 'normal'
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
    AND app_user.approval_status = 'approved'
    AND shipment.shipper_name IS NOT NULL
    AND lower(trim(app_user.shipper_name)) =
      lower(trim(shipment.shipper_name))
  WHERE shipment.id = saved_job_id
    AND shipment.deleted_at IS NULL;

  RETURN saved_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_accessible_shipment_job_with_booking_details(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_accessible_shipment_job_with_booking_details(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer, jsonb, jsonb
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Keep existing template customizations; broaden only the old schedule wording.
UPDATE public.email_templates
SET subject_template = replace(subject_template, '船積みスケジュール更新', '出荷案件情報更新'),
    text_template = replace(text_template, '船積みスケジュールが更新', '出荷案件情報が更新'),
    html_template = replace(html_template, '船積みスケジュールが更新', '出荷案件情報が更新')
WHERE template_key = 'shipment_status_update';


NOTIFY pgrst, 'reload schema';
