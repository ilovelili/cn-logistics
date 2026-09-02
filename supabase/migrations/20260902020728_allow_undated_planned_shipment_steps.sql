/*
  A tracking row with a description and no event date represents a planned
  flow step. Only dated rows are treated as completed shipment statuses.
*/

ALTER TABLE public.shipment_tracking_events
  ALTER COLUMN event_date DROP NOT NULL;
