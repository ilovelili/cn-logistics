-- Snapshot customer-visible changes before queueing emails. Never include internal notes/documents.
ALTER TABLE public.shipment_notifications ADD COLUMN change_details jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.shipment_notification_email_deliveries ADD COLUMN change_details jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE FUNCTION public.shipment_notification_snapshot(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT jsonb_object_agg(item.key, item.value)
    FROM public.shipment_jobs AS job,
      LATERAL jsonb_each(to_jsonb(job)) AS item
    WHERE job.id = target_id AND item.key = ANY(ARRAY['booking_details', 'invoice_number', 'job_number', 'trade_mode', 'trade_term', 'transport_mode', 'consignee_name', 'consignor_name', 'pol_aol', 'pod_aod', 'vessel_flight_numbers', 'mbl_mawb', 'hbl_hawb', 'bl_awb_date', 'progress_percent', 'progress_step', 'progress_total_steps'])
  ), '{}'::jsonb) || jsonb_build_object('tracking_history', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('date', event_date, 'location', location, 'description', description)
      ORDER BY sort_order, event_date, description, location)
    FROM public.shipment_tracking_events WHERE shipment_job_id = target_id AND deleted_at IS NULL
  ), '[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.shipment_notification_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipment_notification_snapshot(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job_with_booking_details(
  requester_email text,
  target_job_id uuid,
  job_payload jsonb,
  documents_payload jsonb,
  events_payload jsonb,
  create_new boolean,
  total_steps integer,
  booking_details jsonb
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

  PERFORM public.set_shipment_booking_details(requester_email, saved_job_id, booking_details);
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
  text, uuid, jsonb, jsonb, jsonb, boolean, integer, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_accessible_shipment_job_with_booking_details(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer, jsonb
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Keep existing template customizations; broaden only the old schedule wording.
UPDATE public.email_templates
SET subject_template = replace(subject_template, '船積みスケジュール更新', '出荷案件情報更新'),
    text_template = replace(text_template, '船積みスケジュールが更新', '出荷案件情報が更新'),
    html_template = replace(html_template, '船積みスケジュールが更新', '出荷案件情報が更新')
WHERE template_key = 'shipment_status_update';

CREATE OR REPLACE FUNCTION public.queue_shipment_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.shipment_notification_email_deliveries (
    notification_id,
    recipient_email,
    previous_status,
    current_status,
    awb_bl_number,
    origin,
    destination,
    change_details
  )
  SELECT
    NEW.id,
    app_user.email,
    NEW.previous_status,
    NEW.current_status,
    NEW.awb_bl_number,
    NEW.origin,
    NEW.destination,
    NEW.change_details
  FROM public.app_users AS app_user
  WHERE app_user.id = NEW.recipient_user_id
    AND app_user.role = 'normal'
    AND app_user.approval_status = 'approved'
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_shipment_notification_email()
  FROM PUBLIC, anon, authenticated;


DROP FUNCTION public.claim_shipment_notification_email(uuid);
CREATE OR REPLACE FUNCTION public.claim_shipment_notification_email(
  target_delivery_id uuid
)
RETURNS TABLE (
  id uuid,
  recipient_email text,
  previous_status text,
  current_status text,
  awb_bl_number text,
  origin text,
  destination text,
  change_details jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipment_notification_email_deliveries AS delivery
  SET
    delivery_status = 'sending',
    attempts = delivery.attempts + 1,
    last_error = NULL,
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND (
      delivery.delivery_status IN ('pending', 'failed')
      OR (
        delivery.delivery_status = 'sending'
        AND delivery.updated_at < now() - interval '15 minutes'
      )
    )
    AND delivery.attempts < 5
  RETURNING
    delivery.id,
    delivery.recipient_email,
    delivery.previous_status,
    delivery.current_status,
    delivery.awb_bl_number,
    delivery.origin,
    delivery.destination,
    delivery.change_details;
$$;

REVOKE ALL ON FUNCTION public.claim_shipment_notification_email(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shipment_notification_email(uuid)
  TO service_role;


NOTIFY pgrst, 'reload schema';
