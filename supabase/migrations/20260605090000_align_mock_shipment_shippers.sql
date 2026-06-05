/*
  # Align mock shipment shippers with registered shippers

  Older demo shipment rows use fictional shipper names such as Taipei
  Electronics. Remap only seeded mock shipment rows whose shipper does not
  exist in the current 荷主 list so 出荷案件管理 > 案件一覧 matches 荷主登録.
*/

WITH available_shippers AS (
  SELECT
    distinct_shippers.shipper_name,
    row_number() OVER (ORDER BY lower(distinct_shippers.shipper_name)) AS shipper_index,
    count(*) OVER () AS shipper_count
  FROM (
    SELECT DISTINCT ON (lower(trim(app_users.shipper_name)))
      trim(app_users.shipper_name) AS shipper_name
    FROM app_users
    WHERE app_users.role = 'normal'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
      AND app_users.approval_status = 'approved'
      AND NULLIF(trim(app_users.shipper_name), '') IS NOT NULL
    ORDER BY lower(trim(app_users.shipper_name)), app_users.created_at, app_users.email
  ) distinct_shippers
),
unmatched_mock_jobs AS (
  SELECT
    shipment_jobs.id,
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
    AND NOT EXISTS (
      SELECT 1
      FROM app_users
      WHERE app_users.role = 'normal'
        AND app_users.is_active = true
        AND app_users.deleted_at IS NULL
        AND app_users.approval_status = 'approved'
        AND NULLIF(trim(app_users.shipper_name), '') IS NOT NULL
        AND lower(trim(app_users.shipper_name)) = lower(trim(COALESCE(shipment_jobs.shipper_name, '')))
    )
)
UPDATE shipment_jobs
SET
  shipper_name = available_shippers.shipper_name,
  updated_at = now()
FROM unmatched_mock_jobs
JOIN available_shippers
  ON available_shippers.shipper_index =
    ((unmatched_mock_jobs.job_index - 1) % available_shippers.shipper_count) + 1
WHERE shipment_jobs.id = unmatched_mock_jobs.id;
