/*
  Add authorized soft deletion for shipment jobs.

  Deleted jobs are hidden from the accessible shipment list. Their documents
  and tracking events are soft-deleted in the same transaction so they cannot
  remain visible through their respective registers.
*/

ALTER TABLE public.shipment_jobs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE INDEX IF NOT EXISTS idx_shipment_jobs_deleted_at
  ON public.shipment_jobs(deleted_at);

CREATE OR REPLACE FUNCTION public.list_accessible_shipment_jobs(
  requester_email text
)
RETURNS TABLE(
  id uuid,
  shipper_name text,
  status text,
  under_process_from_date date,
  under_process_to_date date,
  customs_hold_from_date date,
  customs_hold_to_date date,
  completed_from_date date,
  completed_to_date date,
  trade_mode text,
  trade_term text,
  invoice_number text,
  job_number text,
  transport_mode text,
  consignee_name text,
  consignor_name text,
  pol_aol text,
  pod_aod text,
  vessel_flight_numbers text[],
  mbl_mawb text,
  hbl_hawb text,
  bl_awb_date date,
  assigned_admin_user_ids uuid[],
  progress_percent integer,
  progress_step integer,
  progress_color_hex text,
  documents text[],
  internal_documents text[],
  notes text,
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
      AND public.authenticated_caller_can_assume_email(app_users.email)
    LIMIT 1
  )
  SELECT
    shipment_jobs.id,
    shipment_jobs.shipper_name,
    shipment_jobs.status,
    shipment_jobs.under_process_from_date,
    shipment_jobs.under_process_to_date,
    shipment_jobs.customs_hold_from_date,
    shipment_jobs.customs_hold_to_date,
    shipment_jobs.completed_from_date,
    shipment_jobs.completed_to_date,
    shipment_jobs.trade_mode,
    shipment_jobs.trade_term,
    shipment_jobs.invoice_number,
    shipment_jobs.job_number,
    shipment_jobs.transport_mode,
    shipment_jobs.consignee_name,
    shipment_jobs.consignor_name,
    shipment_jobs.pol_aol,
    shipment_jobs.pod_aod,
    shipment_jobs.vessel_flight_numbers,
    shipment_jobs.mbl_mawb,
    shipment_jobs.hbl_hawb,
    shipment_jobs.bl_awb_date,
    shipment_jobs.assigned_admin_user_ids,
    shipment_jobs.progress_percent,
    shipment_jobs.progress_step,
    shipment_jobs.progress_color_hex,
    shipment_jobs.documents,
    shipment_jobs.internal_documents,
    shipment_jobs.notes,
    shipment_jobs.created_at,
    shipment_jobs.updated_at
  FROM public.shipment_jobs
  CROSS JOIN requester
  WHERE shipment_jobs.shipper_name IS NOT NULL
    AND shipment_jobs.deleted_at IS NULL
    AND public.can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.shipper_name
    )
  ORDER BY GREATEST(
    COALESCE(shipment_jobs.under_process_from_date, DATE '0001-01-01'),
    COALESCE(shipment_jobs.customs_hold_from_date, DATE '0001-01-01'),
    COALESCE(shipment_jobs.completed_from_date, DATE '0001-01-01'),
    shipment_jobs.updated_at::date
  ) DESC;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipment_jobs(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_jobs(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.soft_delete_accessible_shipment_job(
  requester_email text,
  target_job_id uuid
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
  WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot delete shipment jobs'
      USING ERRCODE = '42501';
  END IF;

  SELECT shipment_jobs.id, shipment_jobs.shipper_name
  INTO target_record
  FROM public.shipment_jobs
  WHERE shipment_jobs.id = target_job_id
    AND shipment_jobs.deleted_at IS NULL
  FOR UPDATE;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'Shipment job was not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF target_record.shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_record.shipper_name
    ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipment job'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.shipment_jobs
  SET
    deleted_at = now(),
    deleted_by = requester_record.email
  WHERE id = target_job_id
    AND deleted_at IS NULL;

  UPDATE public.shipment_documents
  SET
    deleted_at = now(),
    deleted_by = requester_record.email
  WHERE shipment_job_id = target_job_id
    AND deleted_at IS NULL;

  UPDATE public.shipment_tracking_events
  SET deleted_at = now()
  WHERE shipment_job_id = target_job_id
    AND deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_accessible_shipment_job(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_accessible_shipment_job(text, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
