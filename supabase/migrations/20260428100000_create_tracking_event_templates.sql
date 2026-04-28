/*
  # Shipment tracking event templates

  Stores the standard tracking flow in the database so admins can manage the
  template rows outside the frontend code.
*/

CREATE TABLE IF NOT EXISTS shipment_tracking_event_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_shipment_tracking_event_templates_updated_at
  ON shipment_tracking_event_templates;
CREATE TRIGGER set_shipment_tracking_event_templates_updated_at
  BEFORE UPDATE ON shipment_tracking_event_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE shipment_tracking_event_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_tracking_event_templates'
      AND policyname = 'Anyone can view active shipment tracking event templates'
  ) THEN
    CREATE POLICY "Anyone can view active shipment tracking event templates"
      ON shipment_tracking_event_templates FOR SELECT
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_tracking_event_templates'
      AND policyname = 'Anon can insert shipment tracking event templates in demo'
  ) THEN
    CREATE POLICY "Anon can insert shipment tracking event templates in demo"
      ON shipment_tracking_event_templates FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_tracking_event_templates'
      AND policyname = 'Anon can update shipment tracking event templates in demo'
  ) THEN
    CREATE POLICY "Anon can update shipment tracking event templates in demo"
      ON shipment_tracking_event_templates FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

INSERT INTO shipment_tracking_event_templates (
  name,
  description,
  sort_order,
  is_active
)
VALUES
  ('pickup', '貨物を集荷しました', 10, true),
  ('warehouse_in', '倉庫へ入庫しました', 20, true),
  ('customs_origin', '通関手続き中です', 30, true),
  ('terminal_in', '航空会社貨物ターミナル/港湾ターミナルへ搬入しました', 40, true),
  ('departure', '航空便/本船が出発しました', 50, true),
  ('arrival', '目的港/到着空港に到着しました', 60, true),
  ('customs_destination', '輸入通関手続き中です', 70, true),
  ('destination_warehouse_in', '現地倉庫へ入庫しました', 80, true),
  ('delivery', '配達中です', 90, true)
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

CREATE INDEX IF NOT EXISTS idx_tracking_event_templates_active_order
  ON shipment_tracking_event_templates(is_active, sort_order);

NOTIFY pgrst, 'reload schema';
