/*
  Keep legacy update entry points aligned with the reapproval rule so callers
  cannot preserve an approved status by using an older RPC directly.
*/

CREATE OR REPLACE FUNCTION public.update_registered_normal_user(
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
DECLARE
  updated_user_id uuid;
  updated_shipper_name text;
  updated_created_by text;
BEGIN
  IF NOT public.authenticated_caller_can_manage_normal_user(user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot update this shipper user'
      USING ERRCODE = '42501';
  END IF;

  SELECT updated_user.id
  INTO updated_user_id
  FROM public.update_registered_normal_user_unchecked_20260822(
    user_id, user_email, user_shipper_name, user_zipcode,
    user_shipper_address, user_telephone, user_budget,
    user_contact_person, user_notes
  ) AS updated_user;

  SELECT app_user.shipper_name, app_user.created_by
  INTO updated_shipper_name, updated_created_by
  FROM public.app_users AS app_user
  WHERE app_user.id = updated_user_id;

  UPDATE public.app_users AS shipper_user
  SET
    approval_status = CASE
      WHEN shipper_user.approval_status = 'approved' THEN 'to_be_approved'
      ELSE shipper_user.approval_status
    END,
    updated_at = now()
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND shipper_user.shipper_name = updated_shipper_name
    AND COALESCE(shipper_user.created_by, '') = COALESCE(updated_created_by, '');

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
  WHERE app_user.id = updated_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_registered_normal_user(
  uuid, text, text, text, text, text, numeric, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_registered_normal_user(
  uuid, text, text, text, text, text, numeric, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_normal_user_admin_assignments(
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
  SELECT
    updated_user.id,
    updated_user.email,
    updated_user.shipper_name,
    updated_user.zipcode,
    updated_user.shipper_address,
    updated_user.telephone,
    updated_user.budget,
    updated_user.contact_person,
    updated_user.notes,
    updated_user.approval_status,
    updated_user.created_by,
    updated_user.created_at,
    updated_user.updated_at,
    updated_user.admin_assignments
  FROM public.update_accessible_normal_user_admin_assignments(
    super_admin_email, target_user_id, admin_user_ids
  ) AS updated_user;
END;
$$;

REVOKE ALL ON FUNCTION public.update_normal_user_admin_assignments(
  text, uuid, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_normal_user_admin_assignments(
  text, uuid, uuid[]
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
