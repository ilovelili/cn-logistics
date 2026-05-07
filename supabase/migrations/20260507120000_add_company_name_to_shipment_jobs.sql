/*
  # Add company name to shipment jobs

  Stores the registered company selected from the company registration page so
  shipment job lists can display, filter, search, and sort by company.
*/

ALTER TABLE shipment_jobs
  ADD COLUMN IF NOT EXISTS company_name text;

CREATE INDEX IF NOT EXISTS idx_shipment_jobs_company_name
  ON shipment_jobs(company_name);

WITH registered_companies AS (
  SELECT
    app_users.company_name,
    row_number() OVER (ORDER BY app_users.created_at, app_users.id) AS company_index,
    count(*) OVER () AS company_count
  FROM app_users
  WHERE app_users.role = 'normal'
    AND app_users.deleted_at IS NULL
    AND NULLIF(trim(app_users.company_name), '') IS NOT NULL
),
ranked_jobs AS (
  SELECT
    shipment_jobs.id,
    row_number() OVER (ORDER BY shipment_jobs.created_at, shipment_jobs.id) AS job_index
  FROM shipment_jobs
  WHERE NULLIF(trim(shipment_jobs.company_name), '') IS NULL
)
UPDATE shipment_jobs
SET company_name = registered_companies.company_name
FROM ranked_jobs, registered_companies
WHERE shipment_jobs.id = ranked_jobs.id
  AND registered_companies.company_index =
    ((ranked_jobs.job_index - 1) % registered_companies.company_count) + 1;
