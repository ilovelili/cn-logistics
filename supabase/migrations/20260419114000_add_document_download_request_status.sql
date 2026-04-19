/*
  # Document Download Request Status

  Adds an explicit pre-request state so customer documents can move from
  未申請 -> DL申請 -> 承認済み before download.
*/

ALTER TABLE shipment_documents
  DROP CONSTRAINT IF EXISTS shipment_documents_approval_status_check;

ALTER TABLE shipment_documents
  ADD CONSTRAINT shipment_documents_approval_status_check
  CHECK (approval_status IN ('not_requested', 'pending', 'approved', 'rejected'));

ALTER TABLE shipment_documents
  ALTER COLUMN approval_status SET DEFAULT 'not_requested';

UPDATE shipment_documents
SET approval_status = 'not_requested'
WHERE scope = 'customer'
  AND approval_status = 'pending';
