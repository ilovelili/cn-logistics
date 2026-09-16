CREATE OR REPLACE FUNCTION public.review_shipper_change_request(
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

    UPDATE public.app_users AS shipper_user
    SET approval_status = 'approved', updated_at = now()
    WHERE shipper_user.id = ANY(COALESCE(updated_user_ids, ARRAY[]::uuid[]));
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
