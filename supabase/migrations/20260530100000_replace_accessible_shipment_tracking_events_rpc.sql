DROP FUNCTION IF EXISTS replace_accessible_shipment_tracking_events(text, uuid, jsonb);

CREATE OR REPLACE FUNCTION replace_accessible_shipment_tracking_events(
  requester_email text,
  target_job_id uuid,
  events_payload jsonb
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
    RAISE EXCEPTION 'Requester is not allowed to update shipment tracking events';
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

  UPDATE shipment_tracking_events
  SET deleted_at = now()
  WHERE shipment_tracking_events.shipment_job_id = target_job_id
    AND shipment_tracking_events.deleted_at IS NULL;

  INSERT INTO shipment_tracking_events (
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
    event_record.description,
    event_record.sort_order,
    NULL
  FROM jsonb_to_recordset(COALESCE(events_payload, '[]'::jsonb)) AS event_record(
    event_date text,
    location text,
    description text,
    sort_order integer
  )
  WHERE NULLIF(event_record.event_date, '') IS NOT NULL
    AND NULLIF(event_record.description, '') IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION replace_accessible_shipment_tracking_events(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_accessible_shipment_tracking_events(text, uuid, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
