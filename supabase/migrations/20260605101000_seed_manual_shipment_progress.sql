/*
  # Seed manual shipment progress

  Assigns manual progress values to the demo shipment jobs so 案件一覧 uses the
  operator-controlled progress bar instead of inferred colorful status segments.
*/

WITH mock_jobs AS (
  SELECT
    shipment_jobs.id,
    shipment_jobs.status,
    row_number() OVER (
      ORDER BY shipment_jobs.bl_awb_date NULLS LAST,
        shipment_jobs.invoice_number NULLS LAST,
        shipment_jobs.id
    ) AS job_index
  FROM shipment_jobs
  WHERE shipment_jobs.notes IN (
      'Seeded from customer Excel reference.',
      'Expanded sample shipment job.'
    )
)
UPDATE shipment_jobs
SET
  progress_percent = CASE
    WHEN mock_jobs.status IN ('completed', 'delivered') THEN 100
    WHEN mock_jobs.status = 'customs_hold' THEN
      CASE mock_jobs.job_index % 4
        WHEN 0 THEN 45
        WHEN 1 THEN 55
        WHEN 2 THEN 60
        ELSE 70
      END
    ELSE
      CASE mock_jobs.job_index % 5
        WHEN 0 THEN 20
        WHEN 1 THEN 30
        WHEN 2 THEN 40
        WHEN 3 THEN 50
        ELSE 65
      END
  END,
  progress_step = CASE
    WHEN mock_jobs.status IN ('completed', 'delivered') THEN 10
    WHEN mock_jobs.status = 'customs_hold' THEN
      CASE mock_jobs.job_index % 4
        WHEN 0 THEN 5
        WHEN 1 THEN 6
        WHEN 2 THEN 6
        ELSE 7
      END
    ELSE
      CASE mock_jobs.job_index % 5
        WHEN 0 THEN 2
        WHEN 1 THEN 3
        WHEN 2 THEN 4
        WHEN 3 THEN 5
        ELSE 7
      END
  END,
  progress_color_hex = CASE
    WHEN mock_jobs.status IN ('completed', 'delivered') THEN '#059669'
    WHEN mock_jobs.status = 'customs_hold' THEN '#d97706'
    WHEN mock_jobs.job_index % 11 = 0 THEN '#e11d48'
    WHEN mock_jobs.job_index % 7 = 0 THEN '#64748b'
    ELSE '#059669'
  END,
  updated_at = now()
FROM mock_jobs
WHERE shipment_jobs.id = mock_jobs.id;
