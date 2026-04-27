/*
  # Shipment tracking events

  Adds a daily tracking timeline for shipment jobs. High-level shipment status
  remains unchanged, while these rows describe what happened on each day.
*/

CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_job_id uuid NOT NULL REFERENCES shipment_jobs(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  location text,
  description text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_shipment_tracking_events_updated_at ON shipment_tracking_events;
CREATE TRIGGER set_shipment_tracking_events_updated_at
  BEFORE UPDATE ON shipment_tracking_events
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE shipment_tracking_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_tracking_events'
      AND policyname = 'Anyone can view active shipment tracking events'
  ) THEN
    CREATE POLICY "Anyone can view active shipment tracking events"
      ON shipment_tracking_events FOR SELECT
      USING (deleted_at IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_tracking_events'
      AND policyname = 'Anon can insert shipment tracking events in demo'
  ) THEN
    CREATE POLICY "Anon can insert shipment tracking events in demo"
      ON shipment_tracking_events FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_tracking_events'
      AND policyname = 'Anon can update shipment tracking events in demo'
  ) THEN
    CREATE POLICY "Anon can update shipment tracking events in demo"
      ON shipment_tracking_events FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_job_id
  ON shipment_tracking_events(shipment_job_id);

CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_date
  ON shipment_tracking_events(event_date DESC);

CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_active
  ON shipment_tracking_events(shipment_job_id, event_date DESC)
  WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
