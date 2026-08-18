/*
  # Restrict Auth0 login to provisioned application users

  Auth0 proves identity. app_users remains the source of truth for application
  access and roles. A verified Auth0 identity must already have an active,
  approved application user record; login no longer creates or promotes users.
*/

CREATE OR REPLACE FUNCTION public.sync_auth0_app_user()
RETURNS TABLE(
  email text,
  role text,
  avatar_url text,
  shipper_name text
)
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
BEGIN
  IF authenticated_email = '' OR NOT authenticated_email_verified THEN
    RAISE EXCEPTION 'A verified Auth0 email address is required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users AS app_user
    WHERE lower(trim(app_user.email)) = authenticated_email
      AND app_user.role IN ('normal', 'admin', 'super_admin')
      AND app_user.is_active = true
      AND app_user.deleted_at IS NULL
      AND (
        app_user.role IN ('admin', 'super_admin')
        OR app_user.approval_status = 'approved'
      )
  ) THEN
    RAISE EXCEPTION 'This Auth0 identity has not been provisioned for CN Navigator'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    app_user.email,
    app_user.role,
    app_user.avatar_url,
    app_user.shipper_name
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = authenticated_email
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth0_app_user()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_auth0_app_user()
  TO authenticated;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS auth0_provisioning_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS auth0_user_id text,
  ADD COLUMN IF NOT EXISTS auth0_provisioning_error text,
  ADD COLUMN IF NOT EXISTS auth0_provisioning_attempted_at timestamptz;

UPDATE public.app_users
SET auth0_provisioning_status = CASE
  WHEN role = 'super_admin' THEN 'provisioned'
  ELSE 'unknown'
END;

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_auth0_provisioning_status_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_auth0_provisioning_status_check
  CHECK (
    auth0_provisioning_status IN ('unknown', 'pending', 'provisioned', 'failed')
  );

CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth0_user_id_key
  ON public.app_users (auth0_user_id)
  WHERE auth0_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.begin_auth0_user_provisioning(
  requested_users jsonb
)
RETURNS TABLE(email text, role text)
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
  requester_role text;
  requested_user jsonb;
  normalized_target_email text;
  requested_target_role text;
  actual_target_role text;
BEGIN
  IF requester_email = '' OR NOT requester_email_verified THEN
    RAISE EXCEPTION 'A verified Auth0 email address is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT app_user.role
  INTO requester_role
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = requester_email
    AND app_user.role IN ('admin', 'super_admin')
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  IF requester_role IS NULL THEN
    RAISE EXCEPTION 'Only an active administrator can provision Auth0 users'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(requested_users) <> 'array'
    OR jsonb_array_length(requested_users) = 0 THEN
    RAISE EXCEPTION 'At least one application user is required';
  END IF;

  FOR requested_user IN
    SELECT value
    FROM jsonb_array_elements(requested_users)
  LOOP
    normalized_target_email := lower(trim(COALESCE(requested_user ->> 'email', '')));
    requested_target_role := requested_user ->> 'role';

    IF normalized_target_email = ''
      OR requested_target_role NOT IN ('admin', 'normal') THEN
      RAISE EXCEPTION 'Invalid Auth0 provisioning request';
    END IF;

    IF requester_role = 'admin' AND requested_target_role <> 'normal' THEN
      RAISE EXCEPTION 'Admin users can only provision normal users'
        USING ERRCODE = '42501';
    END IF;

    SELECT app_user.role
    INTO actual_target_role
    FROM public.app_users AS app_user
    WHERE lower(trim(app_user.email)) = normalized_target_email
      AND app_user.role = requested_target_role
      AND app_user.is_active = true
      AND app_user.deleted_at IS NULL
    LIMIT 1;

    IF actual_target_role IS NULL THEN
      RAISE EXCEPTION 'The application user must exist before Auth0 provisioning'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.app_users AS app_user
    SET
      auth0_provisioning_status = 'pending',
      auth0_provisioning_error = NULL,
      auth0_provisioning_attempted_at = now(),
      updated_at = now()
    WHERE lower(trim(app_user.email)) = normalized_target_email;

    email := normalized_target_email;
    role := actual_target_role;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_auth0_user_provisioning(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_auth0_user_provisioning(jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_auth0_user_provisioning(
  provisioned_email text,
  provisioned_auth0_user_id text,
  provisioning_error text
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
  requester_role text;
  normalized_target_email text := lower(trim(provisioned_email));
  target_role text;
BEGIN
  IF requester_email = '' OR NOT requester_email_verified THEN
    RAISE EXCEPTION 'A verified Auth0 email address is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT app_user.role
  INTO requester_role
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = requester_email
    AND app_user.role IN ('admin', 'super_admin')
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  SELECT app_user.role
  INTO target_role
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = normalized_target_email
    AND app_user.role IN ('admin', 'normal')
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  IF requester_role IS NULL
    OR target_role IS NULL
    OR (requester_role = 'admin' AND target_role <> 'normal') THEN
    RAISE EXCEPTION 'The Auth0 provisioning result cannot be recorded'
      USING ERRCODE = '42501';
  END IF;

  IF provisioning_error IS NULL
    AND NULLIF(trim(provisioned_auth0_user_id), '') IS NULL THEN
    RAISE EXCEPTION 'An Auth0 user ID is required for successful provisioning';
  END IF;

  UPDATE public.app_users AS app_user
  SET
    auth0_provisioning_status = CASE
      WHEN provisioning_error IS NULL THEN 'provisioned'
      ELSE 'failed'
    END,
    auth0_user_id = CASE
      WHEN provisioning_error IS NULL THEN trim(provisioned_auth0_user_id)
      ELSE app_user.auth0_user_id
    END,
    auth0_provisioning_error = CASE
      WHEN provisioning_error IS NULL THEN NULL
      ELSE left(provisioning_error, 500)
    END,
    auth0_provisioning_attempted_at = now(),
    updated_at = now()
  WHERE lower(trim(app_user.email)) = normalized_target_email;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_auth0_user_provisioning(text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_auth0_user_provisioning(text, text, text)
  TO authenticated;

DROP FUNCTION IF EXISTS public.list_admin_operators(text);

CREATE FUNCTION public.list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  staff_role text,
  staff_roles text[],
  auth0_provisioning_status text,
  assigned_shipper_users jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_users.id,
    app_users.email,
    app_users.user_name,
    COALESCE(app_users.staff_role, 'other') AS staff_role,
    COALESCE(
      app_users.staff_roles,
      ARRAY[COALESCE(app_users.staff_role, 'other')]::text[]
    ) AS staff_roles,
    app_users.auth0_provisioning_status,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', normal_user.id,
            'email', normal_user.email,
            'shipper_name', normal_user.shipper_name,
            'zipcode', normal_user.zipcode,
            'shipper_address', normal_user.shipper_address,
            'telephone', normal_user.telephone,
            'budget', normal_user.budget,
            'contact_person', normal_user.contact_person,
            'notes', normal_user.notes,
            'approval_status', normal_user.approval_status,
            'auth0_provisioning_status', normal_user.auth0_provisioning_status,
            'admin_assignments', get_normal_user_admin_assignments(normal_user.id),
            'created_at', normal_user.created_at,
            'updated_at', normal_user.updated_at
          )
          ORDER BY normal_user.shipper_name, normal_user.email
        )
        FROM public.app_user_admin_assignments AS assignment
        JOIN public.app_users AS normal_user
          ON normal_user.id = assignment.normal_user_id
        WHERE assignment.admin_user_id = app_users.id
          AND normal_user.role = 'normal'
          AND normal_user.deleted_at IS NULL
      ),
      '[]'::jsonb
    ) AS assigned_shipper_users,
    app_users.created_at,
    app_users.updated_at
  FROM public.app_users AS app_users
  WHERE app_users.role = 'admin'
    AND app_users.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.app_users AS requester
      WHERE lower(requester.email) = lower(trim(super_admin_email))
        AND requester.role = 'super_admin'
        AND requester.is_active = true
        AND requester.deleted_at IS NULL
    )
  ORDER BY app_users.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_admin_operators(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_operators(text)
  TO anon, authenticated;

DROP FUNCTION IF EXISTS public.list_registered_normal_users(text);

CREATE FUNCTION public.list_registered_normal_users(admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  shipper_name text,
  zipcode text,
  shipper_address text,
  telephone text,
  budget numeric,
  contact_person text,
  notes text,
  approval_status text,
  created_by text,
  created_at timestamptz,
  updated_at timestamptz,
  auth0_provisioning_status text,
  admin_assignments jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM public.app_users AS app_users
    WHERE lower(app_users.email) = lower(trim(admin_email))
      AND app_users.role IN ('admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    normal_user.id,
    normal_user.email,
    normal_user.shipper_name,
    normal_user.zipcode,
    normal_user.shipper_address,
    normal_user.telephone,
    normal_user.budget,
    normal_user.contact_person,
    normal_user.notes,
    normal_user.approval_status,
    normal_user.created_by,
    normal_user.created_at,
    normal_user.updated_at,
    normal_user.auth0_provisioning_status,
    public.get_normal_user_admin_assignments(normal_user.id) AS admin_assignments
  FROM public.app_users AS normal_user
  CROSS JOIN requester
  WHERE normal_user.role = 'normal'
    AND normal_user.deleted_at IS NULL
    AND (
      requester.role = 'super_admin'
      OR lower(COALESCE(normal_user.created_by, '')) = lower(requester.email)
      OR EXISTS (
        SELECT 1
        FROM public.app_user_admin_assignments AS assignment
        WHERE assignment.normal_user_id = normal_user.id
          AND assignment.admin_user_id = requester.id
      )
    )
  ORDER BY normal_user.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_registered_normal_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_registered_normal_users(text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
