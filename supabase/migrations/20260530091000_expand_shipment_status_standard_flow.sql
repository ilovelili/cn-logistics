ALTER TABLE shipment_jobs
  DROP CONSTRAINT IF EXISTS shipment_jobs_status_check;

ALTER TABLE shipment_jobs
  ADD CONSTRAINT shipment_jobs_status_check
  CHECK (
    status IN (
      'under_process',
      'customs_hold',
      'completed',
      'pickup',
      'warehouse_in',
      'customs_origin',
      'terminal_in',
      'departure',
      'arrival',
      'customs_destination',
      'destination_warehouse_in',
      'delivery'
    )
  );

UPDATE shipment_jobs
SET status = 'pickup'
WHERE status = 'under_process';

UPDATE shipment_jobs
SET status = 'customs_destination'
WHERE status = 'customs_hold';

UPDATE shipment_jobs
SET status = 'delivery'
WHERE status = 'completed';
