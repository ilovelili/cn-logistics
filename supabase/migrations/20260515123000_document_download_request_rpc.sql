/*
  # Document download request RPC

  Lets an accessible user request customer-document download approval through
  the same company scoping used by the read RPCs.
*/

CREATE OR REPLACE FUNCTION request_accessible_shipment_document_download(
  requester_email text,
  target_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_record record;
  target_company_name text;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('normal', 'admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only active users can request document downloads';
  END IF;

  SELECT shipment_jobs.company_name
  INTO target_company_name
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND shipment_documents.approval_status IN ('not_requested', 'rejected')
  LIMIT 1;

  IF target_company_name IS NULL THEN
    RAISE EXCEPTION 'Requestable customer document was not found';
  END IF;

  IF NOT can_requester_access_shipment_company(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_company_name
  ) THEN
    RAISE EXCEPTION 'User cannot request this company document';
  END IF;

  UPDATE shipment_documents
  SET
    approval_status = 'pending',
    approved_at = NULL,
    approved_by = NULL,
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = target_document_id;
END;
$$;

REVOKE ALL ON FUNCTION request_accessible_shipment_document_download(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_accessible_shipment_document_download(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
