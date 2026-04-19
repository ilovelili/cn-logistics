/*
  # Shipment Documents Approval Flow

  Adds document records for each shipment job so customer-facing documents can
  be approved by admins before download. The existing shipment_jobs document
  arrays remain as the Excel-style checklist input, while this table stores the
  operational state for each document.
*/

CREATE TABLE IF NOT EXISTS shipment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_job_id uuid NOT NULL REFERENCES shipment_jobs(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('customer', 'internal')),
  name text NOT NULL,
  storage_path text,
  file_url text,
  approval_status text NOT NULL DEFAULT 'not_requested'
    CHECK (approval_status IN ('not_requested', 'pending', 'approved', 'rejected')),
  rejection_reason text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_job_id, scope, name)
);

DROP TRIGGER IF EXISTS set_shipment_documents_updated_at ON shipment_documents;
CREATE TRIGGER set_shipment_documents_updated_at
  BEFORE UPDATE ON shipment_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE shipment_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_documents'
      AND policyname = 'Anyone can view shipment documents'
  ) THEN
    CREATE POLICY "Anyone can view shipment documents"
      ON shipment_documents FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_documents'
      AND policyname = 'Anon can insert shipment documents in demo'
  ) THEN
    CREATE POLICY "Anon can insert shipment documents in demo"
      ON shipment_documents FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_documents'
      AND policyname = 'Anon can update shipment documents in demo'
  ) THEN
    CREATE POLICY "Anon can update shipment documents in demo"
      ON shipment_documents FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_documents'
      AND policyname = 'Anon can delete shipment documents in demo'
  ) THEN
    CREATE POLICY "Anon can delete shipment documents in demo"
      ON shipment_documents FOR DELETE
      TO anon
      USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_documents_job_id ON shipment_documents(shipment_job_id);
CREATE INDEX IF NOT EXISTS idx_shipment_documents_scope ON shipment_documents(scope);
CREATE INDEX IF NOT EXISTS idx_shipment_documents_approval_status ON shipment_documents(approval_status);

INSERT INTO shipment_documents (shipment_job_id, scope, name, approval_status, file_url, approved_at, approved_by)
SELECT
  job.id,
  'customer',
  document_name,
  CASE
    WHEN job.invoice_number = 'ABC-123' AND document_name = '入庫票'
      THEN 'approved'
    ELSE 'not_requested'
  END,
  CASE
    WHEN job.invoice_number = 'ABC-123' AND document_name = '入庫票'
      THEN '/sample-document.pdf'
    ELSE NULL
  END,
  CASE
    WHEN job.invoice_number = 'ABC-123' AND document_name = '入庫票'
      THEN now()
    ELSE NULL
  END,
  CASE
    WHEN job.invoice_number = 'ABC-123' AND document_name = '入庫票'
      THEN 'admin'
    ELSE NULL
  END
FROM shipment_jobs job
CROSS JOIN LATERAL unnest(job.documents) AS document_name
ON CONFLICT (shipment_job_id, scope, name) DO NOTHING;

INSERT INTO shipment_documents (shipment_job_id, scope, name, approval_status)
SELECT job.id, 'internal', document_name, 'approved'
FROM shipment_jobs job
CROSS JOIN LATERAL unnest(job.internal_documents) AS document_name
ON CONFLICT (shipment_job_id, scope, name) DO NOTHING;
