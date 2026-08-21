/*
  # Manage Auth0 user deletion

  Application access is disabled before the external Auth0 deletion starts.
  Failed deletions remain visible and can be retried safely. Only a verified,
  active super administrator can start or finish this lifecycle.
*/

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS auth0_deletion_status text NOT NULL
    DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS auth0_deletion_error text,
  ADD COLUMN IF NOT EXISTS auth0_deletion_attempted_at timestamptz;

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_auth0_deletion_status_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_auth0_deletion_status_check
  CHECK (
    auth0_deletion_status IN (
      'not_requested',
      'pending',
      'failed',
      'deleted'
    )
  );

CREATE OR REPLACE FUNCTION public.begin_auth0_user_deletion(
  target_user_id uuid
)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  auth0_user_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_email text := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  requester_email_verified boolean := COALESCE(
    (auth.jwt() ->> 'email_verified')::boolean,
    false
  );
BEGIN
  IF requester_email = '' OR NOT requester_email_verified OR NOT EXISTS (
    SELECT 1
    FROM public.app_users AS requester
    WHERE lower(trim(requester.email)) = requester_email
      AND requester.role = 'super_admin'
      AND requester.is_active = true
      AND requester.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Super administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.app_users AS target
  SET
    is_active = false,
    auth0_deletion_status = 'pending',
    auth0_deletion_error = NULL,
    auth0_deletion_attempted_at = now(),
    updated_at = now()
  WHERE target.id = target_user_id
    AND target.role IN ('admin', 'normal')
    AND target.deleted_at IS NULL
  RETURNING
    target.id,
    lower(trim(target.email)),
    target.role,
    target.auth0_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application user was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_auth0_user_deletion(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_auth0_user_deletion(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_auth0_user_deletion(
  target_user_id uuid,
  deletion_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_email text := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  requester_email_verified boolean := COALESCE(
    (auth.jwt() ->> 'email_verified')::boolean,
    false
  );
BEGIN
  IF requester_email = '' OR NOT requester_email_verified OR NOT EXISTS (
    SELECT 1
    FROM public.app_users AS requester
    WHERE lower(trim(requester.email)) = requester_email
      AND requester.role = 'super_admin'
      AND requester.is_active = true
      AND requester.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Super administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  IF deletion_error IS NULL THEN
    UPDATE public.app_users AS target
    SET
      is_active = false,
      deleted_at = now(),
      deleted_by = requester_email,
      auth0_user_id = NULL,
      auth0_deletion_status = 'deleted',
      auth0_deletion_error = NULL,
      auth0_deletion_attempted_at = now(),
      updated_at = now()
    WHERE target.id = target_user_id
      AND target.role IN ('admin', 'normal')
      AND target.deleted_at IS NULL
      AND target.auth0_deletion_status = 'pending';
  ELSE
    UPDATE public.app_users AS target
    SET
      is_active = false,
      auth0_deletion_status = 'failed',
      auth0_deletion_error = left(deletion_error, 500),
      auth0_deletion_attempted_at = now(),
      updated_at = now()
    WHERE target.id = target_user_id
      AND target.role IN ('admin', 'normal')
      AND target.deleted_at IS NULL
      AND target.auth0_deletion_status = 'pending';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending Auth0 user deletion was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_auth0_user_deletion(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_auth0_user_deletion(uuid, text)
  TO authenticated;

-- Force all application deletions through the Auth0 lifecycle function so an
-- authenticated client cannot bypass external identity cleanup.
REVOKE ALL ON FUNCTION public.delete_normal_user(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_admin_operator(text, uuid)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
