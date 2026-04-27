/*
  # Seed vessel/flight numbers

  Adds sample vessel or flight numbers to the demo shipment jobs. Rows are only
  updated when vessel_flight_numbers is empty so user-entered values are kept.
*/

WITH sample_vessel_flights(invoice_number, shipper_name, vessel_flight_numbers) AS (
  VALUES
    ('ABC-123', 'aaa Japan', ARRAY['NH110']),
    (NULL, 'ccc China', ARRAY['SITC TOKYO 2412W', 'WAN HAI 326 078E']),
    (NULL, 'ddd UK', ARRAY['EVER GENTLE 091E', 'KMTC MANILA 2408S']),
    ('CN-0004', 'Tokyo Parts Co.', ARRAY['JL062']),
    ('CN-0005', 'Shenzhen Supply Ltd.', ARRAY['SITC YOKOHAMA 2409E', 'SINOTRANS TOKYO 2411W']),
    ('CN-0006', 'Seoul Components', ARRAY['KMTC BUSAN 330S']),
    ('CN-0007', 'Osaka Machinery', ARRAY['LH741']),
    ('CN-0008', 'Hamburg Foods', ARRAY['ONE HAMBURG 053E', 'NYK VENUS 118W']),
    ('CN-0009', 'Kyushu Ceramics', ARRAY['MAERSK SYDNEY 416S']),
    ('CN-0010', 'Taipei Electronics', ARRAY['CI220']),
    ('CN-0011', 'London Apparel', ARRAY['EVER ACE 122S', 'MAERSK AUCKLAND 030E']),
    ('CN-0012', 'Yokohama Pharma', ARRAY['AC002']),
    ('CN-0013', 'Ho Chi Minh Textile', ARRAY['WAN HAI 501 089N', 'SITC TOKYO 2415E']),
    ('CN-0014', 'Kobe Steel Works', ARRAY['ONE JEBEL ALI 611W']),
    ('CN-0015', 'Bangkok Foods', ARRAY['TG656']),
    ('CN-0016', 'Shizuoka Tea Export', ARRAY['CMA CGM PARIS 204W', 'OOCL LE HAVRE 018E']),
    ('CN-0017', 'Milan Furniture', ARRAY['MSC GENOA 827E']),
    ('CN-0018', 'Sendai Optics', ARRAY['SQ637']),
    ('CN-0019', 'Jakarta Rubber', ARRAY['SINAR BANDA 014N', 'MAERSK OSLO 441W']),
    ('CN-0020', 'Delhi Chemicals', ARRAY['AI306']),
    ('CN-0021', 'Hokkaido Dairy', ARRAY['OOCL HONG KONG 230S']),
    ('CN-0022', 'Qingdao Tools', ARRAY['SITC QINGDAO 092E', 'MOL CHARISMA 173W']),
    ('CN-0023', 'Gifu Apparel', ARRAY['IB6800']),
    ('CN-0024', 'Sao Paulo Coffee', ARRAY['MSC SANTOS 551E', 'EVER KEELUNG 078N']),
    ('CN-0025', 'Nara Craft', ARRAY['CMA CGM ROME 619W']),
    ('CN-0026', 'Los Angeles Toys', ARRAY['NH005']),
    ('CN-0027', 'Iwate Timber', ARRAY['ONE VANCOUVER 227E']),
    ('CN-0028', 'Zurich Instruments', ARRAY['LX180']),
    ('CN-0029', 'Busan Auto Parts', ARRAY['KMTC BUSAN 240E', 'WAN HAI YOKOHAMA 552W']),
    ('CN-0030', 'Okinawa Marine', ARRAY['HA822'])
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
