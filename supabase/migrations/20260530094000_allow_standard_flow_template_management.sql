DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_tracking_event_templates'
      AND policyname = 'Anon can view all shipment tracking event templates in demo'
  ) THEN
    CREATE POLICY "Anon can view all shipment tracking event templates in demo"
      ON shipment_tracking_event_templates FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
