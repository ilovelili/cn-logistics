/*
  # Hide unapproved document files from normal users

  Normal users can see customer-document rows so they can request approval, but
  file URLs and storage paths are only returned after approval. Admins and super
  admins still receive file metadata for review.
*/

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
        AND shipment_documents.approval_status <> 'approved'
        THEN NULL
      ELSE shipment_documents.storage_path
    END,
    CASE
      WHEN requester.role = 'normal'
        AND shipment_documents.scope = 'customer'
        AND shipment_documents.approval_status <> 'approved'
        THEN NULL
      ELSE shipment_documents.file_url
    END,
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
  WHERE shipment_jobs.company_name IS NOT NULL
    AND (
      requester.role <> 'normal'
      OR shipment_documents.scope = 'customer'
    )
    AND can_requester_access_shipment_company(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.company_name
    )
  ORDER BY shipment_documents.created_at ASC, shipment_documents.id ASC;
$$;

REVOKE ALL ON FUNCTION list_accessible_shipment_documents(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accessible_shipment_documents(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
