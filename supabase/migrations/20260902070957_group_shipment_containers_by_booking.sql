/*
  Group container rows under repeatable booking numbers. Existing values from
  the initial single-booking implementation are preserved as one booking group.
*/

ALTER TABLE public.shipment_jobs
  ADD COLUMN IF NOT EXISTS booking_details jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.shipment_jobs
SET booking_details = jsonb_build_array(
  jsonb_build_object(
    'booking_number', COALESCE(booking_number, ''),
    'containers', COALESCE(container_details, '[]'::jsonb)
  )
)
WHERE booking_number IS NOT NULL
   OR jsonb_array_length(COALESCE(container_details, '[]'::jsonb)) > 0;

DROP FUNCTION IF EXISTS public.save_accessible_shipment_job_with_booking_details(
  text, uuid, jsonb, jsonb, jsonb, boolean, integer, text, jsonb
);
DROP FUNCTION IF EXISTS public.set_shipment_booking_details(text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.list_accessible_shipment_booking_details(text);

ALTER TABLE public.shipment_jobs
  DROP COLUMN IF EXISTS booking_number,
  DROP COLUMN IF EXISTS container_details;

ALTER TABLE public.shipment_jobs
  DROP CONSTRAINT IF EXISTS shipment_jobs_booking_details_array_check;

ALTER TABLE public.shipment_jobs
  ADD CONSTRAINT shipment_jobs_booking_details_array_check
    CHECK (jsonb_typeof(booking_details) = 'array');

CREATE FUNCTION public.list_accessible_shipment_booking_details(
  requester_email text
)
RETURNS TABLE (
  id uuid,
  booking_details jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT job.id, job.booking_details
  FROM public.shipment_jobs AS job
  INNER JOIN public.list_accessible_shipment_jobs(requester_email) AS accessible
    ON accessible.id = job.id
  WHERE job.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipment_booking_details(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_booking_details(text)
  TO authenticated, service_role;

CREATE FUNCTION public.set_shipment_booking_details(
  requester_email text,
  target_job_id uuid,
  new_booking_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
  booking_item jsonb;
  container_item jsonb;
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
    RAISE EXCEPTION 'The authenticated operator cannot save booking details'
      USING ERRCODE = '42501';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM public.shipment_jobs
  WHERE shipment_jobs.id = target_job_id
    AND shipment_jobs.deleted_at IS NULL;

  IF target_shipper_name IS NULL OR NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipment'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(new_booking_details, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Booking details must be an array'
      USING ERRCODE = '22023';
  END IF;

  FOR booking_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(new_booking_details, '[]'::jsonb))
  LOOP
    IF jsonb_typeof(booking_item) <> 'object'
      OR NULLIF(trim(booking_item->>'booking_number'), '') IS NULL
      OR jsonb_typeof(booking_item->'containers') <> 'array'
      OR jsonb_array_length(booking_item->'containers') = 0 THEN
      RAISE EXCEPTION 'Each booking requires a number and containers'
        USING ERRCODE = '22023';
    END IF;

    FOR container_item IN
      SELECT value FROM jsonb_array_elements(booking_item->'containers')
    LOOP
      IF jsonb_typeof(container_item) <> 'object'
        OR NULLIF(trim(container_item->>'size'), '') IS NULL
        OR NULLIF(container_item->>'quantity', '') IS NULL
        OR (container_item->>'quantity') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION 'Each container requires a size and positive quantity'
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.shipment_jobs
  SET booking_details = COALESCE(new_booking_details, '[]'::jsonb)
  WHERE id = target_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_shipment_booking_details(text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shipment_booking_details(text, uuid, jsonb)
  TO authenticated, service_role;

CREATE FUNCTION public.save_accessible_shipment_job_with_booking_details(
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
SET search_path = ''
AS $$
DECLARE
  saved_job_id uuid;
BEGIN
  saved_job_id := public.save_accessible_shipment_job_with_progress_total(
    requester_email,
    target_job_id,
    job_payload,
    documents_payload,
    events_payload,
    create_new,
    total_steps
  );

  PERFORM public.set_shipment_booking_details(
    requester_email,
    saved_job_id,
    booking_details
  );

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
