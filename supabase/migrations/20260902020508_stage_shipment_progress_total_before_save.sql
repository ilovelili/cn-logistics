/*
  Stage a constraint-valid progress total before updating progress_step.

  The shipment_jobs check constraint is evaluated for each UPDATE statement.
  Increasing a flow from 1 to 3 steps previously attempted to save step 2
  while the row still stored total 1, so the inner save failed before the
  wrapper could persist total 3. The staging update remains inside the same
  transaction and uses the existing guarded setter.
*/

CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job_with_progress_total(
  requester_email text,
  target_job_id uuid,
  job_payload jsonb,
  documents_payload jsonb,
  events_payload jsonb,
  create_new boolean,
  total_steps integer
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
BEGIN
  IF NOT create_new THEN
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
    destination
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
    NULLIF(trim(shipment.pod_aod), '')
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

REVOKE ALL ON FUNCTION public.save_accessible_shipment_job_with_progress_total(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_accessible_shipment_job_with_progress_total(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
