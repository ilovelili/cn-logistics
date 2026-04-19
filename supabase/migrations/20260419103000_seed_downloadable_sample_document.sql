/*
  # Downloadable PDF Sample

  Ensures the demo has one approved customer document that downloads a PDF.
*/

UPDATE shipment_documents document
SET
  approval_status = 'approved',
  file_url = '/sample-document.pdf',
  approved_at = COALESCE(document.approved_at, now()),
  approved_by = COALESCE(document.approved_by, 'admin')
FROM shipment_jobs job
WHERE document.shipment_job_id = job.id
  AND job.invoice_number = 'ABC-123'
  AND document.scope = 'customer'
  AND document.name = '入庫票';
