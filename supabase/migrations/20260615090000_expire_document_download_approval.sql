CREATE OR REPLACE FUNCTION list_accessible_shipment_documents(requester_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  scope text,
  name text,
  storage_path text,
  file_url text,
  approval_status text,
  rejection_reason text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    shipment_documents.id,
    shipment_documents.shipment_job_id,
    shipment_documents.scope,
    shipment_documents.name,
    CASE
      WHEN requester.role = 'normal'
        AND shipment_documents.scope = 'customer'
        AND NOT (
          shipment_documents.approval_status = 'approved'
          AND shipment_documents.approved_at IS NOT NULL
          AND shipment_documents.approved_at > now() - interval '3 days'
        )
        THEN NULL
      ELSE shipment_documents.storage_path
    END,
    shipment_documents.file_url,
    shipment_documents.approval_status,
    shipment_documents.rejection_reason,
    shipment_documents.approved_at,
    shipment_documents.approved_by,
    shipment_documents.created_at,
    shipment_documents.updated_at
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  CROSS JOIN requester
  WHERE shipment_jobs.shipper_name IS NOT NULL
    AND shipment_documents.deleted_at IS NULL
    AND (
      requester.role <> 'normal'
      OR shipment_documents.scope = 'customer'
    )
    AND can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.shipper_name
    )
  ORDER BY shipment_documents.created_at ASC, shipment_documents.id ASC;
$$;

REVOKE ALL ON FUNCTION list_accessible_shipment_documents(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accessible_shipment_documents(text) TO anon, authenticated;

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
  target_shipper_name text;
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

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM shipment_documents
  JOIN shipment_jobs
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

  IF NOT can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'User cannot request this shipper document';
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
