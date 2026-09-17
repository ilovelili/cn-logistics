/*
  Keep the approved-shipper catalogue available when an admin creates a job,
  while limiting the admin shipment list to jobs where they are explicitly
  assigned as either Ops or Sales.
*/

SET lock_timeout = '5s';

DROP FUNCTION public.list_accessible_shipment_jobs(text);
CREATE FUNCTION public.list_accessible_shipment_jobs(requester_email text)
RETURNS TABLE(
  id uuid, shipper_name text, status text,
  under_process_from_date date, under_process_to_date date,
  customs_hold_from_date date, customs_hold_to_date date,
  completed_from_date date, completed_to_date date,
  trade_mode text, trade_term text, invoice_number text, job_number text,
  transport_mode text, consignee_name text, consignor_name text,
  pol_aol text, pod_aod text, vessel_flight_numbers text[],
  mbl_mawb text, hbl_hawb text, bl_awb_date date,
  assigned_admin_user_ids uuid[], operations_admin_user_ids uuid[],
  sales_admin_user_ids uuid[], created_by_admin_user_id uuid,
  progress_percent integer, progress_color_hex text, documents text[],
  internal_documents text[], notes text, created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
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
    job.id, job.shipper_name, job.status,
    job.under_process_from_date, job.under_process_to_date,
    job.customs_hold_from_date, job.customs_hold_to_date,
    job.completed_from_date, job.completed_to_date,
    job.trade_mode, job.trade_term, job.invoice_number, job.job_number,
    job.transport_mode, job.consignee_name, job.consignor_name,
    job.pol_aol, job.pod_aod, job.vessel_flight_numbers,
    job.mbl_mawb, job.hbl_hawb, job.bl_awb_date,
    job.assigned_admin_user_ids, job.operations_admin_user_ids,
    job.sales_admin_user_ids, job.created_by_admin_user_id,
    job.progress_percent, job.progress_color_hex, job.documents,
    job.internal_documents, job.notes, job.created_at, job.updated_at
  FROM public.shipment_jobs AS job
  CROSS JOIN requester
  WHERE job.shipper_name IS NOT NULL
    AND job.deleted_at IS NULL
    AND (
      requester.role = 'super_admin'
      OR (
        requester.role = 'admin'
        AND (
          requester.id = ANY(COALESCE(
            job.operations_admin_user_ids,
            ARRAY[]::uuid[]
          ))
          OR requester.id = ANY(COALESCE(
            job.sales_admin_user_ids,
            ARRAY[]::uuid[]
          ))
        )
      )
      OR (
        requester.role = 'normal'
        AND public.can_requester_access_shipment_shipper(
          requester.id,
          requester.email,
          requester.role,
          job.shipper_name
        )
      )
    )
  ORDER BY GREATEST(
    COALESCE(job.under_process_from_date, DATE '0001-01-01'),
    COALESCE(job.customs_hold_from_date, DATE '0001-01-01'),
    COALESCE(job.completed_from_date, DATE '0001-01-01'),
    job.updated_at::date
  ) DESC;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipment_jobs(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_jobs(text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
