/*
  # Add write policies for tracking_events and parcels

  ## Summary
  Adds INSERT and UPDATE policies to allow the admin portal (running as anon in demo mode)
  to write tracking events and update parcel status.

  ## Changes
  - tracking_events: Add INSERT policy for anon role
  - parcels: Add UPDATE policy for anon role (status field updates)

  ## Note
  This is a demo/PoC environment. In production these policies would be restricted
  to authenticated admin users only.
*/

CREATE POLICY "Allow anon insert tracking events"
  ON tracking_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update parcel status"
  ON parcels
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
