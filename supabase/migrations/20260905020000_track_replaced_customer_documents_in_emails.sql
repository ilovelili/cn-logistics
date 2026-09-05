/*
  Include each customer document's storage path in notification snapshots so a
  replacement uploaded under the same filename is recognized as a change.
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
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', document.name,
          'storage_path', document.storage_path
        )
        ORDER BY document.name, document.storage_path
      )
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

NOTIFY pgrst, 'reload schema';
