/*
  Approved shipper data must not remain approved after it is changed.
  Profile/contact and Ops/Sales assignment changes return the whole shipper
  group to pending approval so a super admin must approve it again.
*/

CREATE OR REPLACE FUNCTION public.update_registered_shipper_contacts(
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
DECLARE
  updated_user_ids uuid[];
BEGIN
  IF NOT public.authenticated_caller_can_manage_normal_user(target_user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot update these shipper contacts'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(updated_user.id)
  INTO updated_user_ids
  FROM public.update_registered_shipper_contacts_unchecked_20260822(
    target_user_id, user_shipper_name, user_zipcode, user_shipper_address,
    user_telephone, user_budget, user_contacts, user_notes
  ) AS updated_user;

  UPDATE public.app_users AS app_user
  SET
    approval_status = 'to_be_approved',
    updated_at = now()
  WHERE app_user.id = ANY(COALESCE(updated_user_ids, ARRAY[]::uuid[]))
    AND app_user.approval_status = 'approved';

  RETURN QUERY
  SELECT
    app_user.id,
    app_user.email,
    app_user.shipper_name,
    app_user.zipcode,
    app_user.shipper_address,
    app_user.telephone,
    app_user.budget,
    app_user.contact_person,
    app_user.notes,
    app_user.approval_status,
    app_user.created_by,
    app_user.created_at,
    app_user.updated_at,
    public.get_normal_user_admin_assignments(app_user.id)
  FROM public.app_users AS app_user
  WHERE app_user.id = ANY(COALESCE(updated_user_ids, ARRAY[]::uuid[]))
  ORDER BY app_user.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.update_registered_shipper_contacts(
  uuid, text, text, text, text, numeric, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_registered_shipper_contacts(
  uuid, text, text, text, text, numeric, jsonb, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_accessible_normal_user_admin_assignments(
  requester_email text,
  target_user_id uuid,
  admin_user_ids uuid[]
)
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_requester_email text := lower(trim(requester_email));
  normalized_admin_user_ids uuid[] := COALESCE(admin_user_ids, ARRAY[]::uuid[]);
  target_shipper_name text;
  target_created_by text;
  shipper_user_ids uuid[];
BEGIN
  IF public.current_app_user_role() NOT IN ('admin', 'super_admin')
    OR normalized_requester_email <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated operator can update assignments'
      USING ERRCODE = '42501';
  END IF;

  SELECT target.shipper_name, target.created_by
  INTO target_shipper_name, target_created_by
  FROM public.app_users AS target
  WHERE target.id = target_user_id
    AND target.role = 'normal'
    AND target.is_active = true
    AND target.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND
    OR NOT public.authenticated_caller_can_manage_normal_user(target_user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot manage this shipper user'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(normalized_admin_user_ids) AS requested_admin(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = requested_admin.id
      AND operator.role = 'admin'
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable'
      USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(shipper_user.id)
  INTO shipper_user_ids
  FROM public.app_users AS shipper_user
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND shipper_user.shipper_name = target_shipper_name
    AND COALESCE(shipper_user.created_by, '') = COALESCE(target_created_by, '');

  DELETE FROM public.app_user_admin_assignments AS assignment
  WHERE assignment.normal_user_id = ANY(shipper_user_ids);

  INSERT INTO public.app_user_admin_assignments (
    normal_user_id,
    admin_user_id,
    assigned_by
  )
  SELECT
    shipper_user.id,
    operator.id,
    normalized_requester_email
  FROM public.app_users AS shipper_user
  CROSS JOIN public.app_users AS operator
  WHERE shipper_user.id = ANY(shipper_user_ids)
    AND operator.id = ANY(normalized_admin_user_ids)
    AND operator.role = 'admin'
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
  ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
  SET
    assigned_by = EXCLUDED.assigned_by,
    updated_at = now();

  UPDATE public.app_users AS shipper_user
  SET
    approval_status = CASE
      WHEN shipper_user.approval_status = 'approved' THEN 'to_be_approved'
      ELSE shipper_user.approval_status
    END,
    updated_at = now()
  WHERE shipper_user.id = ANY(shipper_user_ids);

  RETURN QUERY
  SELECT
    target.id,
    target.email,
    target.shipper_name,
    target.zipcode,
    target.shipper_address,
    target.telephone,
    target.budget,
    target.contact_person,
    target.notes,
    target.approval_status,
    target.created_by,
    target.created_at,
    target.updated_at,
    target.auth0_provisioning_status,
    public.get_normal_user_admin_assignments(target.id)
  FROM public.app_users AS target
  WHERE target.id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_accessible_normal_user_admin_assignments(
  text, uuid, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accessible_normal_user_admin_assignments(
  text, uuid, uuid[]
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
