/*
  # Harden Auth0 lifecycle and legacy RPC surface

  Keep preparation bound to the verified caller JWT, restrict lifecycle
  completion to the trusted Edge Function, require pending state transitions,
  and remove obsolete browser-callable shipment mutation endpoints.
*/

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
  actual_target_id uuid;
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
    actual_target_id := NULL;
    actual_target_role := NULL;

    IF normalized_target_email = ''
      OR requested_target_role NOT IN ('admin', 'normal') THEN
      RAISE EXCEPTION 'Invalid Auth0 provisioning request';
    END IF;

    IF requester_role = 'admin' AND requested_target_role <> 'normal' THEN
      RAISE EXCEPTION 'Admin users can only provision normal users'
        USING ERRCODE = '42501';
    END IF;

    SELECT app_user.id, app_user.role
    INTO actual_target_id, actual_target_role
    FROM public.app_users AS app_user
    WHERE lower(trim(app_user.email)) = normalized_target_email
      AND app_user.role = requested_target_role
      AND app_user.is_active = true
      AND app_user.deleted_at IS NULL
    LIMIT 1;

    IF actual_target_id IS NULL THEN
      RAISE EXCEPTION 'The application user must exist before Auth0 provisioning'
        USING ERRCODE = '42501';
    END IF;

    IF requester_role = 'admin'
      AND NOT public.authenticated_caller_can_manage_normal_user(actual_target_id) THEN
      RAISE EXCEPTION 'Admin users can only provision users they manage'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.app_users AS app_user
    SET
      auth0_provisioning_status = 'pending',
      auth0_provisioning_error = NULL,
      auth0_provisioning_attempted_at = now(),
      updated_at = now()
    WHERE app_user.id = actual_target_id;

    email := normalized_target_email;
    role := actual_target_role;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_auth0_user_provisioning(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_auth0_user_provisioning(jsonb)
  TO authenticated, service_role;

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
  normalized_target_email text := lower(trim(provisioned_email));
BEGIN
  IF normalized_target_email = '' THEN
    RAISE EXCEPTION 'A provisioned email address is required';
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
  WHERE lower(trim(app_user.email)) = normalized_target_email
    AND app_user.role IN ('admin', 'normal')
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
    AND app_user.auth0_provisioning_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending Auth0 user provisioning was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_auth0_user_provisioning(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_auth0_user_provisioning(text, text, text)
  TO service_role;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS auth0_deletion_requested_by text;

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
    auth0_deletion_requested_by = requester_email,
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
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finish_auth0_user_deletion(
  target_user_id uuid,
  deletion_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF deletion_error IS NULL THEN
    UPDATE public.app_users AS target
    SET
      is_active = false,
      deleted_at = now(),
      deleted_by = target.auth0_deletion_requested_by,
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
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_auth0_user_deletion(uuid, text)
  TO service_role;

-- These functions remain available to the owner for the atomic save RPC, but
-- are no longer separate browser-callable mutation endpoints.
REVOKE ALL ON FUNCTION public.update_accessible_shipment_job(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_accessible_shipment_documents(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_accessible_shipment_tracking_events(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_accessible_shipment_job(text, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_accessible_shipment_documents(text, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_accessible_shipment_tracking_events(text, uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.list_accessible_shipment_tracking_events(
  requester_email text
)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  event_date date,
  location text,
  description text,
  sort_order integer,
  deleted_at timestamptz,
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
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    shipment_tracking_events.id,
    shipment_tracking_events.shipment_job_id,
    shipment_tracking_events.event_date,
    shipment_tracking_events.location,
    shipment_tracking_events.description,
    shipment_tracking_events.sort_order,
    shipment_tracking_events.deleted_at,
    shipment_tracking_events.created_at,
    shipment_tracking_events.updated_at
  FROM public.shipment_tracking_events
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_tracking_events.shipment_job_id
  CROSS JOIN requester
  WHERE shipment_tracking_events.deleted_at IS NULL
    AND shipment_jobs.shipper_name IS NOT NULL
    AND public.can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.shipper_name
    )
  ORDER BY
    shipment_tracking_events.event_date DESC,
    shipment_tracking_events.sort_order ASC,
    shipment_tracking_events.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.replace_accessible_shipment_documents(
  requester_email text,
  target_job_id uuid,
  documents_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_record record;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Requester is not allowed to replace shipment documents';
  END IF;

  SELECT shipment_jobs.id, shipment_jobs.shipper_name
  INTO target_record
  FROM public.shipment_jobs
  WHERE shipment_jobs.id = target_job_id
  LIMIT 1;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'Shipment job not found';
  END IF;

  IF target_record.shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_record.shipper_name
    )
  THEN
    RAISE EXCEPTION 'Requester cannot replace this shipment job document set';
  END IF;

  UPDATE public.shipment_documents
  SET
    deleted_at = now(),
    deleted_by = requester_record.email,
    updated_at = now()
  WHERE shipment_documents.shipment_job_id = target_job_id
    AND shipment_documents.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(documents_payload, '[]'::jsonb)) AS document_payload
      WHERE document_payload->>'scope' = shipment_documents.scope
        AND document_payload->>'name' = shipment_documents.name
    );

  INSERT INTO public.shipment_documents (
    shipment_job_id,
    scope,
    name,
    storage_path,
    file_url,
    approval_status,
    rejection_reason,
    approved_at,
    approved_by,
    deleted_at,
    deleted_by
  )
  SELECT
    target_job_id,
    document_payload->>'scope',
    document_payload->>'name',
    NULLIF(document_payload->>'storage_path', ''),
    NULLIF(document_payload->>'file_url', ''),
    COALESCE(NULLIF(document_payload->>'approval_status', ''), 'not_requested'),
    NULLIF(document_payload->>'rejection_reason', ''),
    NULLIF(document_payload->>'approved_at', '')::timestamptz,
    NULLIF(document_payload->>'approved_by', ''),
    NULL,
    NULL
  FROM jsonb_array_elements(COALESCE(documents_payload, '[]'::jsonb)) AS document_payload
  WHERE document_payload->>'scope' IN ('customer', 'internal')
    AND NULLIF(document_payload->>'name', '') IS NOT NULL
  ON CONFLICT (shipment_job_id, scope, name) DO UPDATE
  SET
    storage_path = EXCLUDED.storage_path,
    file_url = EXCLUDED.file_url,
    approval_status = EXCLUDED.approval_status,
    rejection_reason = EXCLUDED.rejection_reason,
    approved_at = EXCLUDED.approved_at,
    approved_by = EXCLUDED.approved_by,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_accessible_shipment_tracking_events(
  requester_email text,
  target_job_id uuid,
  events_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_record record;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Requester is not allowed to update shipment tracking events';
  END IF;

  SELECT shipment_jobs.id, shipment_jobs.shipper_name
  INTO target_record
  FROM public.shipment_jobs
  WHERE shipment_jobs.id = target_job_id
  LIMIT 1;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'Shipment job not found';
  END IF;

  IF target_record.shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_record.shipper_name
    )
  THEN
    RAISE EXCEPTION 'Requester cannot update this shipment job';
  END IF;

  UPDATE public.shipment_tracking_events
  SET deleted_at = now()
  WHERE shipment_tracking_events.shipment_job_id = target_job_id
    AND shipment_tracking_events.deleted_at IS NULL;

  INSERT INTO public.shipment_tracking_events (
    shipment_job_id,
    event_date,
    location,
    description,
    sort_order,
    deleted_at
  )
  SELECT
    target_job_id,
    NULLIF(event_record.event_date, '')::date,
    NULLIF(event_record.location, ''),
    event_record.description,
    event_record.sort_order,
    NULL
  FROM jsonb_to_recordset(COALESCE(events_payload, '[]'::jsonb)) AS event_record(
    event_date text,
    location text,
    description text,
    sort_order integer
  )
  WHERE NULLIF(event_record.event_date, '') IS NOT NULL
    AND NULLIF(event_record.description, '') IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_accessible_shipment_document_download(
  requester_email text,
  target_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('normal', 'admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only active users can request document downloads';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM public.shipment_documents
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND (
      shipment_documents.approval_status IN ('not_requested', 'rejected')
      OR (
        shipment_documents.approval_status = 'approved'
        AND (
          shipment_documents.approved_at IS NULL
          OR shipment_documents.approved_at <= now() - interval '3 days'
        )
      )
    )
  LIMIT 1;

  IF target_shipper_name IS NULL THEN
    RAISE EXCEPTION 'Requestable customer document was not found';
  END IF;

  IF NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'User cannot request this shipper document';
  END IF;

  UPDATE public.shipment_documents
  SET
    approval_status = 'pending',
    approved_at = NULL,
    approved_by = NULL,
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = target_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_accessible_shipment_document_approval(
  requester_email text,
  target_document_id uuid,
  next_approval_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
BEGIN
  IF next_approval_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported approval status';
  END IF;

  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only admins can approve document download requests';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM public.shipment_documents
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND shipment_documents.approval_status = 'pending'
  LIMIT 1;

  IF target_shipper_name IS NULL THEN
    RAISE EXCEPTION 'Pending customer document request was not found';
  END IF;

  IF NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'Admin cannot approve this shipper document';
  END IF;

  UPDATE public.shipment_documents
  SET
    approval_status = next_approval_status,
    approved_at = CASE
      WHEN next_approval_status = 'approved' THEN now()
      ELSE NULL
    END,
    approved_by = CASE
      WHEN next_approval_status = 'approved' THEN requester_record.email
      ELSE NULL
    END,
    rejection_reason = CASE
      WHEN next_approval_status = 'rejected' THEN ''
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_accessible_shipment_document(
  requester_email text,
  target_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_record record;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only admins can delete shipment documents';
  END IF;

  SELECT
    shipment_documents.id,
    shipment_jobs.shipper_name
  INTO target_record
  FROM public.shipment_documents
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.deleted_at IS NULL
  LIMIT 1;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'Shipment document was not found';
  END IF;

  IF NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_record.shipper_name
  ) THEN
    RAISE EXCEPTION 'Admin cannot delete this shipper document';
  END IF;

  UPDATE public.shipment_documents
  SET
    deleted_at = now(),
    deleted_by = requester_record.email,
    updated_at = now()
  WHERE id = target_document_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment document was not deleted';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipment_tracking_events(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_tracking_events(text)
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

NOTIFY pgrst, 'reload schema';
