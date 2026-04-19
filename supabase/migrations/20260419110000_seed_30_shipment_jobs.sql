/*
  # Expanded Shipment Job Samples

  Adds 27 more sample shipment jobs so the demo has 30 rows total when combined
  with the three customer Excel reference rows from the initial shipment_jobs
  migration.
*/

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
SELECT *
FROM (
  VALUES
    ('under_process', 'export', 'CIF', 'CN-0004', 'air', 'Tokyo Parts Co.', 'Pacific Retail USA', 'Narita', 'Los Angeles', '9182736404', '8182736404', DATE '2026-04-01', ARRAY['入庫票', '輸出許可書', '請求書'], ARRAY['請求書'], 'Expanded sample shipment job.'),
    ('customs_hold', 'import', 'FOB', 'CN-0005', 'lcl', 'Shenzhen Supply Ltd.', 'Kanto Trading', 'Shenzhen', 'Yokohama', '9182736405', '8182736405', DATE '2026-04-02', ARRAY['輸入許可書', 'POD', 'AN', 'HBL'], ARRAY['DN', 'AN'], 'Expanded sample shipment job.'),
    ('completed', 'triangle', 'DDP', 'CN-0006', 'fcl', 'Seoul Components', 'Manila Distribution', 'Busan', 'Manila', '9182736406', '8182736406', DATE '2026-04-03', ARRAY['請求書', 'HBL', '貨物写真'], ARRAY['振込証明'], 'Expanded sample shipment job.'),
    ('under_process', 'export', 'FOB', 'CN-0007', 'air', 'Osaka Machinery', 'Berlin Tech GmbH', 'Kansai', 'Frankfurt', '9182736407', '8182736407', DATE '2026-04-04', ARRAY['入庫票', '請求書'], ARRAY['請求書'], 'Expanded sample shipment job.'),
    ('customs_hold', 'import', 'CFR', 'CN-0008', 'fcl', 'Hamburg Foods', 'Nagoya Market', 'Hamburg', 'Nagoya', '9182736408', '8182736408', DATE '2026-04-05', ARRAY['輸入許可書', 'POD', '貨物写真'], ARRAY['DN', '振込証明'], 'Expanded sample shipment job.'),
    ('completed', 'export', 'CIF', 'CN-0009', 'lcl', 'Kyushu Ceramics', 'Sydney Homeware', 'Hakata', 'Sydney', '9182736409', '8182736409', DATE '2026-04-06', ARRAY['輸出許可書', '請求書', 'POD'], ARRAY['AN'], 'Expanded sample shipment job.'),
    ('under_process', 'import', 'EXW', 'CN-0010', 'air', 'Taipei Electronics', 'Saitama Devices', 'Taipei', 'Haneda', '9182736410', '8182736410', DATE '2026-04-07', ARRAY['AN', 'HBL', '貨物写真'], ARRAY['DN', 'AN'], 'Expanded sample shipment job.'),
    ('customs_hold', 'triangle', 'DAP', 'CN-0011', 'fcl', 'London Apparel', 'Auckland Retail', 'Felixstowe', 'Auckland', '9182736411', '8182736411', DATE '2026-04-08', ARRAY['請求書', 'HBL'], ARRAY['振込証明'], 'Expanded sample shipment job.'),
    ('completed', 'export', 'DDP', 'CN-0012', 'air', 'Yokohama Pharma', 'Toronto Medical', 'Narita', 'Toronto', '9182736412', '8182736412', DATE '2026-04-09', ARRAY['入庫票', '輸出許可書', '請求書'], ARRAY['請求書'], 'Expanded sample shipment job.'),
    ('under_process', 'import', 'FOB', 'CN-0013', 'lcl', 'Ho Chi Minh Textile', 'Chiba Imports', 'Ho Chi Minh', 'Tokyo', '9182736413', '8182736413', DATE '2026-04-10', ARRAY['輸入許可書', 'POD', 'AN'], ARRAY['DN'], 'Expanded sample shipment job.'),
    ('customs_hold', 'export', 'CIF', 'CN-0014', 'fcl', 'Kobe Steel Works', 'Dubai Projects', 'Kobe', 'Jebel Ali', '9182736414', '8182736414', DATE '2026-04-11', ARRAY['入庫票', '輸出許可書', '貨物写真'], ARRAY['請求書'], 'Expanded sample shipment job.'),
    ('completed', 'triangle', 'FOB', 'CN-0015', 'air', 'Bangkok Foods', 'Seoul Mart', 'Bangkok', 'Incheon', '9182736415', '8182736415', DATE '2026-04-12', ARRAY['請求書', 'AN'], ARRAY['AN', '振込証明'], 'Expanded sample shipment job.'),
    ('under_process', 'export', 'CFR', 'CN-0016', 'lcl', 'Shizuoka Tea Export', 'Paris Gourmet', 'Shimizu', 'Le Havre', '9182736416', '8182736416', DATE '2026-04-13', ARRAY['入庫票', '請求書', 'POD'], ARRAY['請求書'], 'Expanded sample shipment job.'),
    ('customs_hold', 'import', 'CIF', 'CN-0017', 'fcl', 'Milan Furniture', 'Fukuoka Design', 'Genoa', 'Hakata', '9182736417', '8182736417', DATE '2026-04-14', ARRAY['輸入許可書', 'HBL', '貨物写真'], ARRAY['DN', '振込証明'], 'Expanded sample shipment job.'),
    ('completed', 'export', 'EXW', 'CN-0018', 'air', 'Sendai Optics', 'Singapore Vision', 'Sendai', 'Singapore', '9182736418', '8182736418', DATE '2026-04-15', ARRAY['輸出許可書', '請求書'], ARRAY['AN'], 'Expanded sample shipment job.'),
    ('under_process', 'triangle', 'DDP', 'CN-0019', 'lcl', 'Jakarta Rubber', 'Oslo Industrial', 'Jakarta', 'Oslo', '9182736419', '8182736419', DATE '2026-04-16', ARRAY['請求書', 'POD', '貨物写真'], ARRAY['振込証明'], 'Expanded sample shipment job.'),
    ('customs_hold', 'import', 'DAP', 'CN-0020', 'air', 'Delhi Chemicals', 'Tokyo Lab', 'Delhi', 'Narita', '9182736420', '8182736420', DATE '2026-04-17', ARRAY['輸入許可書', 'AN'], ARRAY['DN', 'AN'], 'Expanded sample shipment job.'),
    ('completed', 'export', 'CIF', 'CN-0021', 'fcl', 'Hokkaido Dairy', 'Hong Kong Foods', 'Tomakomai', 'Hong Kong', '9182736421', '8182736421', DATE '2026-04-18', ARRAY['入庫票', '輸出許可書', '請求書'], ARRAY['請求書'], 'Expanded sample shipment job.'),
    ('under_process', 'import', 'FOB', 'CN-0022', 'lcl', 'Qingdao Tools', 'Mie Factory', 'Qingdao', 'Nagoya', '9182736422', '8182736422', DATE '2026-04-19', ARRAY['輸入許可書', 'POD', 'HBL'], ARRAY['DN'], 'Expanded sample shipment job.'),
    ('customs_hold', 'export', 'DDP', 'CN-0023', 'air', 'Gifu Apparel', 'Madrid Retail', 'Chubu', 'Madrid', '9182736423', '8182736423', DATE '2026-04-20', ARRAY['入庫票', '請求書'], ARRAY['AN', '振込証明'], 'Expanded sample shipment job.'),
    ('completed', 'triangle', 'CFR', 'CN-0024', 'fcl', 'Sao Paulo Coffee', 'Taipei Cafe', 'Santos', 'Keelung', '9182736424', '8182736424', DATE '2026-04-21', ARRAY['請求書', 'POD'], ARRAY['請求書'], 'Expanded sample shipment job.'),
    ('under_process', 'export', 'FOB', 'CN-0025', 'lcl', 'Nara Craft', 'Rome Boutique', 'Osaka', 'Civitavecchia', '9182736425', '8182736425', DATE '2026-04-22', ARRAY['入庫票', '輸出許可書', '貨物写真'], ARRAY['DN'], 'Expanded sample shipment job.'),
    ('customs_hold', 'import', 'CIF', 'CN-0026', 'air', 'Los Angeles Toys', 'Tokyo Kids', 'Los Angeles', 'Narita', '9182736426', '8182736426', DATE '2026-04-23', ARRAY['輸入許可書', 'AN', '貨物写真'], ARRAY['DN', 'AN'], 'Expanded sample shipment job.'),
    ('completed', 'export', 'DAP', 'CN-0027', 'fcl', 'Iwate Timber', 'Vancouver Build', 'Sendai', 'Vancouver', '9182736427', '8182736427', DATE '2026-04-24', ARRAY['輸出許可書', '請求書', 'POD'], ARRAY['振込証明'], 'Expanded sample shipment job.'),
    ('under_process', 'triangle', 'EXW', 'CN-0028', 'air', 'Zurich Instruments', 'Bangkok Medical', 'Zurich', 'Bangkok', '9182736428', '8182736428', DATE '2026-04-25', ARRAY['請求書', 'HBL'], ARRAY['請求書'], 'Expanded sample shipment job.'),
    ('customs_hold', 'import', 'FOB', 'CN-0029', 'lcl', 'Busan Auto Parts', 'Tochigi Motors', 'Busan', 'Yokohama', '9182736429', '8182736429', DATE '2026-04-26', ARRAY['輸入許可書', 'POD', 'AN', 'HBL'], ARRAY['DN', 'AN', '振込証明'], 'Expanded sample shipment job.'),
    ('completed', 'export', 'CIF', 'CN-0030', 'air', 'Okinawa Marine', 'Honolulu Resort', 'Naha', 'Honolulu', '9182736430', '8182736430', DATE '2026-04-27', ARRAY['入庫票', '輸出許可書', '請求書'], ARRAY['請求書'], 'Expanded sample shipment job.')
) AS sample_jobs (
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
WHERE NOT EXISTS (
  SELECT 1
  FROM shipment_jobs existing
  WHERE existing.invoice_number = sample_jobs.invoice_number
);

INSERT INTO shipment_documents (shipment_job_id, scope, name, approval_status)
SELECT job.id, 'customer', document_name, 'pending'
FROM shipment_jobs job
CROSS JOIN LATERAL unnest(job.documents) AS document_name
WHERE job.notes = 'Expanded sample shipment job.'
ON CONFLICT (shipment_job_id, scope, name) DO NOTHING;

INSERT INTO shipment_documents (shipment_job_id, scope, name, approval_status)
SELECT job.id, 'internal', document_name, 'approved'
FROM shipment_jobs job
CROSS JOIN LATERAL unnest(job.internal_documents) AS document_name
WHERE job.notes = 'Expanded sample shipment job.'
ON CONFLICT (shipment_job_id, scope, name) DO NOTHING;
