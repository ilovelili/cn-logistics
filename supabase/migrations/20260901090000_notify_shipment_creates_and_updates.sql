/*
  # Notify customers after every shipment save

  The previous trigger only ran when shipment_jobs.status changed. That meant
  new shipments and detail-only updates never queued an email. Notifications
  are now created by the atomic shipment-save RPC after documents and tracking
  events have been replaced, so their wording reflects the saved history.
*/

DROP TRIGGER IF EXISTS create_shipment_status_notifications_after_update
  ON public.shipment_jobs;

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
  previous_display_status text;
  current_display_status text;
  notification_previous_status text;
BEGIN
  IF NOT create_new THEN
    SELECT CASE
      WHEN shipment.progress_percent = 100 THEN 'delivered'
      ELSE COALESCE(
        (
          SELECT NULLIF(trim(event.description), '')
          FROM public.shipment_tracking_events AS event
          WHERE event.shipment_job_id = target_job_id
            AND event.deleted_at IS NULL
            AND event.event_date IS NOT NULL
            AND NULLIF(trim(event.description), '') IS NOT NULL
          ORDER BY
            event.event_date DESC,
            event.sort_order DESC,
            event.created_at DESC
          LIMIT 1
        ),
        shipment.status
      )
    END
    INTO previous_display_status
    FROM public.shipment_jobs AS shipment
    WHERE shipment.id = target_job_id
      AND shipment.deleted_at IS NULL;
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

  SELECT CASE
    WHEN shipment.progress_percent = 100 THEN 'delivered'
    ELSE COALESCE(
      (
        SELECT NULLIF(trim(event.description), '')
        FROM public.shipment_tracking_events AS event
        WHERE event.shipment_job_id = saved_job_id
          AND event.deleted_at IS NULL
          AND event.event_date IS NOT NULL
          AND NULLIF(trim(event.description), '') IS NOT NULL
        ORDER BY
          event.event_date DESC,
          event.sort_order DESC,
          event.created_at DESC
        LIMIT 1
      ),
      shipment.status
    )
  END
  INTO current_display_status
  FROM public.shipment_jobs AS shipment
  WHERE shipment.id = saved_job_id
    AND shipment.deleted_at IS NULL;

  notification_previous_status := CASE
    WHEN create_new THEN '__created__'
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
