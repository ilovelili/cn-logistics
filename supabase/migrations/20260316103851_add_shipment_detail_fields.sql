/*
  # Add Shipment Detail Fields

  1. Modified Tables
    - `parcels`
      - `master_number` (text) - Master Bill of Lading / AWB number
      - `house_number` (text) - House Bill of Lading / HAWB number
      - `invoice_number` (text) - Commercial invoice number
      - `port_of_loading` (text) - Departure port
      - `transit_port` (text) - Transit/transshipment port
      - `port_of_discharge` (text) - Destination port
      - `cargo_description` (text) - Detailed cargo description
      - `commodity` (text) - Commodity type
      - `incoterm` (text) - Trade term (EXW, FOB, CIF, etc.)
      - `gross_weight` (decimal) - Gross weight in kg
      - `volume` (decimal) - Volume in CBM
      - `pieces` (integer) - Number of pieces
      - `shipper_name` (text) - Shipper/Exporter name
      - `consignee_name` (text) - Consignee/Importer name
      - `notify_party` (text) - Notify party name
      - `vessel_flight` (text) - Vessel/flight name or number
      - `voyage_number` (text) - Voyage or flight number
      - `etd` (timestamptz) - Estimated Time of Departure
      - `eta` (timestamptz) - Estimated Time of Arrival
      - `atd` (timestamptz) - Actual Time of Departure
      - `ata` (timestamptz) - Actual Time of Arrival

  2. New Tables
    - `parcel_documents`
      - `id` (uuid, primary key)
      - `parcel_id` (uuid, foreign key)
      - `document_type` (text) - Type: bill_of_lading, invoice, packing_list, customs_declaration, certificate_of_origin, etc.
      - `document_number` (text) - Document reference number
      - `file_name` (text) - File name
      - `status` (text) - pending, uploaded, verified, rejected
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on parcel_documents
    - Public read, authenticated write policies
*/

-- Add new columns to parcels table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'master_number') THEN
    ALTER TABLE parcels ADD COLUMN master_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'house_number') THEN
    ALTER TABLE parcels ADD COLUMN house_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'invoice_number') THEN
    ALTER TABLE parcels ADD COLUMN invoice_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'port_of_loading') THEN
    ALTER TABLE parcels ADD COLUMN port_of_loading text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'transit_port') THEN
    ALTER TABLE parcels ADD COLUMN transit_port text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'port_of_discharge') THEN
    ALTER TABLE parcels ADD COLUMN port_of_discharge text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'cargo_description') THEN
    ALTER TABLE parcels ADD COLUMN cargo_description text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'commodity') THEN
    ALTER TABLE parcels ADD COLUMN commodity text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'incoterm') THEN
    ALTER TABLE parcels ADD COLUMN incoterm text DEFAULT 'FOB';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'gross_weight') THEN
    ALTER TABLE parcels ADD COLUMN gross_weight decimal(10,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'volume') THEN
    ALTER TABLE parcels ADD COLUMN volume decimal(10,3) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'pieces') THEN
    ALTER TABLE parcels ADD COLUMN pieces integer DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'shipper_name') THEN
    ALTER TABLE parcels ADD COLUMN shipper_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'consignee_name') THEN
    ALTER TABLE parcels ADD COLUMN consignee_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'notify_party') THEN
    ALTER TABLE parcels ADD COLUMN notify_party text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'vessel_flight') THEN
    ALTER TABLE parcels ADD COLUMN vessel_flight text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'voyage_number') THEN
    ALTER TABLE parcels ADD COLUMN voyage_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'etd') THEN
    ALTER TABLE parcels ADD COLUMN etd timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'eta') THEN
    ALTER TABLE parcels ADD COLUMN eta timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'atd') THEN
    ALTER TABLE parcels ADD COLUMN atd timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'parcels' AND column_name = 'ata') THEN
    ALTER TABLE parcels ADD COLUMN ata timestamptz;
  END IF;
END $$;

-- Create parcel_documents table
CREATE TABLE IF NOT EXISTS parcel_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid REFERENCES parcels(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_number text,
  file_name text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE parcel_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view parcel documents"
  ON parcel_documents FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert parcel documents"
  ON parcel_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update parcel documents"
  ON parcel_documents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete parcel documents"
  ON parcel_documents FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_parcel_documents_parcel_id ON parcel_documents(parcel_id);