/*
  Harden legacy demo-era APIs after the Auth0 migration.

  All authorization is derived from the verified Auth0 JWT. Client-supplied
  emails remain in function signatures for backward compatibility and for the
  explicit admin "switch to user" view, but they are never trusted on their own.
*/

CREATE OR REPLACE FUNCTION public.current_app_user_email()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  jwt_email text := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  email_verified boolean := COALESCE(
    (auth.jwt() ->> 'email_verified')::boolean,
    false
  );
BEGIN
  IF jwt_email = '' OR NOT email_verified THEN
    RAISE EXCEPTION 'A verified Auth0 email address is required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE lower(trim(app_users.email)) = jwt_email
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The authenticated user is not active'
      USING ERRCODE = '42501';
  END IF;

  RETURN jwt_email;
END;
$$;

REVOKE ALL ON FUNCTION public.current_app_user_email()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_user_email()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_users.role
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = public.current_app_user_email()
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_app_user_role()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_user_role()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.authenticated_caller_can_assume_email(
  target_email text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH caller AS (
    SELECT app_users.id, lower(trim(app_users.email)) AS email, app_users.role
    FROM public.app_users
    WHERE lower(trim(app_users.email)) = public.current_app_user_email()
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  ), target AS (
    SELECT app_users.id, lower(trim(app_users.email)) AS email, app_users.role,
      app_users.created_by
    FROM public.app_users
    WHERE lower(trim(app_users.email)) = lower(trim(target_email))
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM caller
      CROSS JOIN target
      WHERE caller.email = target.email
        OR caller.role = 'super_admin'
        OR (
          caller.role = 'admin'
          AND target.role = 'normal'
          AND (
            lower(trim(COALESCE(target.created_by, ''))) = caller.email
            OR EXISTS (
              SELECT 1
              FROM public.app_user_admin_assignments assignment
              WHERE assignment.normal_user_id = target.id
                AND assignment.admin_user_id = caller.id
            )
          )
        )
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.authenticated_caller_can_assume_email(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authenticated_caller_can_assume_email(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.authenticated_caller_can_manage_normal_user(
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.app_users target
      WHERE target.id = target_user_id
        AND target.role = 'normal'
        AND target.is_active = true
        AND target.deleted_at IS NULL
        AND public.authenticated_caller_can_assume_email(target.email)
        AND public.current_app_user_role() IN ('admin', 'super_admin')
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.authenticated_caller_can_manage_normal_user(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authenticated_caller_can_manage_normal_user(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_requester_access_shipment_shipper(
  requester_id uuid,
  requester_email text,
  requester_role text,
  target_shipper_name text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.authenticated_caller_can_assume_email(requester_email)
    AND EXISTS (
      SELECT 1
      FROM public.app_users claimed_requester
      WHERE claimed_requester.id = requester_id
        AND lower(trim(claimed_requester.email)) = lower(trim(requester_email))
        AND claimed_requester.role = requester_role
        AND claimed_requester.is_active = true
        AND claimed_requester.deleted_at IS NULL
    )
    AND (
      requester_role = 'super_admin'
      OR EXISTS (
        SELECT 1
        FROM public.app_users normal_user
        WHERE normal_user.role = 'normal'
          AND normal_user.is_active = true
          AND normal_user.deleted_at IS NULL
          AND lower(trim(normal_user.shipper_name)) = lower(trim(target_shipper_name))
          AND (
            (
              requester_role = 'normal'
              AND lower(trim(normal_user.email)) = lower(trim(requester_email))
            )
            OR (
              requester_role = 'admin'
              AND (
                lower(trim(COALESCE(normal_user.created_by, ''))) = lower(trim(requester_email))
                OR EXISTS (
                  SELECT 1
                  FROM public.app_user_admin_assignments assignment
                  WHERE assignment.normal_user_id = normal_user.id
                    AND assignment.admin_user_id = requester_id
                )
              )
            )
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_requester_access_shipment_shipper(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_requester_access_shipment_shipper(uuid, text, text, text)
  TO authenticated, service_role;

-- Remove all demo-era direct access to shipment business tables.
DROP POLICY IF EXISTS "Anyone can view shipment jobs" ON public.shipment_jobs;
DROP POLICY IF EXISTS "Anon can insert shipment jobs in demo" ON public.shipment_jobs;
DROP POLICY IF EXISTS "Anon can update shipment jobs in demo" ON public.shipment_jobs;
DROP POLICY IF EXISTS "Anyone can view shipment documents" ON public.shipment_documents;
DROP POLICY IF EXISTS "Anon can insert shipment documents in demo" ON public.shipment_documents;
DROP POLICY IF EXISTS "Anon can update shipment documents in demo" ON public.shipment_documents;
DROP POLICY IF EXISTS "Anon can delete shipment documents in demo" ON public.shipment_documents;
DROP POLICY IF EXISTS "Anyone can view active shipment tracking events" ON public.shipment_tracking_events;
DROP POLICY IF EXISTS "Anon can insert shipment tracking events in demo" ON public.shipment_tracking_events;
DROP POLICY IF EXISTS "Anon can update shipment tracking events in demo" ON public.shipment_tracking_events;

REVOKE ALL ON TABLE public.shipment_jobs, public.shipment_documents,
  public.shipment_tracking_events FROM anon, authenticated;
GRANT ALL ON TABLE public.shipment_jobs, public.shipment_documents,
  public.shipment_tracking_events TO service_role;

-- The pre-merge staging table is retained for migration history only.
DROP POLICY IF EXISTS "Anon can insert company users in demo" ON public.company_users;
DROP POLICY IF EXISTS "Anon can view company users in demo" ON public.company_users;
DROP POLICY IF EXISTS "Anon can update pending company users in demo" ON public.company_users;
REVOKE ALL ON TABLE public.company_users FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Standard-flow reads are available to authenticated users; writes are super-admin only.
DROP POLICY IF EXISTS "Anyone can view active shipment tracking event templates"
  ON public.shipment_tracking_event_templates;
DROP POLICY IF EXISTS "Anon can view all shipment tracking event templates in demo"
  ON public.shipment_tracking_event_templates;
DROP POLICY IF EXISTS "Anon can insert shipment tracking event templates in demo"
  ON public.shipment_tracking_event_templates;
DROP POLICY IF EXISTS "Anon can update shipment tracking event templates in demo"
  ON public.shipment_tracking_event_templates;

CREATE POLICY "Authenticated users can view active tracking templates"
  ON public.shipment_tracking_event_templates
  FOR SELECT TO authenticated
  USING (
    public.current_app_user_role() = 'super_admin'
    OR (deleted_at IS NULL AND is_active = true)
  );

CREATE POLICY "Super admins can insert tracking templates"
  ON public.shipment_tracking_event_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_user_role() = 'super_admin');

CREATE POLICY "Super admins can update tracking templates"
  ON public.shipment_tracking_event_templates
  FOR UPDATE TO authenticated
  USING (public.current_app_user_role() = 'super_admin')
  WITH CHECK (public.current_app_user_role() = 'super_admin');

REVOKE ALL ON TABLE public.shipment_tracking_event_templates FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.shipment_tracking_event_templates
  TO authenticated;

-- Lock the legacy parcel-management slice to operators.
DO $$
DECLARE
  table_name text;
  policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'carriers', 'warehouses', 'orders', 'parcels', 'shipments',
    'customs_declarations', 'tracking_events', 'parcel_documents'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN
      CONTINUE;
    END IF;

    FOR policy_record IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.current_app_user_role() IN (''admin'', ''super_admin'')) WITH CHECK (public.current_app_user_role() IN (''admin'', ''super_admin''))',
      'Operators can manage ' || table_name,
      table_name
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', table_name);
  END LOOP;
END;
$$;

-- Storage objects are private and can only be written by authorized operators.
UPDATE storage.buckets
SET public = false
WHERE id = 'shipment-documents';

DROP POLICY IF EXISTS "Anyone can read shipment documents" ON storage.objects;
DROP POLICY IF EXISTS "Anon can upload shipment documents in demo" ON storage.objects;
DROP POLICY IF EXISTS "Anon can update shipment documents in demo" ON storage.objects;
DROP POLICY IF EXISTS "Anon can delete shipment documents in demo" ON storage.objects;

CREATE POLICY "Authorized users can read shipment documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'shipment-documents'
    AND EXISTS (
      SELECT 1
      FROM public.shipment_documents document
      JOIN public.shipment_jobs job ON job.id = document.shipment_job_id
      JOIN public.app_users requester
        ON lower(trim(requester.email)) = public.current_app_user_email()
      WHERE document.storage_path = storage.objects.name
        AND document.deleted_at IS NULL
        AND requester.is_active = true
        AND requester.deleted_at IS NULL
        AND (
          (
            requester.role IN ('admin', 'super_admin')
            AND public.can_requester_access_shipment_shipper(
              requester.id, requester.email, requester.role, job.shipper_name
            )
          )
          OR (
            requester.role = 'normal'
            AND document.scope = 'customer'
            AND document.approval_status = 'approved'
            AND document.approved_at > now() - interval '3 days'
            AND public.can_requester_access_shipment_shipper(
              requester.id, requester.email, requester.role, job.shipper_name
            )
          )
        )
    )
  );

CREATE POLICY "Operators can upload shipment documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'shipment-documents'
    AND public.current_app_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "Operators can update owned shipment documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'shipment-documents'
    AND owner_id = (auth.jwt() ->> 'sub')
    AND public.current_app_user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    bucket_id = 'shipment-documents'
    AND owner_id = (auth.jwt() ->> 'sub')
    AND public.current_app_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "Operators can delete owned shipment documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'shipment-documents'
    AND owner_id = (auth.jwt() ->> 'sub')
    AND public.current_app_user_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "Authenticated users can upload app avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update app avatars" ON storage.objects;

CREATE POLICY "Authorized users can upload app avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'app-avatars'
    AND EXISTS (
      SELECT 1
      FROM public.app_users target
      WHERE regexp_replace(lower(target.email), '[^a-z0-9]+', '-', 'g') =
        (storage.foldername(storage.objects.name))[1]
        AND public.authenticated_caller_can_assume_email(target.email)
    )
  );

CREATE POLICY "Authorized users can update app avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'app-avatars'
    AND EXISTS (
      SELECT 1
      FROM public.app_users target
      WHERE regexp_replace(lower(target.email), '[^a-z0-9]+', '-', 'g') =
        (storage.foldername(storage.objects.name))[1]
        AND public.authenticated_caller_can_assume_email(target.email)
    )
  )
  WITH CHECK (
    bucket_id = 'app-avatars'
    AND EXISTS (
      SELECT 1
      FROM public.app_users target
      WHERE regexp_replace(lower(target.email), '[^a-z0-9]+', '-', 'g') =
        (storage.foldername(storage.objects.name))[1]
        AND public.authenticated_caller_can_assume_email(target.email)
    )
  );

-- Preserve the admin switch-to-user view, but require the JWT caller to be
-- allowed to assume the requested account. Never return a usable file URL when
-- a customer document is outside its approval window.
CREATE OR REPLACE FUNCTION public.list_accessible_shipment_documents(
  requester_email text
)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  scope text,
  name text,
  storage_path text,
  file_url text,
  approval_status text,
  rejection_reason text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM public.app_users
    WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
      AND public.authenticated_caller_can_assume_email(app_users.email)
    LIMIT 1
  )
  SELECT
    document.id,
    document.shipment_job_id,
    document.scope,
    document.name,
    CASE
      WHEN requester.role = 'normal'
        AND document.scope = 'customer'
        AND NOT (
          document.approval_status = 'approved'
          AND document.approved_at IS NOT NULL
          AND document.approved_at > now() - interval '3 days'
        )
        THEN NULL
      ELSE document.storage_path
    END,
    CASE
      WHEN requester.role = 'normal'
        AND document.scope = 'customer'
        AND NOT (
          document.approval_status = 'approved'
          AND document.approved_at IS NOT NULL
          AND document.approved_at > now() - interval '3 days'
        )
        THEN NULL
      ELSE document.file_url
    END,
    document.approval_status,
    document.rejection_reason,
    document.approved_at,
    document.approved_by,
    document.created_at,
    document.updated_at
  FROM public.shipment_documents document
  JOIN public.shipment_jobs job ON job.id = document.shipment_job_id
  CROSS JOIN requester
  WHERE job.shipper_name IS NOT NULL
    AND document.deleted_at IS NULL
    AND (requester.role <> 'normal' OR document.scope = 'customer')
    AND public.can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      job.shipper_name
    )
  ORDER BY document.created_at ASC, document.id ASC;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipment_documents(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_documents(text)
  TO authenticated, service_role;

-- Profile calls retain their compatible parameters, but the JWT must authorize
-- the requested account (including an assigned admin's switch-to-user view).
CREATE OR REPLACE FUNCTION public.get_app_user_profile(profile_email text)
RETURNS TABLE(
  email text,
  role text,
  avatar_url text,
  shipper_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_users.email, app_users.role, app_users.avatar_url, app_users.shipper_name
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = lower(trim(profile_email))
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_app_user_profile(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_app_user_profile(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_app_user_avatar(
  profile_email text,
  profile_avatar_url text
)
RETURNS TABLE(
  email text,
  role text,
  avatar_url text,
  shipper_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.app_users
  SET avatar_url = NULLIF(trim(profile_avatar_url), ''), updated_at = now()
  WHERE lower(trim(app_users.email)) = lower(trim(profile_email))
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  RETURNING app_users.email, app_users.role, app_users.avatar_url,
    app_users.shipper_name;
$$;

REVOKE ALL ON FUNCTION public.update_app_user_avatar(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_app_user_avatar(text, text)
  TO authenticated, service_role;

-- Every remaining shipment RPC must pass through the JWT-aware access helper.
REVOKE ALL ON FUNCTION public.list_accessible_shipment_jobs(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_jobs(text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_accessible_shipment_tracking_events(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_tracking_events(text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_accessible_shipment_job(text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accessible_shipment_job(text, uuid, jsonb)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_accessible_shipment_documents(text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_accessible_shipment_documents(text, uuid, jsonb)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_accessible_shipment_tracking_events(text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_accessible_shipment_tracking_events(text, uuid, jsonb)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_accessible_shipment_document_download(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_accessible_shipment_document_download(text, uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_accessible_shipment_document_approval(text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accessible_shipment_document_approval(text, uuid, text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.soft_delete_accessible_shipment_document(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_accessible_shipment_document(text, uuid)
  TO authenticated, service_role;

-- Wrap legacy operator mutations so their historical email parameters are
-- cross-checked against the authenticated super admin.
ALTER FUNCTION public.create_admin_operator(text, text, text[], text, text)
  RENAME TO create_admin_operator_unchecked_20260822;
REVOKE ALL ON FUNCTION public.create_admin_operator_unchecked_20260822(text, text, text[], text, text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_admin_operator(
  operator_email text,
  operator_name text,
  operator_staff_roles text[],
  operator_password text,
  super_admin_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() <> 'super_admin'
    OR lower(trim(super_admin_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated super admin can create admin operators'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.create_admin_operator_unchecked_20260822(
    operator_email, operator_name, operator_staff_roles, operator_password,
    super_admin_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_operator(text, text, text[], text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_operator(text, text, text[], text, text)
  TO authenticated, service_role;

ALTER FUNCTION public.update_admin_operator(text, uuid, text, text[])
  RENAME TO update_admin_operator_unchecked_20260822;
REVOKE ALL ON FUNCTION public.update_admin_operator_unchecked_20260822(text, uuid, text, text[])
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.update_admin_operator(
  super_admin_email text,
  target_operator_id uuid,
  operator_name text,
  operator_staff_roles text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() <> 'super_admin'
    OR lower(trim(super_admin_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated super admin can update admin operators'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.update_admin_operator_unchecked_20260822(
    super_admin_email, target_operator_id, operator_name, operator_staff_roles
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_admin_operator(text, uuid, text, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_operator(text, uuid, text, text[])
  TO authenticated, service_role;

-- The JSON contact overload is the only shipper-creation API used by the app.
ALTER FUNCTION public.create_registered_normal_user(text, text, text, text, numeric, jsonb, text, text)
  RENAME TO create_registered_normal_user_unchecked_20260822;
REVOKE ALL ON FUNCTION public.create_registered_normal_user_unchecked_20260822(text, text, text, text, numeric, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_registered_normal_user(
  user_shipper_name text,
  user_zipcode text,
  user_shipper_address text,
  user_telephone text,
  user_budget numeric,
  user_contacts jsonb,
  user_notes text,
  admin_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() NOT IN ('admin', 'super_admin')
    OR lower(trim(admin_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'The authenticated operator cannot create shipper users'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.create_registered_normal_user_unchecked_20260822(
    user_shipper_name, user_zipcode, user_shipper_address, user_telephone,
    user_budget, user_contacts, user_notes, admin_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_registered_normal_user(text, text, text, text, numeric, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_registered_normal_user(text, text, text, text, numeric, jsonb, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_registered_normal_user(text, text, text, text, text, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.update_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text)
  RENAME TO update_registered_normal_user_unchecked_20260822;
REVOKE ALL ON FUNCTION public.update_registered_normal_user_unchecked_20260822(uuid, text, text, text, text, text, numeric, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.update_registered_normal_user(
  user_id uuid,
  user_email text,
  user_shipper_name text,
  user_zipcode text,
  user_shipper_address text,
  user_telephone text,
  user_budget numeric,
  user_contact_person text,
  user_notes text
)
RETURNS TABLE(
  id uuid, email text, shipper_name text, zipcode text, shipper_address text,
  telephone text, budget numeric, contact_person text, notes text,
  approval_status text, created_by text, created_at timestamptz,
  updated_at timestamptz, admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.authenticated_caller_can_manage_normal_user(user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot update this shipper user'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.update_registered_normal_user_unchecked_20260822(
    user_id, user_email, user_shipper_name, user_zipcode,
    user_shipper_address, user_telephone, user_budget,
    user_contact_person, user_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text)
  TO authenticated, service_role;

ALTER FUNCTION public.update_registered_shipper_contacts(uuid, text, text, text, text, numeric, jsonb, text)
  RENAME TO update_registered_shipper_contacts_unchecked_20260822;
REVOKE ALL ON FUNCTION public.update_registered_shipper_contacts_unchecked_20260822(uuid, text, text, text, text, numeric, jsonb, text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.update_registered_shipper_contacts(
  target_user_id uuid,
  user_shipper_name text,
  user_zipcode text,
  user_shipper_address text,
  user_telephone text,
  user_budget numeric,
  user_contacts jsonb,
  user_notes text
)
RETURNS TABLE(
  id uuid, email text, shipper_name text, zipcode text, shipper_address text,
  telephone text, budget numeric, contact_person text, notes text,
  approval_status text, created_by text, created_at timestamptz,
  updated_at timestamptz, admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.authenticated_caller_can_manage_normal_user(target_user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot update these shipper contacts'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.update_registered_shipper_contacts_unchecked_20260822(
    target_user_id, user_shipper_name, user_zipcode, user_shipper_address,
    user_telephone, user_budget, user_contacts, user_notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_registered_shipper_contacts(uuid, text, text, text, text, numeric, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_registered_shipper_contacts(uuid, text, text, text, text, numeric, jsonb, text)
  TO authenticated, service_role;

ALTER FUNCTION public.update_normal_user_approval_status(text, uuid, text)
  RENAME TO update_normal_user_approval_status_unchecked_20260822;
REVOKE ALL ON FUNCTION public.update_normal_user_approval_status_unchecked_20260822(text, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.update_normal_user_approval_status(
  super_admin_email text,
  target_user_id uuid,
  next_approval_status text
)
RETURNS TABLE(
  id uuid, email text, shipper_name text, zipcode text, shipper_address text,
  telephone text, budget numeric, contact_person text, notes text,
  approval_status text, created_by text, created_at timestamptz,
  updated_at timestamptz, admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() <> 'super_admin'
    OR lower(trim(super_admin_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated super admin can approve shipper users'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT * FROM public.update_normal_user_approval_status_unchecked_20260822(
    super_admin_email, target_user_id, next_approval_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_normal_user_approval_status(text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_normal_user_approval_status(text, uuid, text)
  TO authenticated, service_role;

ALTER FUNCTION public.update_normal_user_admin_assignments(text, uuid, uuid[])
  RENAME TO update_normal_user_admin_assignments_unchecked_20260822;
REVOKE ALL ON FUNCTION public.update_normal_user_admin_assignments_unchecked_20260822(text, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.update_normal_user_admin_assignments(
  super_admin_email text,
  target_user_id uuid,
  admin_user_ids uuid[]
)
RETURNS TABLE(
  id uuid, email text, shipper_name text, zipcode text, shipper_address text,
  telephone text, budget numeric, contact_person text, notes text,
  approval_status text, created_by text, created_at timestamptz,
  updated_at timestamptz, admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() <> 'super_admin'
    OR lower(trim(super_admin_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated super admin can update assignments'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT * FROM public.update_normal_user_admin_assignments_unchecked_20260822(
    super_admin_email, target_user_id, admin_user_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_normal_user_admin_assignments(text, uuid, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_normal_user_admin_assignments(text, uuid, uuid[])
  TO authenticated, service_role;

-- These compatibility deletion RPCs are no longer used by the client, but must
-- not remain anonymous escalation paths.
REVOKE ALL ON FUNCTION public.delete_admin_operator(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_normal_user(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_normal_user_admin_assignments(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text)
  FROM PUBLIC, anon, authenticated;

-- Feedback submission is a single transaction for all target roles and is
-- bound to the authenticated normal user.
ALTER FUNCTION public.submit_shipment_feedback(uuid, text, integer, integer, integer, integer, integer, text, text)
  RENAME TO submit_shipment_feedback_unchecked_20260822;
REVOKE ALL ON FUNCTION public.submit_shipment_feedback_unchecked_20260822(uuid, text, integer, integer, integer, integer, integer, text, text)
  FROM PUBLIC, anon, authenticated;

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
  target_feedback jsonb;
BEGIN
  IF lower(trim(feedback_submitter_email)) <> public.current_app_user_email()
    OR public.current_app_user_role() <> 'normal' THEN
    RAISE EXCEPTION 'Feedback must be submitted by the authenticated normal user'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(feedback_by_target) <> 'array'
    OR jsonb_array_length(feedback_by_target) = 0 THEN
    RAISE EXCEPTION 'At least one feedback target is required';
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
    RETURN QUERY
    SELECT *
    FROM public.submit_shipment_feedback_unchecked_20260822(
      feedback_shipment_job_id,
      feedback_submitter_email,
      (target_feedback->>'attitude_rating')::integer,
      (target_feedback->>'professionalism_rating')::integer,
      (target_feedback->>'speed_rating')::integer,
      (target_feedback->>'accuracy_rating')::integer,
      (target_feedback->>'price_rating')::integer,
      target_feedback->>'target_role',
      feedback_reason
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_shipment_feedback_batch(uuid, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shipment_feedback_batch(uuid, text, jsonb, text)
  TO authenticated, service_role;

ALTER FUNCTION public.list_shipment_feedback_for_user(text)
  RENAME TO list_shipment_feedback_for_user_unchecked_20260822;
REVOKE ALL ON FUNCTION public.list_shipment_feedback_for_user_unchecked_20260822(text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.list_shipment_feedback_for_user(
  feedback_submitter_email text
)
RETURNS TABLE(
  id uuid, shipment_job_id uuid, submitter_email text,
  admin_operator_email text, admin_operator_staff_role text, rating integer,
  attitude_rating integer, professionalism_rating integer, speed_rating integer,
  accuracy_rating integer, price_rating integer, reason text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT *
  FROM public.list_shipment_feedback_for_user_unchecked_20260822(
    feedback_submitter_email
  )
  WHERE public.authenticated_caller_can_assume_email(feedback_submitter_email);
$$;

REVOKE ALL ON FUNCTION public.list_shipment_feedback_for_user(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_shipment_feedback_for_user(text)
  TO authenticated, service_role;

ALTER FUNCTION public.list_all_shipment_feedback(text)
  RENAME TO list_all_shipment_feedback_unchecked_20260822;
REVOKE ALL ON FUNCTION public.list_all_shipment_feedback_unchecked_20260822(text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.list_all_shipment_feedback(super_admin_email text)
RETURNS TABLE(
  id uuid, shipment_job_id uuid, shipment_invoice_number text,
  submitter_email text, admin_operator_email text,
  admin_operator_staff_role text, rating integer, attitude_rating integer,
  professionalism_rating integer, speed_rating integer, accuracy_rating integer,
  price_rating integer, reason text, created_at timestamptz,
  updated_at timestamptz
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
  SELECT * FROM public.list_all_shipment_feedback_unchecked_20260822(
    super_admin_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_all_shipment_feedback(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_all_shipment_feedback(text)
  TO authenticated, service_role;

-- Save job metadata, documents, and tracking events in one database transaction.
CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job(
  requester_email text,
  target_job_id uuid,
  job_payload jsonb,
  documents_payload jsonb,
  events_payload jsonb,
  create_new boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text := NULLIF(job_payload->>'shipper_name', '');
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot save shipment jobs'
      USING ERRCODE = '42501';
  END IF;

  IF target_shipper_name IS NULL OR NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipper'
      USING ERRCODE = '42501';
  END IF;

  IF create_new THEN
    INSERT INTO public.shipment_jobs (
      id, status, under_process_from_date, under_process_to_date,
      customs_hold_from_date, customs_hold_to_date, completed_from_date,
      completed_to_date, trade_mode, trade_term, invoice_number, job_number,
      transport_mode, shipper_name, consignee_name, pol_aol, pod_aod,
      vessel_flight_numbers, mbl_mawb, hbl_hawb, bl_awb_date,
      assigned_admin_user_ids, progress_percent, progress_step,
      progress_color_hex, documents, internal_documents, notes
    ) VALUES (
      target_job_id,
      job_payload->>'status',
      NULLIF(job_payload->>'under_process_from_date', '')::date,
      NULLIF(job_payload->>'under_process_to_date', '')::date,
      NULLIF(job_payload->>'customs_hold_from_date', '')::date,
      NULLIF(job_payload->>'customs_hold_to_date', '')::date,
      NULLIF(job_payload->>'completed_from_date', '')::date,
      NULLIF(job_payload->>'completed_to_date', '')::date,
      job_payload->>'trade_mode',
      NULLIF(job_payload->>'trade_term', ''),
      NULLIF(job_payload->>'invoice_number', ''),
      NULLIF(job_payload->>'job_number', ''),
      NULLIF(job_payload->>'transport_mode', ''),
      target_shipper_name,
      NULLIF(job_payload->>'consignee_name', ''),
      NULLIF(job_payload->>'pol_aol', ''),
      NULLIF(job_payload->>'pod_aod', ''),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(job_payload->'vessel_flight_numbers')),
        ARRAY[]::text[]
      ),
      NULLIF(job_payload->>'mbl_mawb', ''),
      NULLIF(job_payload->>'hbl_hawb', ''),
      NULLIF(job_payload->>'bl_awb_date', '')::date,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(job_payload->'assigned_admin_user_ids')::uuid),
        ARRAY[]::uuid[]
      ),
      NULLIF(job_payload->>'progress_percent', '')::integer,
      NULLIF(job_payload->>'progress_step', '')::integer,
      NULLIF(job_payload->>'progress_color_hex', ''),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(job_payload->'documents')),
        ARRAY[]::text[]
      ),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(job_payload->'internal_documents')),
        ARRAY[]::text[]
      ),
      NULLIF(job_payload->>'notes', '')
    );
  ELSE
    PERFORM public.update_accessible_shipment_job(
      requester_email, target_job_id, job_payload
    );
  END IF;

  PERFORM public.replace_accessible_shipment_documents(
    requester_email, target_job_id, COALESCE(documents_payload, '[]'::jsonb)
  );
  PERFORM public.replace_accessible_shipment_tracking_events(
    requester_email, target_job_id, COALESCE(events_payload, '[]'::jsonb)
  );

  RETURN target_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_accessible_shipment_job(text, uuid, jsonb, jsonb, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_accessible_shipment_job(text, uuid, jsonb, jsonb, jsonb, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
