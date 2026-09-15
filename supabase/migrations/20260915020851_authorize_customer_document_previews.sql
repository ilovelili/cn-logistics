/*
  Authorize document previews independently from download approval.

  Customer users may preview customer-scope documents for shipments they can
  access. Internal documents remain admin-only. The storage path is returned
  only to the trusted Edge Function, which exchanges it for a short-lived URL.
*/

CREATE OR REPLACE FUNCTION public.get_previewable_shipment_document(
  target_document_id uuid
)
RETURNS TABLE(storage_path text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT document.storage_path
  FROM public.shipment_documents AS document
  JOIN public.shipment_jobs AS job
    ON job.id = document.shipment_job_id
  JOIN public.app_users AS requester
    ON lower(trim(requester.email)) = public.current_app_user_email()
  WHERE document.id = target_document_id
    AND document.deleted_at IS NULL
    AND NULLIF(trim(document.storage_path), '') IS NOT NULL
    AND requester.role IN ('normal', 'admin', 'super_admin')
    AND requester.is_active
    AND requester.deleted_at IS NULL
    AND (
      requester.role IN ('admin', 'super_admin')
      OR (requester.role = 'normal' AND document.scope = 'customer')
    )
    AND public.can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      job.shipper_name
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_previewable_shipment_document(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_previewable_shipment_document(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_previewable_shipment_document_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT document.id
  FROM public.shipment_documents AS document
  JOIN public.shipment_jobs AS job
    ON job.id = document.shipment_job_id
  JOIN public.app_users AS requester
    ON lower(trim(requester.email)) = public.current_app_user_email()
  WHERE document.deleted_at IS NULL
    AND (
      NULLIF(trim(document.storage_path), '') IS NOT NULL
      OR NULLIF(trim(document.file_url), '') IS NOT NULL
    )
    AND requester.role IN ('normal', 'admin', 'super_admin')
    AND requester.is_active
    AND requester.deleted_at IS NULL
    AND (
      requester.role IN ('admin', 'super_admin')
      OR (requester.role = 'normal' AND document.scope = 'customer')
    )
    AND public.can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      job.shipper_name
    );
$$;

REVOKE ALL ON FUNCTION public.list_previewable_shipment_document_ids()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_previewable_shipment_document_ids()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
