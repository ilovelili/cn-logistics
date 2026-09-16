CREATE TABLE public.shipper_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES public.app_users(id),
  shipper_name text NOT NULL,
  shipper_created_by text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid NOT NULL REFERENCES public.app_users(id),
  requested_by_email text NOT NULL,
  current_snapshot jsonb NOT NULL,
  proposed_snapshot jsonb NOT NULL,
  reviewed_by uuid REFERENCES public.app_users(id),
  reviewed_by_email text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shipper_change_requests_one_pending_per_group
  ON public.shipper_change_requests (
    lower(trim(shipper_name)),
    COALESCE(lower(trim(shipper_created_by)), '')
  )
  WHERE status = 'pending';

CREATE INDEX shipper_change_requests_status_created_at
  ON public.shipper_change_requests(status, created_at DESC);

ALTER TABLE public.shipper_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shipper_change_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.shipper_group_snapshot(target_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  WITH target AS (
    SELECT shipper_name, created_by
    FROM public.app_users
    WHERE id = target_user_id
      AND role = 'normal'
      AND is_active
      AND deleted_at IS NULL
  ), contacts AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', shipper_user.id,
        'email', shipper_user.email,
        'contact_person', COALESCE(shipper_user.contact_person, '')
      ) ORDER BY shipper_user.created_at, shipper_user.id
    ) AS value
    FROM public.app_users AS shipper_user
    CROSS JOIN target
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active
      AND shipper_user.deleted_at IS NULL
      AND shipper_user.shipper_name = target.shipper_name
      AND COALESCE(shipper_user.created_by, '') = COALESCE(target.created_by, '')
  ), assignments AS (
    SELECT jsonb_agg(DISTINCT assignment.admin_user_id ORDER BY assignment.admin_user_id) AS value
    FROM public.app_user_admin_assignments AS assignment
    INNER JOIN public.app_users AS shipper_user ON shipper_user.id = assignment.normal_user_id
    CROSS JOIN target
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active
      AND shipper_user.deleted_at IS NULL
      AND shipper_user.shipper_name = target.shipper_name
      AND COALESCE(shipper_user.created_by, '') = COALESCE(target.created_by, '')
  )
  SELECT jsonb_build_object(
    'shipper_name', representative.shipper_name,
    'zipcode', COALESCE(representative.zipcode, ''),
    'shipper_address', COALESCE(representative.shipper_address, ''),
    'telephone', COALESCE(representative.telephone, ''),
    'budget', representative.budget,
    'notes', COALESCE(representative.notes, ''),
    'contacts', COALESCE(contacts.value, '[]'::jsonb),
    'admin_user_ids', COALESCE(assignments.value, '[]'::jsonb)
  )
  FROM target
  INNER JOIN LATERAL (
    SELECT shipper_user.*
    FROM public.app_users AS shipper_user
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active
      AND shipper_user.deleted_at IS NULL
      AND shipper_user.shipper_name = target.shipper_name
      AND COALESCE(shipper_user.created_by, '') = COALESCE(target.created_by, '')
    ORDER BY shipper_user.created_at, shipper_user.id
    LIMIT 1
  ) AS representative ON true
  CROSS JOIN contacts
  CROSS JOIN assignments;
$$;

REVOKE ALL ON FUNCTION public.shipper_group_snapshot(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.list_accessible_shipper_change_requests()
RETURNS TABLE(
  id uuid,
  target_user_id uuid,
  shipper_name text,
  status text,
  requested_by_email text,
  current_snapshot jsonb,
  proposed_snapshot jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  caller_id uuid;
  caller_role text;
  caller_is_sales boolean;
BEGIN
  SELECT
    app_user.id,
    app_user.role,
    'sales' = ANY(COALESCE(app_user.staff_roles, ARRAY[COALESCE(app_user.staff_role, 'other')]))
  INTO caller_id, caller_role, caller_is_sales
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = public.current_app_user_email()
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  IF caller_id IS NULL OR caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only authenticated operators can list shipper change requests'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    request.id,
    request.target_user_id,
    request.shipper_name,
    request.status,
    request.requested_by_email,
    request.current_snapshot,
    request.proposed_snapshot,
    request.created_at
  FROM public.shipper_change_requests AS request
  WHERE request.status = 'pending'
    AND (
      caller_role = 'super_admin'
      OR (
        caller_is_sales
        AND (
          request.requested_by = caller_id
          OR EXISTS (
            SELECT 1
            FROM public.app_user_admin_assignments AS assignment
            WHERE assignment.normal_user_id = request.target_user_id
              AND assignment.admin_user_id = caller_id
          )
        )
      )
    )
  ORDER BY request.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipper_change_requests()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipper_change_requests()
  TO authenticated, service_role;

CREATE FUNCTION public.submit_shipper_change_request(
  target_user_id uuid,
  proposed_shipper_name text,
  proposed_zipcode text,
  proposed_shipper_address text,
  proposed_telephone text,
  proposed_budget numeric,
  proposed_contacts jsonb,
  proposed_notes text,
  proposed_admin_user_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid;
  caller_email text;
  target_record record;
  normalized_contacts jsonb;
  normalized_admin_ids uuid[];
  current_data jsonb;
  proposed_data jsonb;
  request_id uuid;
BEGIN
  caller_email := public.current_app_user_email();
  SELECT app_user.id
  INTO caller_id
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = caller_email
    AND app_user.role = 'admin'
    AND 'sales' = ANY(COALESCE(app_user.staff_roles, ARRAY[COALESCE(app_user.staff_role, 'other')]))
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  SELECT app_user.shipper_name, app_user.created_by, app_user.approval_status
  INTO target_record
  FROM public.app_users AS app_user
  WHERE app_user.id = target_user_id
    AND app_user.role = 'normal'
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
  FOR UPDATE;

  IF caller_id IS NULL OR target_record.approval_status <> 'approved' OR NOT EXISTS (
    SELECT 1
    FROM public.app_user_admin_assignments AS assignment
    WHERE assignment.normal_user_id = target_user_id
      AND assignment.admin_user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Only an assigned Sales operator can request changes to an approved shipper'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(trim(proposed_shipper_name), '') IS NULL
    OR NULLIF(trim(proposed_zipcode), '') IS NULL
    OR NULLIF(trim(proposed_shipper_address), '') IS NULL
    OR NULLIF(trim(proposed_telephone), '') IS NULL
    OR proposed_budget IS NULL
    OR proposed_budget < 0 THEN
    RAISE EXCEPTION 'Required shipper fields are missing' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', NULLIF(contact->>'id', '')::uuid,
      'email', lower(trim(contact->>'email')),
      'contact_person', trim(contact->>'contact_person')
    ) ORDER BY ordinal
  )
  INTO normalized_contacts
  FROM jsonb_array_elements(COALESCE(proposed_contacts, '[]'::jsonb))
    WITH ORDINALITY AS item(contact, ordinal)
  WHERE NULLIF(trim(contact->>'email'), '') IS NOT NULL
    AND NULLIF(trim(contact->>'contact_person'), '') IS NOT NULL;

  IF jsonb_array_length(COALESCE(normalized_contacts, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one customer contact is required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT selected_id ORDER BY selected_id), ARRAY[]::uuid[])
  INTO normalized_admin_ids
  FROM unnest(COALESCE(proposed_admin_user_ids, ARRAY[]::uuid[])) AS selected(selected_id);

  IF EXISTS (
    SELECT 1
    FROM unnest(normalized_admin_ids) AS selected(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = selected.id
      AND operator.role = 'admin'
      AND operator.is_active
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable' USING ERRCODE = '22023';
  END IF;

  current_data := public.shipper_group_snapshot(target_user_id);
  proposed_data := jsonb_build_object(
    'shipper_name', trim(proposed_shipper_name),
    'zipcode', trim(proposed_zipcode),
    'shipper_address', trim(proposed_shipper_address),
    'telephone', trim(proposed_telephone),
    'budget', proposed_budget,
    'notes', trim(COALESCE(proposed_notes, '')),
    'contacts', normalized_contacts,
    'admin_user_ids', to_jsonb(normalized_admin_ids)
  );

  IF current_data = proposed_data THEN
    RAISE EXCEPTION 'No shipper changes were provided' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.shipper_change_requests (
    target_user_id, shipper_name, shipper_created_by, requested_by,
    requested_by_email, current_snapshot, proposed_snapshot
  ) VALUES (
    target_user_id, target_record.shipper_name, target_record.created_by,
    caller_id, caller_email, current_data, proposed_data
  )
  RETURNING id INTO request_id;

  PERFORM public.queue_shipper_registration_approval_emails(
    target_record.shipper_name,
    caller_email
  );

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_shipper_change_request(
  uuid, text, text, text, text, numeric, jsonb, text, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_shipper_change_request(
  uuid, text, text, text, text, numeric, jsonb, text, uuid[]
) TO authenticated, service_role;

CREATE FUNCTION public.review_shipper_change_request(
  request_id uuid,
  next_status text
)
RETURNS TABLE(
  id uuid, email text, shipper_name text, zipcode text, shipper_address text,
  telephone text, budget numeric, contact_person text, notes text,
  approval_status text, created_by text, created_at timestamptz,
  updated_at timestamptz, auth0_provisioning_status text,
  admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reviewer_id uuid;
  reviewer_email text := public.current_app_user_email();
  pending_request public.shipper_change_requests%ROWTYPE;
  updated_user_ids uuid[];
  proposed_admin_ids uuid[];
BEGIN
  SELECT app_user.id
  INTO reviewer_id
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = reviewer_email
    AND app_user.role = 'super_admin'
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  IF reviewer_id IS NULL OR next_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Only the authenticated super admin can review shipper changes'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO pending_request
  FROM public.shipper_change_requests AS request
  WHERE request.id = request_id
    AND request.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending shipper change request was not found' USING ERRCODE = 'P0002';
  END IF;

  IF next_status = 'approved' THEN
    IF public.shipper_group_snapshot(pending_request.target_user_id)
      IS DISTINCT FROM pending_request.current_snapshot THEN
      RAISE EXCEPTION 'Shipper data changed after this request was submitted; reject it and submit a new request'
        USING ERRCODE = '40001';
    END IF;

    SELECT array_agg(updated_user.id)
    INTO updated_user_ids
    FROM public.update_registered_shipper_contacts_unchecked_20260822(
      pending_request.target_user_id,
      pending_request.proposed_snapshot->>'shipper_name',
      pending_request.proposed_snapshot->>'zipcode',
      pending_request.proposed_snapshot->>'shipper_address',
      pending_request.proposed_snapshot->>'telephone',
      (pending_request.proposed_snapshot->>'budget')::numeric,
      pending_request.proposed_snapshot->'contacts',
      pending_request.proposed_snapshot->>'notes'
    ) AS updated_user;

    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO proposed_admin_ids
    FROM jsonb_array_elements_text(
      COALESCE(pending_request.proposed_snapshot->'admin_user_ids', '[]'::jsonb)
    ) AS item(value);

    DELETE FROM public.app_user_admin_assignments AS assignment
    WHERE assignment.normal_user_id = ANY(COALESCE(updated_user_ids, ARRAY[]::uuid[]));

    INSERT INTO public.app_user_admin_assignments (
      normal_user_id, admin_user_id, assigned_by
    )
    SELECT shipper_user_id, admin_user_id, reviewer_email
    FROM unnest(COALESCE(updated_user_ids, ARRAY[]::uuid[])) AS shipper(shipper_user_id)
    CROSS JOIN unnest(proposed_admin_ids) AS admin(admin_user_id)
    ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
    SET assigned_by = EXCLUDED.assigned_by, updated_at = now();

    UPDATE public.app_users
    SET approval_status = 'approved', updated_at = now()
    WHERE id = ANY(COALESCE(updated_user_ids, ARRAY[]::uuid[]));
  END IF;

  UPDATE public.shipper_change_requests AS change_request
  SET
    status = next_status,
    reviewed_by = reviewer_id,
    reviewed_by_email = reviewer_email,
    reviewed_at = now(),
    updated_at = now()
  WHERE change_request.id = request_id;

  RETURN QUERY
  SELECT
    app_user.id, app_user.email, app_user.shipper_name, app_user.zipcode,
    app_user.shipper_address, app_user.telephone, app_user.budget,
    app_user.contact_person, app_user.notes, app_user.approval_status,
    app_user.created_by, app_user.created_at, app_user.updated_at,
    app_user.auth0_provisioning_status,
    public.get_normal_user_admin_assignments(app_user.id)
  FROM public.app_users AS app_user
  WHERE app_user.role = 'normal'
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
    AND app_user.shipper_name = COALESCE(
      pending_request.proposed_snapshot->>'shipper_name',
      pending_request.shipper_name
    )
    AND COALESCE(app_user.created_by, '') = COALESCE(pending_request.shipper_created_by, '')
  ORDER BY app_user.created_at, app_user.id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_shipper_change_request(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_shipper_change_request(uuid, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
