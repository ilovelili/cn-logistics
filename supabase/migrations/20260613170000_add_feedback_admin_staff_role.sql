/*
  # Feedback admin staff role target

  Stores whether a shipment feedback rating is for the Sales or Operation
  admin担当区分, then returns that classification in feedback list RPCs.
*/

ALTER TABLE shipment_feedback
  ADD COLUMN IF NOT EXISTS admin_operator_staff_role text;

DROP INDEX IF EXISTS idx_shipment_feedback_job_submitter;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_feedback_job_submitter_staff_role
  ON shipment_feedback(
    shipment_job_id,
    submitter_email,
    COALESCE(admin_operator_staff_role, 'legacy')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shipment_feedback_admin_operator_staff_role_check'
  ) THEN
    ALTER TABLE shipment_feedback
      ADD CONSTRAINT shipment_feedback_admin_operator_staff_role_check
      CHECK (
        admin_operator_staff_role IS NULL
        OR admin_operator_staff_role IN ('sales', 'operations')
      );
  END IF;
END $$;

DROP FUNCTION IF EXISTS submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text);
DROP FUNCTION IF EXISTS submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text, text);

CREATE OR REPLACE FUNCTION submit_shipment_feedback(
  feedback_shipment_job_id uuid,
  feedback_submitter_email text,
  feedback_attitude_rating integer,
  feedback_professionalism_rating integer,
  feedback_speed_rating integer,
  feedback_accuracy_rating integer,
  feedback_price_rating integer,
  feedback_admin_operator_staff_role text,
  feedback_reason text
)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  submitter_email text,
  admin_operator_email text,
  admin_operator_staff_role text,
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
  normalized_staff_role text := COALESCE(NULLIF(trim(feedback_admin_operator_staff_role), ''), 'sales');
  submitter_user_id uuid;
  primary_operator_email text;
  assigned_operator_email text;
  total_rating integer;
BEGIN
  IF normalized_staff_role NOT IN ('sales', 'operations') THEN
    RAISE EXCEPTION 'Invalid feedback admin operator staff role';
  END IF;

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
      AND shipment_feedback.admin_operator_staff_role = normalized_staff_role
  ) THEN
    RAISE EXCEPTION 'Feedback has already been submitted for this shipment and staff role';
  END IF;

  SELECT admin_user.email
  INTO assigned_operator_email
  FROM app_user_admin_assignments assignment
  JOIN app_users admin_user
    ON admin_user.id = assignment.admin_user_id
  LEFT JOIN shipment_jobs
    ON shipment_jobs.id = feedback_shipment_job_id
  WHERE assignment.normal_user_id = submitter_user_id
    AND admin_user.role = 'admin'
    AND admin_user.deleted_at IS NULL
    AND normalized_staff_role = ANY(
      COALESCE(
        admin_user.staff_roles,
        ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]
      )
    )
    AND (
      shipment_jobs.assigned_admin_user_ids IS NULL
      OR cardinality(shipment_jobs.assigned_admin_user_ids) = 0
      OR admin_user.id = ANY(shipment_jobs.assigned_admin_user_ids)
    )
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
    admin_operator_staff_role,
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
    normalized_staff_role,
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
    shipment_feedback.admin_operator_staff_role,
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

REVOKE ALL ON FUNCTION submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS list_shipment_feedback_for_user(text);

CREATE OR REPLACE FUNCTION list_shipment_feedback_for_user(feedback_submitter_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  submitter_email text,
  admin_operator_email text,
  admin_operator_staff_role text,
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
    shipment_feedback.admin_operator_staff_role,
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
  admin_operator_staff_role text,
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
    COALESCE(role_matched_admin.email, shipment_feedback.admin_operator_email),
    shipment_feedback.admin_operator_staff_role,
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
      AND shipment_feedback.admin_operator_staff_role = ANY(
        COALESCE(
          admin_user.staff_roles,
          ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]
        )
      )
      AND (
        shipment_jobs.assigned_admin_user_ids IS NULL
        OR cardinality(shipment_jobs.assigned_admin_user_ids) = 0
        OR admin_user.id = ANY(shipment_jobs.assigned_admin_user_ids)
      )
    ORDER BY admin_user.email
    LIMIT 1
  ) role_matched_admin ON true
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

WITH feedback_seed_source AS (
  SELECT
    shipment_jobs.id AS shipment_job_id,
    shipment_jobs.invoice_number,
    normal_user.email AS submitter_email,
    row_number() OVER (
      ORDER BY shipment_jobs.bl_awb_date NULLS LAST,
        shipment_jobs.invoice_number NULLS LAST,
        shipment_jobs.id
    ) AS seed_index
  FROM shipment_jobs
  JOIN app_users normal_user
    ON normal_user.role = 'normal'
    AND normal_user.is_active = true
    AND normal_user.deleted_at IS NULL
    AND normal_user.approval_status = 'approved'
    AND lower(trim(COALESCE(normal_user.shipper_name, normal_user.user_name, ''))) =
      lower(trim(COALESCE(shipment_jobs.shipper_name, '')))
  WHERE shipment_jobs.notes IN (
      'Seeded from customer Excel reference.',
      'Expanded sample shipment job.'
    )
    AND shipment_jobs.invoice_number IS NOT NULL
  ORDER BY shipment_jobs.bl_awb_date NULLS LAST,
    shipment_jobs.invoice_number NULLS LAST,
    shipment_jobs.id
  LIMIT 8
),
feedback_seed_rows AS (
  SELECT
    feedback_seed_source.shipment_job_id,
    feedback_seed_source.submitter_email,
    target_roles.admin_operator_staff_role,
    CASE target_roles.admin_operator_staff_role
      WHEN 'sales' THEN 'admin@cnlogistics.co.jp'
      ELSE 'route666@live.com1'
    END AS admin_operator_email,
    CASE target_roles.admin_operator_staff_role
      WHEN 'sales' THEN 4 + (feedback_seed_source.seed_index % 2)
      ELSE 3 + (feedback_seed_source.seed_index % 3)
    END AS attitude_rating,
    CASE target_roles.admin_operator_staff_role
      WHEN 'sales' THEN 4
      ELSE 4 + (feedback_seed_source.seed_index % 2)
    END AS professionalism_rating,
    CASE target_roles.admin_operator_staff_role
      WHEN 'sales' THEN 3 + (feedback_seed_source.seed_index % 3)
      ELSE 4
    END AS speed_rating,
    CASE target_roles.admin_operator_staff_role
      WHEN 'sales' THEN 4
      ELSE 3 + (feedback_seed_source.seed_index % 3)
    END AS accuracy_rating,
    CASE target_roles.admin_operator_staff_role
      WHEN 'sales' THEN 3 + (feedback_seed_source.seed_index % 2)
      ELSE 4
    END AS price_rating,
    CASE target_roles.admin_operator_staff_role
      WHEN 'sales' THEN '営業対応のデモ評価です。'
      ELSE 'オペレーション対応のデモ評価です。'
    END AS reason,
    now() - (feedback_seed_source.seed_index || ' days')::interval AS created_at
  FROM feedback_seed_source
  CROSS JOIN (
    VALUES ('sales'), ('operations')
  ) AS target_roles(admin_operator_staff_role)
)
INSERT INTO shipment_feedback (
  shipment_job_id,
  submitter_email,
  admin_operator_email,
  admin_operator_staff_role,
  rating,
  attitude_rating,
  professionalism_rating,
  speed_rating,
  accuracy_rating,
  price_rating,
  reason,
  created_at,
  updated_at
)
SELECT
  feedback_seed_rows.shipment_job_id,
  feedback_seed_rows.submitter_email,
  feedback_seed_rows.admin_operator_email,
  feedback_seed_rows.admin_operator_staff_role,
  round((
    feedback_seed_rows.attitude_rating
    + feedback_seed_rows.professionalism_rating
    + feedback_seed_rows.speed_rating
    + feedback_seed_rows.accuracy_rating
    + feedback_seed_rows.price_rating
  ) / 5.0)::integer,
  feedback_seed_rows.attitude_rating,
  feedback_seed_rows.professionalism_rating,
  feedback_seed_rows.speed_rating,
  feedback_seed_rows.accuracy_rating,
  feedback_seed_rows.price_rating,
  feedback_seed_rows.reason,
  feedback_seed_rows.created_at,
  feedback_seed_rows.created_at
FROM feedback_seed_rows
WHERE EXISTS (
    SELECT 1
    FROM app_users admin_user
    WHERE lower(admin_user.email) = lower(feedback_seed_rows.admin_operator_email)
      AND admin_user.role = 'admin'
      AND admin_user.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM shipment_feedback existing_feedback
    WHERE existing_feedback.shipment_job_id = feedback_seed_rows.shipment_job_id
      AND existing_feedback.submitter_email = feedback_seed_rows.submitter_email
      AND existing_feedback.admin_operator_staff_role =
        feedback_seed_rows.admin_operator_staff_role
  );

NOTIFY pgrst, 'reload schema';
