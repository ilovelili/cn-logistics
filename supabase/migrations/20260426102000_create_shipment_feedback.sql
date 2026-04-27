/*
  # Shipment feedback

  Stores customer feedback per shipment job so super admins can benchmark
  admin operator performance later.
*/

CREATE TABLE IF NOT EXISTS shipment_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_job_id uuid NOT NULL REFERENCES shipment_jobs(id) ON DELETE CASCADE,
  submitter_email text NOT NULL,
  admin_operator_email text,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_shipment_feedback_updated_at ON shipment_feedback;
CREATE TRIGGER set_shipment_feedback_updated_at
  BEFORE UPDATE ON shipment_feedback
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_feedback_job_submitter
  ON shipment_feedback(shipment_job_id, submitter_email);

CREATE INDEX IF NOT EXISTS idx_shipment_feedback_admin_operator
  ON shipment_feedback(admin_operator_email);

CREATE INDEX IF NOT EXISTS idx_shipment_feedback_rating
  ON shipment_feedback(rating);

ALTER TABLE shipment_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct shipment feedback reads" ON shipment_feedback;
CREATE POLICY "No direct shipment feedback reads"
  ON shipment_feedback FOR SELECT
  USING (false);

CREATE OR REPLACE FUNCTION submit_shipment_feedback(
  feedback_shipment_job_id uuid,
  feedback_submitter_email text,
  feedback_rating integer,
  feedback_reason text
)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  submitter_email text,
  admin_operator_email text,
  rating integer,
  reason text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_submitter_email text := lower(trim(feedback_submitter_email));
  operator_email text;
BEGIN
  IF feedback_rating < 1 OR feedback_rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;

  SELECT app_users.created_by
  INTO operator_email
  FROM app_users
  WHERE lower(app_users.email) = normalized_submitter_email
    AND app_users.role = 'normal'
  LIMIT 1;

  RETURN QUERY
  INSERT INTO shipment_feedback (
    shipment_job_id,
    submitter_email,
    admin_operator_email,
    rating,
    reason
  )
  VALUES (
    feedback_shipment_job_id,
    normalized_submitter_email,
    operator_email,
    feedback_rating,
    NULLIF(trim(feedback_reason), '')
  )
  RETURNING
    shipment_feedback.id,
    shipment_feedback.shipment_job_id,
    shipment_feedback.submitter_email,
    shipment_feedback.admin_operator_email,
    shipment_feedback.rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION submit_shipment_feedback(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_shipment_feedback(uuid, text, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_shipment_feedback_for_user(feedback_submitter_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  submitter_email text,
  admin_operator_email text,
  rating integer,
  reason text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    shipment_feedback.id,
    shipment_feedback.shipment_job_id,
    shipment_feedback.submitter_email,
    shipment_feedback.admin_operator_email,
    shipment_feedback.rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at
  FROM shipment_feedback
  WHERE shipment_feedback.submitter_email = lower(trim(feedback_submitter_email))
  ORDER BY shipment_feedback.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION list_shipment_feedback_for_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_shipment_feedback_for_user(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS list_all_shipment_feedback();

CREATE OR REPLACE FUNCTION list_all_shipment_feedback(super_admin_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  shipment_invoice_number text,
  submitter_email text,
  admin_operator_email text,
  rating integer,
  reason text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    shipment_feedback.id,
    shipment_feedback.shipment_job_id,
    shipment_jobs.invoice_number,
    shipment_feedback.submitter_email,
    shipment_feedback.admin_operator_email,
    shipment_feedback.rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at
  FROM shipment_feedback
  LEFT JOIN shipment_jobs ON shipment_jobs.id = shipment_feedback.shipment_job_id
  WHERE EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(super_admin_email))
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
  )
  ORDER BY shipment_feedback.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION list_all_shipment_feedback(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_all_shipment_feedback(text) TO anon, authenticated;
