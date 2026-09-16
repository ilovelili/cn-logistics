/*
  Replace role-level shipment feedback with feedback for each individually
  assigned Sales or Operations administrator.
*/

ALTER TABLE public.shipment_feedback
  ADD COLUMN IF NOT EXISTS admin_operator_id uuid REFERENCES public.app_users(id),
  ADD COLUMN IF NOT EXISTS admin_operator_name text;

-- The product owner approved a clean cutover from the old role-level records.
DELETE FROM public.shipment_feedback;

DROP INDEX IF EXISTS public.idx_shipment_feedback_job_submitter_staff_role;
CREATE UNIQUE INDEX idx_shipment_feedback_job_submitter_operator
  ON public.shipment_feedback (
    shipment_job_id,
    lower(trim(submitter_email)),
    admin_operator_id
  );

ALTER TABLE public.shipment_feedback
  ALTER COLUMN admin_operator_id SET NOT NULL;

DROP FUNCTION IF EXISTS public.submit_shipment_feedback_batch(uuid, text, jsonb, text);
CREATE FUNCTION public.submit_shipment_feedback_batch(
  feedback_shipment_job_id uuid,
  feedback_submitter_email text,
  feedback_by_target jsonb,
  feedback_reason text
)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  submitter_email text,
  admin_operator_id uuid,
  admin_operator_name text,
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
SET search_path = ''
AS $$
DECLARE
  normalized_submitter_email text := lower(trim(feedback_submitter_email));
  target_feedback jsonb;
  target_admin public.app_users%ROWTYPE;
  target_admin_id uuid;
  target_role text;
  attitude integer;
  professionalism integer;
  speed integer;
  accuracy integer;
  price integer;
BEGIN
  IF normalized_submitter_email <> public.current_app_user_email()
    OR public.current_app_user_role() <> 'normal' THEN
    RAISE EXCEPTION 'Feedback must be submitted by the authenticated normal user'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(feedback_by_target) <> 'array'
    OR jsonb_array_length(feedback_by_target) = 0 THEN
    RAISE EXCEPTION 'At least one staff feedback target is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(feedback_by_target) AS target(value)
    GROUP BY target.value->>'admin_operator_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Each staff member can only be rated once';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shipment_jobs job
    JOIN public.app_users requester
      ON lower(trim(requester.email)) = public.current_app_user_email()
    WHERE job.id = feedback_shipment_job_id
      AND public.can_requester_access_shipment_shipper(
        requester.id, requester.email, requester.role, job.shipper_name
      )
  ) THEN
    RAISE EXCEPTION 'The authenticated user cannot rate this shipment'
      USING ERRCODE = '42501';
  END IF;

  FOR target_feedback IN
    SELECT value FROM jsonb_array_elements(feedback_by_target)
  LOOP
    target_admin_id := (target_feedback->>'admin_operator_id')::uuid;
    target_role := target_feedback->>'target_role';
    attitude := (target_feedback->>'attitude_rating')::integer;
    professionalism := (target_feedback->>'professionalism_rating')::integer;
    speed := (target_feedback->>'speed_rating')::integer;
    accuracy := (target_feedback->>'accuracy_rating')::integer;
    price := (target_feedback->>'price_rating')::integer;

    IF target_role NOT IN ('sales', 'operations') THEN
      RAISE EXCEPTION 'Invalid feedback staff role';
    END IF;

    IF attitude NOT BETWEEN 1 AND 5
      OR professionalism NOT BETWEEN 1 AND 5
      OR speed NOT BETWEEN 1 AND 5
      OR accuracy NOT BETWEEN 1 AND 5
      OR price NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'Feedback ratings must be between 1 and 5';
    END IF;

    SELECT admin_user.*
    INTO target_admin
    FROM public.app_users admin_user
    JOIN public.shipment_jobs job
      ON job.id = feedback_shipment_job_id
     AND target_admin_id = ANY(COALESCE(job.assigned_admin_user_ids, ARRAY[]::uuid[]))
    WHERE admin_user.id = target_admin_id
      AND admin_user.role = 'admin'
      AND admin_user.is_active = true
      AND admin_user.deleted_at IS NULL
      AND target_role = ANY(COALESCE(
        admin_user.staff_roles,
        ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]
      ));

    IF target_admin.id IS NULL THEN
      RAISE EXCEPTION 'Feedback target must be an active staff member assigned to this shipment'
        USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    INSERT INTO public.shipment_feedback (
      shipment_job_id,
      submitter_email,
      admin_operator_id,
      admin_operator_name,
      admin_operator_email,
      admin_operator_staff_role,
      rating,
      attitude_rating,
      professionalism_rating,
      speed_rating,
      accuracy_rating,
      price_rating,
      reason
    ) VALUES (
      feedback_shipment_job_id,
      normalized_submitter_email,
      target_admin.id,
      COALESCE(NULLIF(trim(target_admin.user_name), ''), target_admin.email),
      target_admin.email,
      target_role,
      round((attitude + professionalism + speed + accuracy + price) / 5.0)::integer,
      attitude,
      professionalism,
      speed,
      accuracy,
      price,
      NULLIF(trim(feedback_reason), '')
    )
    RETURNING
      shipment_feedback.id,
      shipment_feedback.shipment_job_id,
      shipment_feedback.submitter_email,
      shipment_feedback.admin_operator_id,
      shipment_feedback.admin_operator_name,
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
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_shipment_feedback_batch(uuid, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shipment_feedback_batch(uuid, text, jsonb, text)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_shipment_feedback_for_user(text);
CREATE FUNCTION public.list_shipment_feedback_for_user(feedback_submitter_email text)
RETURNS TABLE(
  id uuid, shipment_job_id uuid, submitter_email text,
  admin_operator_id uuid, admin_operator_name text, admin_operator_email text,
  admin_operator_staff_role text, rating integer, attitude_rating integer,
  professionalism_rating integer, speed_rating integer, accuracy_rating integer,
  price_rating integer, reason text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.authenticated_caller_can_assume_email(feedback_submitter_email) THEN
    RAISE EXCEPTION 'The authenticated user cannot list this feedback'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT feedback.id, feedback.shipment_job_id, feedback.submitter_email,
    feedback.admin_operator_id, feedback.admin_operator_name,
    feedback.admin_operator_email, feedback.admin_operator_staff_role,
    feedback.rating, feedback.attitude_rating, feedback.professionalism_rating,
    feedback.speed_rating, feedback.accuracy_rating, feedback.price_rating,
    feedback.reason, feedback.created_at, feedback.updated_at
  FROM public.shipment_feedback feedback
  WHERE lower(trim(feedback.submitter_email)) = lower(trim(feedback_submitter_email))
  ORDER BY feedback.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_shipment_feedback_for_user(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_shipment_feedback_for_user(text)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_all_shipment_feedback(text);
CREATE FUNCTION public.list_all_shipment_feedback(super_admin_email text)
RETURNS TABLE(
  id uuid, shipment_job_id uuid, shipment_invoice_number text,
  submitter_email text, admin_operator_id uuid, admin_operator_name text,
  admin_operator_email text, admin_operator_staff_role text, rating integer,
  attitude_rating integer, professionalism_rating integer, speed_rating integer,
  accuracy_rating integer, price_rating integer, reason text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() <> 'super_admin'
    OR lower(trim(super_admin_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated super admin can list all feedback'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT feedback.id, feedback.shipment_job_id, job.invoice_number,
    feedback.submitter_email, feedback.admin_operator_id,
    feedback.admin_operator_name, feedback.admin_operator_email,
    feedback.admin_operator_staff_role, feedback.rating,
    feedback.attitude_rating, feedback.professionalism_rating,
    feedback.speed_rating, feedback.accuracy_rating, feedback.price_rating,
    feedback.reason, feedback.created_at, feedback.updated_at
  FROM public.shipment_feedback feedback
  LEFT JOIN public.shipment_jobs job ON job.id = feedback.shipment_job_id
  ORDER BY feedback.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_all_shipment_feedback(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_all_shipment_feedback(text)
  TO authenticated, service_role;
