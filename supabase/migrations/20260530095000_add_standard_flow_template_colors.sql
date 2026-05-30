ALTER TABLE shipment_tracking_event_templates
  ADD COLUMN IF NOT EXISTS color_hex text;

ALTER TABLE shipment_tracking_event_templates
  DROP CONSTRAINT IF EXISTS shipment_tracking_event_templates_color_hex_check;

ALTER TABLE shipment_tracking_event_templates
  ADD CONSTRAINT shipment_tracking_event_templates_color_hex_check
  CHECK (color_hex IS NULL OR color_hex ~* '^#[0-9a-f]{6}$');

UPDATE shipment_tracking_event_templates
SET color_hex = CASE name
  WHEN 'pickup' THEN '#0284c7'
  WHEN 'warehouse_in' THEN '#2563eb'
  WHEN 'customs_origin' THEN '#d97706'
  WHEN 'terminal_in' THEN '#4f46e5'
  WHEN 'departure' THEN '#7c3aed'
  WHEN 'arrival' THEN '#0891b2'
  WHEN 'customs_destination' THEN '#e11d48'
  WHEN 'destination_warehouse_in' THEN '#0d9488'
  WHEN 'delivery' THEN '#65a30d'
  WHEN 'delivered' THEN '#059669'
  ELSE COALESCE(color_hex, '#0891b2')
END
WHERE color_hex IS NULL;

NOTIFY pgrst, 'reload schema';
