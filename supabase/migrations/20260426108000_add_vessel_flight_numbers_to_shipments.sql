/*
  # Add vessel/flight numbers to shipment jobs

  Stores one or more vessel or flight numbers so direct shipments can keep one
  leg and transshipment routes can add additional legs.
*/

ALTER TABLE shipment_jobs
  ADD COLUMN IF NOT EXISTS vessel_flight_numbers text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_shipment_jobs_vessel_flight_numbers
  ON shipment_jobs USING gin (vessel_flight_numbers);

NOTIFY pgrst, 'reload schema';
