/*
  # Parcel Management System Schema

  1. New Tables
    - `carriers`
      - `id` (uuid, primary key)
      - `name` (text) - Carrier name (e.g., FedEx, UPS, DHL)
      - `code` (text, unique) - Carrier code
      - `api_endpoint` (text) - API endpoint for integration
      - `is_active` (boolean) - Whether carrier is currently active
      - `created_at` (timestamptz)
    
    - `warehouses`
      - `id` (uuid, primary key)
      - `name` (text) - Warehouse name
      - `code` (text, unique) - Warehouse code
      - `address` (text) - Full address
      - `city` (text)
      - `country` (text)
      - `capacity` (integer) - Total capacity
      - `current_occupancy` (integer) - Current occupancy
      - `created_at` (timestamptz)
    
    - `orders`
      - `id` (uuid, primary key)
      - `order_number` (text, unique) - Order reference number
      - `customer_name` (text)
      - `customer_email` (text)
      - `origin_address` (text)
      - `destination_address` (text)
      - `destination_city` (text)
      - `destination_country` (text)
      - `status` (text) - pending, processing, shipped, delivered, cancelled
      - `total_value` (decimal) - Total order value
      - `currency` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `parcels`
      - `id` (uuid, primary key)
      - `order_id` (uuid, foreign key)
      - `tracking_number` (text, unique)
      - `weight` (decimal) - Weight in kg
      - `length` (decimal) - Dimensions in cm
      - `width` (decimal)
      - `height` (decimal)
      - `status` (text) - created, in_warehouse, in_transit, delivered, returned
      - `warehouse_id` (uuid, foreign key)
      - `carrier_id` (uuid, foreign key)
      - `created_at` (timestamptz)
    
    - `shipments`
      - `id` (uuid, primary key)
      - `shipment_number` (text, unique)
      - `carrier_id` (uuid, foreign key)
      - `origin_warehouse_id` (uuid, foreign key)
      - `destination_address` (text)
      - `status` (text) - pending, picked_up, in_transit, delivered
      - `scheduled_pickup` (timestamptz)
      - `actual_pickup` (timestamptz)
      - `estimated_delivery` (timestamptz)
      - `actual_delivery` (timestamptz)
      - `created_at` (timestamptz)
    
    - `customs_declarations`
      - `id` (uuid, primary key)
      - `parcel_id` (uuid, foreign key)
      - `declaration_number` (text, unique)
      - `description` (text) - Content description
      - `value` (decimal) - Declared value
      - `currency` (text)
      - `hs_code` (text) - Harmonized System code
      - `origin_country` (text)
      - `destination_country` (text)
      - `status` (text) - pending, submitted, approved, rejected, cleared
      - `submitted_at` (timestamptz)
      - `cleared_at` (timestamptz)
      - `created_at` (timestamptz)
    
    - `tracking_events`
      - `id` (uuid, primary key)
      - `parcel_id` (uuid, foreign key)
      - `event_type` (text) - created, received, sorted, in_transit, out_for_delivery, delivered, exception
      - `location` (text)
      - `description` (text)
      - `event_time` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for public read access (demo purposes)
    - Add policies for authenticated insert/update/delete
*/

-- Carriers table
CREATE TABLE IF NOT EXISTS carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  api_endpoint text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view carriers"
  ON carriers FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert carriers"
  ON carriers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update carriers"
  ON carriers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete carriers"
  ON carriers FOR DELETE
  TO authenticated
  USING (true);

-- Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  capacity integer DEFAULT 0,
  current_occupancy integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view warehouses"
  ON warehouses FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert warehouses"
  ON warehouses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update warehouses"
  ON warehouses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete warehouses"
  ON warehouses FOR DELETE
  TO authenticated
  USING (true);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  origin_address text NOT NULL,
  destination_address text NOT NULL,
  destination_city text NOT NULL,
  destination_country text NOT NULL,
  status text DEFAULT 'pending',
  total_value decimal(10,2) DEFAULT 0,
  currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view orders"
  ON orders FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING (true);

-- Parcels table
CREATE TABLE IF NOT EXISTS parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  tracking_number text UNIQUE NOT NULL,
  weight decimal(10,2) DEFAULT 0,
  length decimal(10,2) DEFAULT 0,
  width decimal(10,2) DEFAULT 0,
  height decimal(10,2) DEFAULT 0,
  status text DEFAULT 'created',
  warehouse_id uuid REFERENCES warehouses(id),
  carrier_id uuid REFERENCES carriers(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view parcels"
  ON parcels FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert parcels"
  ON parcels FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update parcels"
  ON parcels FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete parcels"
  ON parcels FOR DELETE
  TO authenticated
  USING (true);

-- Shipments table
CREATE TABLE IF NOT EXISTS shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number text UNIQUE NOT NULL,
  carrier_id uuid REFERENCES carriers(id),
  origin_warehouse_id uuid REFERENCES warehouses(id),
  destination_address text NOT NULL,
  status text DEFAULT 'pending',
  scheduled_pickup timestamptz,
  actual_pickup timestamptz,
  estimated_delivery timestamptz,
  actual_delivery timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shipments"
  ON shipments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert shipments"
  ON shipments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update shipments"
  ON shipments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete shipments"
  ON shipments FOR DELETE
  TO authenticated
  USING (true);

-- Customs declarations table
CREATE TABLE IF NOT EXISTS customs_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid REFERENCES parcels(id) ON DELETE CASCADE,
  declaration_number text UNIQUE NOT NULL,
  description text NOT NULL,
  value decimal(10,2) DEFAULT 0,
  currency text DEFAULT 'USD',
  hs_code text,
  origin_country text NOT NULL,
  destination_country text NOT NULL,
  status text DEFAULT 'pending',
  submitted_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customs_declarations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view customs declarations"
  ON customs_declarations FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert customs declarations"
  ON customs_declarations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customs declarations"
  ON customs_declarations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete customs declarations"
  ON customs_declarations FOR DELETE
  TO authenticated
  USING (true);

-- Tracking events table
CREATE TABLE IF NOT EXISTS tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid REFERENCES parcels(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  location text NOT NULL,
  description text,
  event_time timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tracking events"
  ON tracking_events FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert tracking events"
  ON tracking_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tracking events"
  ON tracking_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete tracking events"
  ON tracking_events FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_parcels_order_id ON parcels(order_id);
CREATE INDEX IF NOT EXISTS idx_parcels_tracking_number ON parcels(tracking_number);
CREATE INDEX IF NOT EXISTS idx_tracking_events_parcel_id ON tracking_events(parcel_id);
CREATE INDEX IF NOT EXISTS idx_customs_declarations_parcel_id ON customs_declarations(parcel_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(status);