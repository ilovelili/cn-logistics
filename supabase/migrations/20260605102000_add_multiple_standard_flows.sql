/*
  # Multiple shipment standard flows

  Groups standard-flow tracking templates so operators can maintain different
  progress paths such as door-to-door, port-to-port, and airport-to-airport.
*/

ALTER TABLE shipment_tracking_event_templates
  ADD COLUMN IF NOT EXISTS flow_name text NOT NULL DEFAULT 'door_to_door';

UPDATE shipment_tracking_event_templates
SET flow_name = 'door_to_door'
WHERE NULLIF(trim(flow_name), '') IS NULL;

ALTER TABLE shipment_tracking_event_templates
  DROP CONSTRAINT IF EXISTS shipment_tracking_event_templates_flow_name_check;

ALTER TABLE shipment_tracking_event_templates
  ADD CONSTRAINT shipment_tracking_event_templates_flow_name_check
  CHECK (NULLIF(trim(flow_name), '') IS NOT NULL);

DROP INDEX IF EXISTS idx_tracking_event_templates_active_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_event_templates_active_flow_name_unique
  ON shipment_tracking_event_templates(flow_name, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tracking_event_templates_flow_order
  ON shipment_tracking_event_templates(flow_name, is_active, sort_order)
  WHERE deleted_at IS NULL;

INSERT INTO shipment_tracking_event_templates (
  flow_name,
  name,
  description,
  sort_order,
  is_active
)
VALUES
  ('port_to_port', 'customs_origin', '輸出通関手続き中です', 10, true),
  ('port_to_port', 'terminal_in', '港湾ターミナルへ搬入しました', 20, true),
  ('port_to_port', 'departure', '本船が出港しました', 30, true),
  ('port_to_port', 'arrival', '目的港に到着しました', 40, true),
  ('port_to_port', 'customs_destination', '輸入通関手続き中です', 50, true),
  ('airport_to_airport', 'customs_origin', '輸出通関手続き中です', 10, true),
  ('airport_to_airport', 'terminal_in', '航空会社貨物ターミナルへ搬入しました', 20, true),
  ('airport_to_airport', 'departure', '航空便が出発しました', 30, true),
  ('airport_to_airport', 'arrival', '到着空港に到着しました', 40, true),
  ('airport_to_airport', 'customs_destination', '輸入通関手続き中です', 50, true)
ON CONFLICT (flow_name, name) WHERE deleted_at IS NULL DO UPDATE
SET
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
