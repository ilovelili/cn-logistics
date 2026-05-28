/*
  # Document soft delete RPC

  Lets active admins and super admins soft-delete accessible shipment document
  records without relying on direct table updates from the client.
*/

ALTER TABLE shipment_documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE OR REPLACE FUNCTION soft_delete_accessible_shipment_document(
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
    RAISE EXCEPTION 'Only admins can delete shipment documents';
  END IF;

  SELECT
    shipment_documents.id,
    shipment_jobs.company_name
  INTO target_record
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.deleted_at IS NULL
  LIMIT 1;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'Shipment document was not found';
  END IF;

  IF NOT can_requester_access_shipment_company(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_record.company_name
  ) THEN
    RAISE EXCEPTION 'Admin cannot delete this company document';
  END IF;

  UPDATE shipment_documents
  SET
    deleted_at = now(),
    deleted_by = requester_record.email,
    updated_at = now()
  WHERE id = target_document_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment document was not deleted';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION soft_delete_accessible_shipment_document(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_accessible_shipment_document(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
