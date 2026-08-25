/*
  # Prevent document download request and approval races

  Repeat each expected-state predicate on the write itself and abort before
  email side effects when another transaction has already changed the row.
*/

CREATE OR REPLACE FUNCTION public.request_accessible_shipment_document_download(
  requester_email text,
  target_document_id uuid
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
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('normal', 'admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only active users can request document downloads';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM public.shipment_documents
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND (
      shipment_documents.approval_status IN ('not_requested', 'rejected')
      OR (
        shipment_documents.approval_status = 'approved'
        AND (
          shipment_documents.approved_at IS NULL
          OR shipment_documents.approved_at <= now() - interval '3 days'
        )
      )
    )
  LIMIT 1;

  IF target_shipper_name IS NULL THEN
    RAISE EXCEPTION 'Requestable customer document was not found';
  END IF;

  IF NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'User cannot request this shipper document';
  END IF;

  UPDATE public.shipment_documents
  SET
    approval_status = 'pending',
    approved_at = NULL,
    approved_by = NULL,
    rejection_reason = NULL,
    download_requested_by_user_id = requester_record.id,
    download_requested_at = now(),
    updated_at = now()
  WHERE id = target_document_id
    AND scope = 'customer'
    AND (
      approval_status IN ('not_requested', 'rejected')
      OR (
        approval_status = 'approved'
        AND (
          approved_at IS NULL
          OR approved_at <= now() - interval '3 days'
        )
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document request state changed; refresh and try again';
  END IF;

  PERFORM public.queue_document_download_request_emails(
    target_document_id,
    requester_record.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_accessible_shipment_document_download(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_accessible_shipment_document_download(text, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_accessible_shipment_document_approval(
  requester_email text,
  target_document_id uuid,
  next_approval_status text
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
  IF next_approval_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported approval status';
  END IF;

  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only admins can approve document download requests';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM public.shipment_documents
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND shipment_documents.approval_status = 'pending'
  LIMIT 1;

  IF target_shipper_name IS NULL THEN
    RAISE EXCEPTION 'Pending customer document request was not found';
  END IF;

  IF NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'Admin cannot approve this shipper document';
  END IF;

  UPDATE public.shipment_documents
  SET
    approval_status = next_approval_status,
    approved_at = CASE
      WHEN next_approval_status = 'approved' THEN now()
      ELSE NULL
    END,
    approved_by = CASE
      WHEN next_approval_status = 'approved' THEN requester_record.email
      ELSE NULL
    END,
    rejection_reason = CASE
      WHEN next_approval_status = 'rejected' THEN ''
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_document_id
    AND scope = 'customer'
    AND approval_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document approval state changed; refresh and try again';
  END IF;

  IF next_approval_status = 'approved' THEN
    PERFORM public.queue_document_download_approved_email(
      target_document_id,
      requester_record.email
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_accessible_shipment_document_approval(text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accessible_shipment_document_approval(text, uuid, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
