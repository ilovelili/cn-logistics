/*
  # Fix Storage policies after protected-table grants were revoked

  Keep app_users and shipment business tables behind the hardened RPC boundary.
  Storage RLS must not query those protected tables as the authenticated caller,
  so move the existing authorization predicates into narrowly scoped helpers in
  an unexposed schema and have the policies call those helpers instead.
*/

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_access_shipment_document_object(
  object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.shipment_documents AS document
      JOIN public.shipment_jobs AS job
        ON job.id = document.shipment_job_id
      JOIN public.app_users AS requester
        ON lower(trim(requester.email)) = public.current_app_user_email()
      WHERE document.storage_path = object_name
        AND document.deleted_at IS NULL
        AND requester.is_active = true
        AND requester.deleted_at IS NULL
        AND (
          (
            requester.role IN ('admin', 'super_admin')
            AND public.can_requester_access_shipment_shipper(
              requester.id,
              requester.email,
              requester.role,
              job.shipper_name
            )
          )
          OR (
            requester.role = 'normal'
            AND document.scope = 'customer'
            AND document.approval_status = 'approved'
            AND document.approved_at > now() - interval '3 days'
            AND public.can_requester_access_shipment_shipper(
              requester.id,
              requester.email,
              requester.role,
              job.shipper_name
            )
          )
        )
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_shipment_document_object(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_shipment_document_object(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_manage_app_avatar_object(
  object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.app_users AS target
      WHERE regexp_replace(lower(target.email), '[^a-z0-9]+', '-', 'g') =
        (storage.foldername(object_name))[1]
        AND public.authenticated_caller_can_assume_email(target.email)
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION private.can_manage_app_avatar_object(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_app_avatar_object(text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Authorized users can read shipment documents"
  ON storage.objects;

CREATE POLICY "Authorized users can read shipment documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'shipment-documents'
    AND private.can_access_shipment_document_object(storage.objects.name)
  );

DROP POLICY IF EXISTS "Authorized users can upload app avatars"
  ON storage.objects;

CREATE POLICY "Authorized users can upload app avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'app-avatars'
    AND private.can_manage_app_avatar_object(storage.objects.name)
  );

DROP POLICY IF EXISTS "Authorized users can update app avatars"
  ON storage.objects;

CREATE POLICY "Authorized users can update app avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'app-avatars'
    AND private.can_manage_app_avatar_object(storage.objects.name)
  )
  WITH CHECK (
    bucket_id = 'app-avatars'
    AND private.can_manage_app_avatar_object(storage.objects.name)
  );

NOTIFY pgrst, 'reload schema';
