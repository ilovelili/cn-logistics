DROP FUNCTION IF EXISTS replace_accessible_shipment_documents(text, uuid, jsonb);

CREATE OR REPLACE FUNCTION replace_accessible_shipment_documents(
  requester_email text,
  target_job_id uuid,
  documents_payload jsonb
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
    RAISE EXCEPTION 'Requester is not allowed to replace shipment documents';
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
    RAISE EXCEPTION 'Requester cannot replace this shipment job document set';
  END IF;

  UPDATE shipment_documents
  SET
    deleted_at = now(),
    deleted_by = requester_record.email,
    updated_at = now()
  WHERE shipment_documents.shipment_job_id = target_job_id
    AND shipment_documents.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(documents_payload, '[]'::jsonb)) AS document_payload
      WHERE document_payload->>'scope' = shipment_documents.scope
        AND document_payload->>'name' = shipment_documents.name
    );

  INSERT INTO shipment_documents (
    shipment_job_id,
    scope,
    name,
    storage_path,
    file_url,
    approval_status,
    rejection_reason,
    approved_at,
    approved_by,
    deleted_at,
    deleted_by
  )
  SELECT
    target_job_id,
    document_payload->>'scope',
    document_payload->>'name',
    NULLIF(document_payload->>'storage_path', ''),
    NULLIF(document_payload->>'file_url', ''),
    COALESCE(NULLIF(document_payload->>'approval_status', ''), 'not_requested'),
    NULLIF(document_payload->>'rejection_reason', ''),
    NULLIF(document_payload->>'approved_at', '')::timestamptz,
    NULLIF(document_payload->>'approved_by', ''),
    NULL,
    NULL
  FROM jsonb_array_elements(COALESCE(documents_payload, '[]'::jsonb)) AS document_payload
  WHERE document_payload->>'scope' IN ('customer', 'internal')
    AND NULLIF(document_payload->>'name', '') IS NOT NULL
  ON CONFLICT (shipment_job_id, scope, name) DO UPDATE
  SET
    storage_path = EXCLUDED.storage_path,
    file_url = EXCLUDED.file_url,
    approval_status = EXCLUDED.approval_status,
    rejection_reason = EXCLUDED.rejection_reason,
    approved_at = EXCLUDED.approved_at,
    approved_by = EXCLUDED.approved_by,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION replace_accessible_shipment_documents(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_accessible_shipment_documents(text, uuid, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
