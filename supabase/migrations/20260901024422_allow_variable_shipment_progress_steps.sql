ALTER TABLE shipment_jobs
  ADD COLUMN IF NOT EXISTS progress_total_steps integer;

ALTER TABLE shipment_jobs
  DROP CONSTRAINT IF EXISTS shipment_jobs_progress_step_check,
  DROP CONSTRAINT IF EXISTS shipment_jobs_progress_total_steps_check;

ALTER TABLE shipment_jobs
  ADD CONSTRAINT shipment_jobs_progress_step_check
    CHECK (progress_step IS NULL OR progress_step >= 1),
  ADD CONSTRAINT shipment_jobs_progress_total_steps_check
    CHECK (
      progress_total_steps IS NULL
      OR (
        progress_total_steps >= 1
        AND (progress_step IS NULL OR progress_step <= progress_total_steps)
      )
    );

ALTER TABLE shipment_tracking_event_templates
  DROP CONSTRAINT IF EXISTS shipment_tracking_event_templates_status_key_check;

ALTER TABLE shipment_tracking_event_templates
  ADD CONSTRAINT shipment_tracking_event_templates_status_key_check
    CHECK (
      name IN (
        'pickup', 'warehouse_in', 'customs_origin', 'terminal_in', 'departure',
        'arrival', 'customs_destination', 'destination_warehouse_in',
        'delivery', 'delivered'
      )
    ) NOT VALID;

CREATE OR REPLACE FUNCTION public.list_accessible_shipment_progress_totals(
  requester_email text
)
RETURNS TABLE (
  id uuid,
  progress_total_steps integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT shipment_jobs.id, shipment_jobs.progress_total_steps
  FROM public.shipment_jobs
  INNER JOIN public.list_accessible_shipment_jobs(requester_email) accessible
    ON accessible.id = shipment_jobs.id
  WHERE shipment_jobs.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipment_progress_totals(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_progress_totals(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_shipment_progress_total_steps(
  requester_email text,
  target_job_id uuid,
  total_steps integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
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
    RAISE EXCEPTION 'The authenticated operator cannot save shipment progress'
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

  IF total_steps IS NOT NULL AND total_steps < 1 THEN
    RAISE EXCEPTION 'Shipment progress total steps must be at least 1'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.shipment_jobs
  SET progress_total_steps = total_steps
  WHERE id = target_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_shipment_progress_total_steps(text, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shipment_progress_total_steps(text, uuid, integer)
  TO authenticated, service_role;

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
SET search_path = ''
AS $$
DECLARE
  saved_job_id uuid;
BEGIN
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
