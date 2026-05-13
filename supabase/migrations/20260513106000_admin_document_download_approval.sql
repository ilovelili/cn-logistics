CREATE OR REPLACE FUNCTION update_accessible_shipment_document_approval(
  requester_email text,
  target_document_id uuid,
  next_approval_status text
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
  IF next_approval_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported approval status';
  END IF;

  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only admins can approve document download requests';
  END IF;

  SELECT shipment_jobs.company_name
  INTO target_company_name
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND shipment_documents.approval_status = 'pending'
  LIMIT 1;

  IF target_company_name IS NULL THEN
    RAISE EXCEPTION 'Pending customer document request was not found';
  END IF;

  IF NOT can_requester_access_shipment_company(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_company_name
  ) THEN
    RAISE EXCEPTION 'Admin cannot approve this company document';
  END IF;

  UPDATE shipment_documents
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
  WHERE id = target_document_id;
END;
$$;

REVOKE ALL ON FUNCTION update_accessible_shipment_document_approval(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_accessible_shipment_document_approval(text, uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
