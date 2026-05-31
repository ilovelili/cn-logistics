ALTER TABLE shipment_tracking_event_templates
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tracking_event_templates_deleted_at
  ON shipment_tracking_event_templates(deleted_at);

ALTER TABLE shipment_tracking_event_templates
  DROP CONSTRAINT IF EXISTS shipment_tracking_event_templates_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_event_templates_active_name_unique
  ON shipment_tracking_event_templates(name)
  WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
