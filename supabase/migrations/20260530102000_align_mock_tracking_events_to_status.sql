/*
  # Align mock shipment tracking history with current shipment status

  The original mock tracking rows were written before the standard-flow status
  model existed, so some demo jobs could show a tracking history that had moved
  beyond the job's current status. Rebuild only the seeded demo tracking rows so
  each mock job shows standard-flow events from the first status through its
  current status.
*/

WITH mock_jobs AS (
  SELECT
    shipment_jobs.id,
    shipment_jobs.status,
    COALESCE(shipment_jobs.bl_awb_date, shipment_jobs.created_at::date, CURRENT_DATE) AS base_date,
    UPPER(
      CONCAT_WS(
        ' - ',
        NULLIF(shipment_jobs.pol_aol, ''),
        CASE shipment_jobs.trade_mode
          WHEN 'export' THEN 'JAPAN'
          WHEN 'import' THEN NULL
          ELSE NULL
        END
      )
    ) AS origin_location,
    UPPER(
      CONCAT_WS(
        ' - ',
        NULLIF(shipment_jobs.pod_aod, ''),
        CASE shipment_jobs.trade_mode
          WHEN 'import' THEN 'JAPAN'
          ELSE NULL
        END
      )
    ) AS destination_location
  FROM shipment_jobs
  WHERE shipment_jobs.notes IN (
    'Seeded from customer Excel reference.',
    'Expanded sample shipment job.'
  )
),
soft_deleted_existing AS (
  UPDATE shipment_tracking_events
  SET
    deleted_at = now(),
    updated_at = now()
  FROM mock_jobs
  WHERE shipment_tracking_events.shipment_job_id = mock_jobs.id
    AND shipment_tracking_events.deleted_at IS NULL
  RETURNING shipment_tracking_events.id
),
deleted_count AS (
  SELECT count(*) AS deleted_rows
  FROM soft_deleted_existing
),
standard_flow(status_key, status_label, fallback_description, flow_order) AS (
  VALUES
    ('pickup', '貨物集荷', '貨物を集荷しました', 10),
    ('warehouse_in', '倉庫入庫', '倉庫へ入庫しました', 20),
    ('customs_origin', '輸出通関中', '輸出通関手続き中です', 30),
    ('terminal_in', 'ターミナル搬入', '航空会社貨物ターミナル/港湾ターミナルへ搬入しました', 40),
    ('departure', '出発', '航空便/本船が出発しました', 50),
    ('arrival', '到着', '目的港/到着空港に到着しました', 60),
    ('customs_destination', '輸入通関中', '輸入通関手続き中です', 70),
    ('destination_warehouse_in', '現地倉庫入庫', '現地倉庫へ入庫しました', 80),
    ('delivery', '配達中', '配達中です', 90),
    ('delivered', '配達完了', '配達が完了しました', 100)
),
job_status_rank AS (
  SELECT
    mock_jobs.id,
    CASE mock_jobs.status
      WHEN 'under_process' THEN 10
      WHEN 'customs_hold' THEN 70
      WHEN 'completed' THEN 100
      WHEN 'pickup' THEN 10
      WHEN 'warehouse_in' THEN 20
      WHEN 'customs_origin' THEN 30
      WHEN 'terminal_in' THEN 40
      WHEN 'departure' THEN 50
      WHEN 'arrival' THEN 60
      WHEN 'customs_destination' THEN 70
      WHEN 'destination_warehouse_in' THEN 80
      WHEN 'delivery' THEN 90
      WHEN 'delivered' THEN 100
      ELSE 10
    END AS current_flow_order,
    mock_jobs.base_date,
    mock_jobs.origin_location,
    mock_jobs.destination_location
  FROM mock_jobs
),
events_to_insert AS (
  SELECT
    job_status_rank.id AS shipment_job_id,
    (job_status_rank.base_date + ((standard_flow.flow_order / 10) - 1))::date AS event_date,
    COALESCE(
      NULLIF(
        CASE
          WHEN standard_flow.flow_order <= 50 THEN job_status_rank.origin_location
          ELSE job_status_rank.destination_location
        END,
        ''
      ),
      'LOCATION TBD'
    ) AS location,
    COALESCE(
      shipment_tracking_event_templates.description,
      standard_flow.fallback_description
    ) AS description,
    standard_flow.flow_order AS sort_order
  FROM job_status_rank
  CROSS JOIN deleted_count
  JOIN standard_flow
    ON standard_flow.flow_order <= job_status_rank.current_flow_order
  LEFT JOIN shipment_tracking_event_templates
    ON shipment_tracking_event_templates.name = standard_flow.status_key
)
INSERT INTO shipment_tracking_events (
  shipment_job_id,
  event_date,
  location,
  description,
  sort_order
)
SELECT
  events_to_insert.shipment_job_id,
  events_to_insert.event_date,
  events_to_insert.location,
  events_to_insert.description,
  events_to_insert.sort_order
FROM events_to_insert;
