/*
 * Product feedback submitted from the global CN Navigator support widget.
 *
 * The table is not directly exposed to application users. Submissions go
 * through a narrowly scoped RPC that derives the submitter from the verified
 * Auth0 JWT and accepts only bounded feedback content from the client.
 */
CREATE TABLE public.app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  submitter_email text NOT NULL,
  submitter_role text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  page text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_feedback_submitter_role_check
    CHECK (submitter_role IN ('normal', 'admin', 'super_admin')),
  CONSTRAINT app_feedback_title_length_check
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT app_feedback_message_length_check
    CHECK (char_length(message) BETWEEN 1 AND 5000),
  CONSTRAINT app_feedback_page_length_check
    CHECK (page IS NULL OR char_length(page) BETWEEN 1 AND 500),
  CONSTRAINT app_feedback_page_check
    CHECK (
      page IS NULL
      OR page IN (
        'shipments',
        'notifications',
        'shipment_management',
        'shipper_registration',
        'admin_registration',
        'standard_flow',
        'shipment_feedback',
        'email_templates'
      )
    )
);

CREATE INDEX app_feedback_created_at_idx
  ON public.app_feedback (created_at DESC);

CREATE INDEX app_feedback_submitter_user_id_idx
  ON public.app_feedback (submitter_user_id, created_at DESC);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_feedback FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.submit_app_feedback(
  feedback_title text,
  feedback_message text,
  feedback_page text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_email text := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  authenticated_email_verified boolean := COALESCE(
    (auth.jwt() ->> 'email_verified')::boolean,
    false
  );
  normalized_title text := trim(COALESCE(feedback_title, ''));
  normalized_message text := trim(COALESCE(feedback_message, ''));
  normalized_page text := NULLIF(trim(COALESCE(feedback_page, '')), '');
  submitter_record record;
  inserted_id uuid;
BEGIN
  IF authenticated_email = '' OR NOT authenticated_email_verified THEN
    RAISE EXCEPTION 'A verified Auth0 email address is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT app_user.id, app_user.email, app_user.role
  INTO submitter_record
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = authenticated_email
    AND app_user.role IN ('normal', 'admin', 'super_admin')
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
    AND (
      app_user.role IN ('admin', 'super_admin')
      OR app_user.approval_status = 'approved'
    )
  LIMIT 1;

  IF submitter_record.id IS NULL THEN
    RAISE EXCEPTION 'Only active CN Navigator users can submit feedback'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(normalized_title) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Feedback title must contain between 1 and 200 characters';
  END IF;

  IF char_length(normalized_message) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Feedback message must contain between 1 and 5000 characters';
  END IF;

  IF normalized_page IS NOT NULL AND NOT (
    (submitter_record.role = 'normal'
      AND normalized_page IN ('shipments', 'notifications'))
    OR (submitter_record.role = 'admin'
      AND normalized_page IN (
        'shipments',
        'notifications',
        'shipment_management',
        'shipper_registration'
      ))
    OR (submitter_record.role = 'super_admin'
      AND normalized_page IN (
        'shipments',
        'notifications',
        'shipment_management',
        'shipper_registration',
        'admin_registration',
        'standard_flow',
        'shipment_feedback',
        'email_templates'
      ))
  ) THEN
    RAISE EXCEPTION 'The selected feedback page is not available to this user'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.app_feedback (
    submitter_user_id,
    submitter_email,
    submitter_role,
    title,
    message,
    page
  )
  VALUES (
    submitter_record.id,
    lower(trim(submitter_record.email)),
    submitter_record.role,
    normalized_title,
    normalized_message,
    normalized_page
  )
  RETURNING id INTO inserted_id;

  RETURN inserted_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_app_feedback(text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_app_feedback(text, text, text)
  TO authenticated;

COMMENT ON TABLE public.app_feedback IS
  'Product and support feedback submitted by authenticated CN Navigator users.';

NOTIFY pgrst, 'reload schema';
