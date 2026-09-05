/*
  Swap the standard shipment progress colors:
  - in progress: blue
  - completed: green

  Preserve warning, invalid and alert selections. Only translate the two old
  standard color values for records whose completion state matches them.
*/

UPDATE public.shipment_jobs
SET progress_color_hex = CASE
  WHEN progress_percent = 100 OR status IN ('completed', 'delivered')
    THEN '#059669'
  ELSE '#2563eb'
END
WHERE deleted_at IS NULL
  AND lower(COALESCE(progress_color_hex, '')) IN ('#059669', '#2563eb');
