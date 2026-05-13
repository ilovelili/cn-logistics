/*
  # Feedback professionalism and calculated overall score

  Adds the feedback category rating columns. The rating column stores the
  rounded calculated overall score.
*/

ALTER TABLE shipment_feedback
  ADD COLUMN IF NOT EXISTS attitude_rating integer,
  ADD COLUMN IF NOT EXISTS speed_rating integer,
  ADD COLUMN IF NOT EXISTS accuracy_rating integer,
  ADD COLUMN IF NOT EXISTS price_rating integer,
  ADD COLUMN IF NOT EXISTS professionalism_rating integer;

UPDATE shipment_feedback
SET
  attitude_rating = COALESCE(attitude_rating, rating),
  speed_rating = COALESCE(speed_rating, rating),
  accuracy_rating = COALESCE(accuracy_rating, rating),
  price_rating = COALESCE(price_rating, rating),
  professionalism_rating = COALESCE(professionalism_rating, rating);

ALTER TABLE shipment_feedback
  ALTER COLUMN attitude_rating SET NOT NULL,
  ALTER COLUMN speed_rating SET NOT NULL,
  ALTER COLUMN accuracy_rating SET NOT NULL,
  ALTER COLUMN price_rating SET NOT NULL,
  ALTER COLUMN professionalism_rating SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipment_feedback_attitude_rating_check'
  ) THEN
    ALTER TABLE shipment_feedback
      ADD CONSTRAINT shipment_feedback_attitude_rating_check
      CHECK (attitude_rating BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipment_feedback_speed_rating_check'
  ) THEN
    ALTER TABLE shipment_feedback
      ADD CONSTRAINT shipment_feedback_speed_rating_check
      CHECK (speed_rating BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipment_feedback_accuracy_rating_check'
  ) THEN
    ALTER TABLE shipment_feedback
      ADD CONSTRAINT shipment_feedback_accuracy_rating_check
      CHECK (accuracy_rating BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipment_feedback_price_rating_check'
  ) THEN
    ALTER TABLE shipment_feedback
      ADD CONSTRAINT shipment_feedback_price_rating_check
      CHECK (price_rating BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipment_feedback_professionalism_rating_check'
  ) THEN
    ALTER TABLE shipment_feedback
      ADD CONSTRAINT shipment_feedback_professionalism_rating_check
      CHECK (professionalism_rating BETWEEN 1 AND 5);
  END IF;
END $$;

DROP FUNCTION IF EXISTS submit_shipment_feedback(uuid, text, integer, integer, integer, integer, text);
DROP FUNCTION IF EXISTS submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text);
DROP FUNCTION IF EXISTS submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, integer, text);

CREATE OR REPLACE FUNCTION submit_shipment_feedback(
  feedback_shipment_job_id uuid,
  feedback_submitter_email text,
  feedback_attitude_rating integer,
  feedback_professionalism_rating integer,
  feedback_speed_rating integer,
  feedback_accuracy_rating integer,
  feedback_price_rating integer,
  feedback_reason text
)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  submitter_email text,
  admin_operator_email text,
  rating integer,
  attitude_rating integer,
  professionalism_rating integer,
  speed_rating integer,
  accuracy_rating integer,
  price_rating integer,
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
  normal_user_id uuid;
  primary_operator_email text;
  assigned_operator_email text;
  total_rating integer;
BEGIN
  IF feedback_attitude_rating < 1 OR feedback_attitude_rating > 5
    OR feedback_professionalism_rating < 1 OR feedback_professionalism_rating > 5
    OR feedback_speed_rating < 1 OR feedback_speed_rating > 5
    OR feedback_accuracy_rating < 1 OR feedback_accuracy_rating > 5
    OR feedback_price_rating < 1 OR feedback_price_rating > 5 THEN
    RAISE EXCEPTION 'feedback ratings must be between 1 and 5';
  END IF;

  SELECT app_users.id, app_users.created_by
  INTO normal_user_id, primary_operator_email
  FROM app_users
  WHERE lower(app_users.email) = normalized_submitter_email
    AND app_users.role = 'normal'
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF normal_user_id IS NULL THEN
    RAISE EXCEPTION 'Only active normal users can submit shipment feedback';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM shipment_feedback
    WHERE shipment_feedback.shipment_job_id = feedback_shipment_job_id
      AND shipment_feedback.submitter_email = normalized_submitter_email
  ) THEN
    RAISE EXCEPTION 'Feedback has already been submitted for this shipment';
  END IF;

  SELECT admin_user.email
  INTO assigned_operator_email
  FROM app_user_admin_assignments assignment
  JOIN app_users admin_user
    ON admin_user.id = assignment.admin_user_id
  WHERE assignment.normal_user_id = normal_user_id
    AND admin_user.role = 'admin'
    AND admin_user.deleted_at IS NULL
  ORDER BY admin_user.email
  LIMIT 1;

  primary_operator_email := COALESCE(assigned_operator_email, primary_operator_email);
  total_rating := round((
    feedback_attitude_rating
    + feedback_professionalism_rating
    + feedback_speed_rating
    + feedback_accuracy_rating
    + feedback_price_rating
  ) / 5.0)::integer;

  RETURN QUERY
  INSERT INTO shipment_feedback (
    shipment_job_id,
    submitter_email,
    admin_operator_email,
    rating,
    attitude_rating,
    professionalism_rating,
    speed_rating,
    accuracy_rating,
    price_rating,
    reason
  )
  VALUES (
    feedback_shipment_job_id,
    normalized_submitter_email,
    primary_operator_email,
    total_rating,
    feedback_attitude_rating,
    feedback_professionalism_rating,
    feedback_speed_rating,
    feedback_accuracy_rating,
    feedback_price_rating,
    NULLIF(trim(feedback_reason), '')
  )
  RETURNING
    shipment_feedback.id,
    shipment_feedback.shipment_job_id,
    shipment_feedback.submitter_email,
    shipment_feedback.admin_operator_email,
    shipment_feedback.rating,
    shipment_feedback.attitude_rating,
    shipment_feedback.professionalism_rating,
    shipment_feedback.speed_rating,
    shipment_feedback.accuracy_rating,
    shipment_feedback.price_rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS list_shipment_feedback_for_user(text);

CREATE OR REPLACE FUNCTION list_shipment_feedback_for_user(feedback_submitter_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  submitter_email text,
  admin_operator_email text,
  rating integer,
  attitude_rating integer,
  professionalism_rating integer,
  speed_rating integer,
  accuracy_rating integer,
  price_rating integer,
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
    shipment_feedback.attitude_rating,
    shipment_feedback.professionalism_rating,
    shipment_feedback.speed_rating,
    shipment_feedback.accuracy_rating,
    shipment_feedback.price_rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at
  FROM shipment_feedback
  WHERE shipment_feedback.submitter_email = lower(trim(feedback_submitter_email))
  ORDER BY shipment_feedback.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION list_shipment_feedback_for_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_shipment_feedback_for_user(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS list_all_shipment_feedback(text);

CREATE OR REPLACE FUNCTION list_all_shipment_feedback(super_admin_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  shipment_invoice_number text,
  submitter_email text,
  admin_operator_email text,
  rating integer,
  attitude_rating integer,
  professionalism_rating integer,
  speed_rating integer,
  accuracy_rating integer,
  price_rating integer,
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
    COALESCE(assigned_admin.email, shipment_feedback.admin_operator_email),
    shipment_feedback.rating,
    shipment_feedback.attitude_rating,
    shipment_feedback.professionalism_rating,
    shipment_feedback.speed_rating,
    shipment_feedback.accuracy_rating,
    shipment_feedback.price_rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at
  FROM shipment_feedback
  LEFT JOIN shipment_jobs
    ON shipment_jobs.id = shipment_feedback.shipment_job_id
  LEFT JOIN app_users normal_user
    ON lower(normal_user.email) = shipment_feedback.submitter_email
    AND normal_user.role = 'normal'
    AND normal_user.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT admin_user.email
    FROM app_user_admin_assignments assignment
    JOIN app_users admin_user
      ON admin_user.id = assignment.admin_user_id
    WHERE assignment.normal_user_id = normal_user.id
      AND admin_user.role = 'admin'
      AND admin_user.deleted_at IS NULL
    ORDER BY admin_user.email
  ) assigned_admin ON true
  WHERE EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(super_admin_email))
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  )
  ORDER BY shipment_feedback.updated_at DESC, admin_operator_email;
$$;

REVOKE ALL ON FUNCTION list_all_shipment_feedback(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_all_shipment_feedback(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
