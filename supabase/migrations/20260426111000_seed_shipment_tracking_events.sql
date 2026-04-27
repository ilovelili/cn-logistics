/*
  # Seed shipment tracking events

  Adds DHL-style daily tracking examples to representative demo shipments.
*/

WITH sample_events(invoice_number, shipper_name, event_date, location, description, sort_order) AS (
  VALUES
    ('ABC-123', 'aaa Japan', DATE '2026-03-25', 'NARITA - JAPAN', '貨物を受領しました', 1),
    ('ABC-123', 'aaa Japan', DATE '2026-03-26', 'NARITA - JAPAN', '輸出通関手続き中です', 2),
    ('ABC-123', 'aaa Japan', DATE '2026-03-27', 'NEW YORK - USA', '現地配送施設に到着しました', 3),
    ('ABC-123', 'aaa Japan', DATE '2026-03-28', 'NEW YORK - USA', '配達完了', 4),
    (NULL, 'ccc China', DATE '2026-04-15', 'SHANGHAI - CHINA', '貨物が集荷されました', 1),
    (NULL, 'ccc China', DATE '2026-04-16', 'SHANGHAI - CHINA', '輸出港へ搬入されました', 2),
    (NULL, 'ccc China', DATE '2026-04-18', 'TOKYO - JAPAN', '到着港で通関書類を確認中です', 3),
    (NULL, 'ccc China', DATE '2026-04-19', 'TOKYO - JAPAN', '通関保留中です。追加確認を実施しています', 4),
    (NULL, 'ddd UK', DATE '2026-04-18', 'FELIXSTOWE - UK', '本船へ積載されました', 1),
    (NULL, 'ddd UK', DATE '2026-04-22', 'BUSAN - KOREA', '中継港に到着しました', 2),
    (NULL, 'ddd UK', DATE '2026-04-23', 'BUSAN - KOREA', '接続便へ積み替え済みです', 3),
    (NULL, 'ddd UK', DATE '2026-04-26', 'MANILA - PHILIPPINES', '配達完了', 4),
    ('CN-0005', 'Shenzhen Supply Ltd.', DATE '2026-04-02', 'SHENZHEN - CHINA', '貨物が倉庫へ入庫しました', 1),
    ('CN-0005', 'Shenzhen Supply Ltd.', DATE '2026-04-03', 'SHENZHEN - CHINA', '輸出通関が完了しました', 2),
    ('CN-0005', 'Shenzhen Supply Ltd.', DATE '2026-04-05', 'YOKOHAMA - JAPAN', '到着後の通関確認中です', 3),
    ('CN-0005', 'Shenzhen Supply Ltd.', DATE '2026-04-06', 'YOKOHAMA - JAPAN', '通関保留中です', 4),
    ('CN-0012', 'Yokohama Pharma', DATE '2026-04-09', 'NARITA - JAPAN', '貨物が集荷されました', 1),
    ('CN-0012', 'Yokohama Pharma', DATE '2026-04-10', 'NARITA - JAPAN', '航空会社へ引き渡しました', 2),
    ('CN-0012', 'Yokohama Pharma', DATE '2026-04-11', 'TORONTO - CANADA', '現地配送施設に到着しました', 3),
    ('CN-0012', 'Yokohama Pharma', DATE '2026-04-12', 'TORONTO - CANADA', '配達完了', 4),
    ('CN-0022', 'Qingdao Tools', DATE '2026-04-19', 'QINGDAO - CHINA', '貨物を受領しました', 1),
    ('CN-0022', 'Qingdao Tools', DATE '2026-04-20', 'QINGDAO - CHINA', '本船出港待ちです', 2),
    ('CN-0022', 'Qingdao Tools', DATE '2026-04-22', 'NAGOYA - JAPAN', '到着港に搬入されました', 3),
    ('CN-0022', 'Qingdao Tools', DATE '2026-04-23', 'NAGOYA - JAPAN', '輸入通関手続き中です', 4),
    ('CN-0030', 'Okinawa Marine', DATE '2026-04-27', 'NAHA - JAPAN', '貨物が集荷されました', 1),
    ('CN-0030', 'Okinawa Marine', DATE '2026-04-28', 'HONOLULU - USA', '現地配送施設に到着しました', 2),
    ('CN-0030', 'Okinawa Marine', DATE '2026-04-29', 'HONOLULU - USA', '配達予定を調整中です', 3)
)
INSERT INTO shipment_tracking_events (
  shipment_job_id,
  event_date,
  location,
  description,
  sort_order
)
SELECT
  shipment_jobs.id,
  sample_events.event_date,
  sample_events.location,
  sample_events.description,
  sample_events.sort_order
FROM sample_events
JOIN shipment_jobs
  ON shipment_jobs.shipper_name = sample_events.shipper_name
  AND (
    shipment_jobs.invoice_number = sample_events.invoice_number
    OR (
      shipment_jobs.invoice_number IS NULL
      AND sample_events.invoice_number IS NULL
    )
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM shipment_tracking_events existing
  WHERE existing.shipment_job_id = shipment_jobs.id
    AND existing.event_date = sample_events.event_date
    AND existing.description = sample_events.description
    AND existing.deleted_at IS NULL
);
