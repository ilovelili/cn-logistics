/*
  # Fix feedback submitter variable ambiguity

  Replaces submit_shipment_feedback after the duplicate-prevention migration.
  The previous function used a PL/pgSQL variable named normal_user_id, which
  conflicted with app_user_admin_assignments.normal_user_id.
*/

DROP FUNCTION IF EXISTS submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text);

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
  submitter_user_id uuid;
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
  INTO submitter_user_id, primary_operator_email
  FROM app_users
  WHERE lower(app_users.email) = normalized_submitter_email
    AND app_users.role = 'normal'
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF submitter_user_id IS NULL THEN
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
  WHERE assignment.normal_user_id = submitter_user_id
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

NOTIFY pgrst, 'reload schema';
