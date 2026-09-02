/*
  Preserve the complete selected shipment flow, including planned steps which
  have a description but no completion date yet. Completed-status queries and
  notifications continue to require a non-null event_date.
*/

CREATE OR REPLACE FUNCTION public.list_accessible_shipment_tracking_events(
  requester_email text
)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  event_date date,
  location text,
  description text,
  sort_order integer,
  deleted_at timestamptz,
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
    LIMIT 1
  )
  SELECT
    shipment_tracking_events.id,
    shipment_tracking_events.shipment_job_id,
    shipment_tracking_events.event_date,
    shipment_tracking_events.location,
    shipment_tracking_events.description,
    shipment_tracking_events.sort_order,
    shipment_tracking_events.deleted_at,
    shipment_tracking_events.created_at,
    shipment_tracking_events.updated_at
  FROM public.shipment_tracking_events
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_tracking_events.shipment_job_id
  CROSS JOIN requester
  WHERE shipment_tracking_events.deleted_at IS NULL
    AND shipment_jobs.shipper_name IS NOT NULL
    AND public.can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.shipper_name
    )
  ORDER BY
    shipment_tracking_events.shipment_job_id,
    shipment_tracking_events.sort_order ASC,
    shipment_tracking_events.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.replace_accessible_shipment_tracking_events(
  requester_email text,
  target_job_id uuid,
  events_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_record record;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Requester is not allowed to update shipment tracking events';
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
  THEN
    RAISE EXCEPTION 'Requester cannot update this shipment job';
  END IF;

  UPDATE public.shipment_tracking_events
  SET deleted_at = now()
  WHERE shipment_tracking_events.shipment_job_id = target_job_id
    AND shipment_tracking_events.deleted_at IS NULL;

  INSERT INTO public.shipment_tracking_events (
    shipment_job_id,
    event_date,
    location,
    description,
    sort_order,
    deleted_at
  )
  SELECT
    target_job_id,
    NULLIF(event_record.event_date, '')::date,
    NULLIF(event_record.location, ''),
    trim(event_record.description),
    event_record.sort_order,
    NULL
  FROM jsonb_to_recordset(COALESCE(events_payload, '[]'::jsonb)) AS event_record(
    event_date text,
    location text,
    description text,
    sort_order integer
  )
  WHERE NULLIF(trim(event_record.description), '') IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipment_tracking_events(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_tracking_events(text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_accessible_shipment_tracking_events(text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_accessible_shipment_tracking_events(text, uuid, jsonb)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
