/*
  # Shipment Jobs Refactor

  Refactors the product toward the customer-provided Excel workflow:
  Status, Trade Mode, Trade Term, Invoice#, Transport Mode, Shipper,
  Consignee, POL/AOL, POD/AOD, MBL/MAWB, HBL/HAWB, BL/AWB Date,
  Documents, and Internal Documents.

  Also fixes the previous schema bug where the admin dashboard queried
  parcels.updated_at even though parcels only had created_at.
*/

-- Fix prior schema mismatch used by older admin/dashboard code.
ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_parcels_updated_at ON parcels;
CREATE TRIGGER set_parcels_updated_at
  BEFORE UPDATE ON parcels
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_orders_updated_at ON orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS shipment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'under_process'
    CHECK (status IN ('under_process', 'customs_hold', 'completed')),
  trade_mode text NOT NULL DEFAULT 'export'
    CHECK (trade_mode IN ('export', 'import', 'triangle')),
  trade_term text,
  invoice_number text,
  transport_mode text
    CHECK (transport_mode IS NULL OR transport_mode IN ('air', 'lcl', 'fcl')),
  shipper_name text,
  consignee_name text,
  pol_aol text,
  pod_aod text,
  mbl_mawb text,
  hbl_hawb text,
  bl_awb_date date,
  documents text[] NOT NULL DEFAULT '{}',
  internal_documents text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_shipment_jobs_updated_at ON shipment_jobs;
CREATE TRIGGER set_shipment_jobs_updated_at
  BEFORE UPDATE ON shipment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE shipment_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_jobs'
      AND policyname = 'Anyone can view shipment jobs'
  ) THEN
    CREATE POLICY "Anyone can view shipment jobs"
      ON shipment_jobs FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_jobs'
      AND policyname = 'Anon can insert shipment jobs in demo'
  ) THEN
    CREATE POLICY "Anon can insert shipment jobs in demo"
      ON shipment_jobs FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipment_jobs'
      AND policyname = 'Anon can update shipment jobs in demo'
  ) THEN
    CREATE POLICY "Anon can update shipment jobs in demo"
      ON shipment_jobs FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_jobs_status ON shipment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_shipment_jobs_trade_mode ON shipment_jobs(trade_mode);
CREATE INDEX IF NOT EXISTS idx_shipment_jobs_transport_mode ON shipment_jobs(transport_mode);
CREATE INDEX IF NOT EXISTS idx_shipment_jobs_invoice_number ON shipment_jobs(invoice_number);
CREATE INDEX IF NOT EXISTS idx_shipment_jobs_mbl_mawb ON shipment_jobs(mbl_mawb);
CREATE INDEX IF NOT EXISTS idx_shipment_jobs_hbl_hawb ON shipment_jobs(hbl_hawb);
CREATE INDEX IF NOT EXISTS idx_shipment_jobs_bl_awb_date ON shipment_jobs(bl_awb_date);

INSERT INTO shipment_jobs (
  status,
  trade_mode,
  trade_term,
  invoice_number,
  transport_mode,
  shipper_name,
  consignee_name,
  pol_aol,
  pod_aod,
  mbl_mawb,
  hbl_hawb,
  bl_awb_date,
  documents,
  internal_documents,
  notes
)
VALUES
  (
    'under_process',
    'export',
    'CIF',
    'ABC-123',
    'air',
    'aaa Japan',
    'bbb USA',
    'Narita',
    'NewYork',
    '1234567890',
    '2345678901',
    DATE '2026-03-25',
    ARRAY['入庫票', '輸出許可書', '請求書'],
    ARRAY['請求書'],
    'Seeded from customer Excel reference.'
  ),
  (
    'customs_hold',
    'import',
    'FOB',
    NULL,
    'lcl',
    'ccc China',
    'aaa Japan',
    'Shanghai',
    'Tokyo',
    NULL,
    NULL,
    NULL,
    ARRAY['輸入許可書', 'POD', 'AN', 'HBL', '貨物写真'],
    ARRAY['DN', 'AN', '振込証明'],
    'Seeded from customer Excel reference.'
  ),
  (
    'completed',
    'triangle',
    'DDP',
    NULL,
    'fcl',
    'ddd UK',
    'eee Korea',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    ARRAY[]::text[],
    ARRAY[]::text[],
    'Seeded from customer Excel reference.'
  )
ON CONFLICT DO NOTHING;
