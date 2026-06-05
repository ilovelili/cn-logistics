/*
  # Seed vessel/flight numbers

  Adds sample vessel or flight numbers to the demo shipment jobs. Rows are only
  updated when vessel_flight_numbers is empty so user-entered values are kept.
*/

WITH sample_vessel_flights(invoice_number, shipper_name, vessel_flight_numbers) AS (
  VALUES
    ('ABC-123', 'Tokyo Trading Co., Ltd.', ARRAY['NH110']),
    (NULL, 'Osaka Parts Inc.', ARRAY['SITC TOKYO 2412W', 'WAN HAI 326 078E']),
    (NULL, 'Kobe Foods Ltd.', ARRAY['EVER GENTLE 091E', 'KMTC MANILA 2408S']),
    ('CN-0004', 'Nagoya Retail Corp.', ARRAY['JL062']),
    ('CN-0005', 'Tokyo Trading Co., Ltd.', ARRAY['SITC YOKOHAMA 2409E', 'SINOTRANS TOKYO 2411W']),
    ('CN-0006', 'Osaka Parts Inc.', ARRAY['KMTC BUSAN 330S']),
    ('CN-0007', 'Kobe Foods Ltd.', ARRAY['LH741']),
    ('CN-0008', 'Nagoya Retail Corp.', ARRAY['ONE HAMBURG 053E', 'NYK VENUS 118W']),
    ('CN-0009', 'Tokyo Trading Co., Ltd.', ARRAY['MAERSK SYDNEY 416S']),
    ('CN-0010', 'Osaka Parts Inc.', ARRAY['CI220']),
    ('CN-0011', 'Kobe Foods Ltd.', ARRAY['EVER ACE 122S', 'MAERSK AUCKLAND 030E']),
    ('CN-0012', 'Nagoya Retail Corp.', ARRAY['AC002']),
    ('CN-0013', 'Tokyo Trading Co., Ltd.', ARRAY['WAN HAI 501 089N', 'SITC TOKYO 2415E']),
    ('CN-0014', 'Osaka Parts Inc.', ARRAY['ONE JEBEL ALI 611W']),
    ('CN-0015', 'Kobe Foods Ltd.', ARRAY['TG656']),
    ('CN-0016', 'Nagoya Retail Corp.', ARRAY['CMA CGM PARIS 204W', 'OOCL LE HAVRE 018E']),
    ('CN-0017', 'Tokyo Trading Co., Ltd.', ARRAY['MSC GENOA 827E']),
    ('CN-0018', 'Osaka Parts Inc.', ARRAY['SQ637']),
    ('CN-0019', 'Kobe Foods Ltd.', ARRAY['SINAR BANDA 014N', 'MAERSK OSLO 441W']),
    ('CN-0020', 'Nagoya Retail Corp.', ARRAY['AI306']),
    ('CN-0021', 'Tokyo Trading Co., Ltd.', ARRAY['OOCL HONG KONG 230S']),
    ('CN-0022', 'Osaka Parts Inc.', ARRAY['SITC QINGDAO 092E', 'MOL CHARISMA 173W']),
    ('CN-0023', 'Kobe Foods Ltd.', ARRAY['IB6800']),
    ('CN-0024', 'Nagoya Retail Corp.', ARRAY['MSC SANTOS 551E', 'EVER KEELUNG 078N']),
    ('CN-0025', 'Tokyo Trading Co., Ltd.', ARRAY['CMA CGM ROME 619W']),
    ('CN-0026', 'Osaka Parts Inc.', ARRAY['NH005']),
    ('CN-0027', 'Kobe Foods Ltd.', ARRAY['ONE VANCOUVER 227E']),
    ('CN-0028', 'Nagoya Retail Corp.', ARRAY['LX180']),
    ('CN-0029', 'Tokyo Trading Co., Ltd.', ARRAY['KMTC BUSAN 240E', 'WAN HAI YOKOHAMA 552W']),
    ('CN-0030', 'Osaka Parts Inc.', ARRAY['HA822'])
)
UPDATE shipment_jobs
SET
  vessel_flight_numbers = sample_vessel_flights.vessel_flight_numbers,
  updated_at = now()
FROM sample_vessel_flights
WHERE COALESCE(array_length(shipment_jobs.vessel_flight_numbers, 1), 0) = 0
  AND shipment_jobs.shipper_name = sample_vessel_flights.shipper_name
  AND (
    shipment_jobs.invoice_number = sample_vessel_flights.invoice_number
    OR (
      shipment_jobs.invoice_number IS NULL
      AND sample_vessel_flights.invoice_number IS NULL
    )
  );
