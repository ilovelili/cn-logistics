/*
  Allow regular admins to view assignable CN contacts and manage assignments
  for shipper users they are already authorized to manage.

  Keep this separate from list_admin_operators, whose broader result is used
  only by the super-admin operator-management screen.
*/

CREATE FUNCTION public.list_assignable_admin_operators(requester_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  staff_role text,
  staff_roles text[],
  auth0_provisioning_status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() NOT IN ('admin', 'super_admin')
    OR lower(trim(requester_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated operator can list assignable admins'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    operator.id,
    operator.email,
    operator.user_name,
    COALESCE(operator.staff_role, 'other'),
    COALESCE(
      operator.staff_roles,
      ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
    ),
    operator.auth0_provisioning_status,
    operator.created_at,
    operator.updated_at
  FROM public.app_users AS operator
  WHERE operator.role = 'admin'
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
  ORDER BY operator.user_name NULLS LAST, operator.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_assignable_admin_operators(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_admin_operators(text)
  TO authenticated, service_role;

CREATE FUNCTION public.update_accessible_normal_user_admin_assignments(
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
BEGIN
  IF public.current_app_user_role() NOT IN ('admin', 'super_admin')
    OR normalized_requester_email <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated operator can update assignments'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
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

  DELETE FROM public.app_user_admin_assignments AS assignment
  WHERE assignment.normal_user_id = target_user_id;

  INSERT INTO public.app_user_admin_assignments (
    normal_user_id,
    admin_user_id,
    assigned_by
  )
  SELECT
    target_user_id,
    operator.id,
    normalized_requester_email
  FROM public.app_users AS operator
  WHERE operator.id = ANY(normalized_admin_user_ids)
    AND operator.role = 'admin'
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
  ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
  SET
    assigned_by = EXCLUDED.assigned_by,
    updated_at = now();

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
