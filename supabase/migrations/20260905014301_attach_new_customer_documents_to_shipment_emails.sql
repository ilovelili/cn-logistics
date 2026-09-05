/*
  Attach customer-facing documents newly added during a shipment save to that
  shipment's notification email. Internal documents remain excluded from both
  the customer-visible change snapshot and email delivery.
*/

CREATE OR REPLACE FUNCTION public.shipment_notification_snapshot(target_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT jsonb_object_agg(item.key, item.value)
    FROM public.shipment_jobs AS job,
      LATERAL jsonb_each(to_jsonb(job)) AS item
    WHERE job.id = target_id
      AND item.key = ANY(ARRAY[
        'booking_details', 'cargo_details', 'invoice_number', 'job_number',
        'trade_mode', 'trade_term', 'transport_mode', 'consignee_name',
        'consignor_name', 'pol_aol', 'pod_aod', 'vessel_flight_numbers',
        'mbl_mawb', 'hbl_hawb', 'bl_awb_date', 'progress_percent',
        'progress_step', 'progress_total_steps'
      ])
  ), '{}'::jsonb)
  || jsonb_build_object(
    'tracking_history', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', event.event_date,
          'location', event.location,
          'description', event.description
        )
        ORDER BY event.sort_order, event.event_date, event.description, event.location
      )
      FROM public.shipment_tracking_events AS event
      WHERE event.shipment_job_id = target_id
        AND event.deleted_at IS NULL
    ), '[]'::jsonb),
    'customer_documents', COALESCE((
      SELECT jsonb_agg(document.name ORDER BY document.name)
      FROM public.shipment_documents AS document
      WHERE document.shipment_job_id = target_id
        AND document.scope = 'customer'
        AND document.deleted_at IS NULL
        AND document.storage_path IS NOT NULL
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.shipment_notification_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipment_notification_snapshot(uuid)
  TO service_role;

ALTER TABLE public.shipment_notification_email_deliveries
  ADD COLUMN shipment_job_id uuid;

UPDATE public.shipment_notification_email_deliveries AS delivery
SET shipment_job_id = notification.shipment_job_id
FROM public.shipment_notifications AS notification
WHERE notification.id = delivery.notification_id;

ALTER TABLE public.shipment_notification_email_deliveries
  ALTER COLUMN shipment_job_id SET NOT NULL,
  ADD CONSTRAINT shipment_notification_email_job_fk
    FOREIGN KEY (shipment_job_id)
    REFERENCES public.shipment_jobs(id)
    ON DELETE CASCADE;

CREATE INDEX shipment_notification_email_job_idx
  ON public.shipment_notification_email_deliveries (shipment_job_id);

CREATE OR REPLACE FUNCTION public.queue_shipment_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.shipment_notification_email_deliveries (
    notification_id,
    shipment_job_id,
    recipient_email,
    previous_status,
    current_status,
    invoice_number,
    awb_bl_number,
    origin,
    destination,
    change_details
  )
  SELECT
    NEW.id,
    NEW.shipment_job_id,
    app_user.email,
    NEW.previous_status,
    NEW.current_status,
    NULLIF(trim(job.invoice_number), ''),
    COALESCE(NULLIF(trim(job.hbl_hawb), ''), NULLIF(trim(job.mbl_mawb), '')),
    NEW.origin,
    NEW.destination,
    NEW.change_details
  FROM public.app_users AS app_user
  JOIN public.shipment_jobs AS job
    ON job.id = NEW.shipment_job_id
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
CREATE FUNCTION public.claim_shipment_notification_email(
  target_delivery_id uuid
)
RETURNS TABLE (
  id uuid,
  shipment_job_id uuid,
  recipient_email text,
  previous_status text,
  current_status text,
  invoice_number text,
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
    delivery.shipment_job_id,
    delivery.recipient_email,
    delivery.previous_status,
    delivery.current_status,
    delivery.invoice_number,
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
