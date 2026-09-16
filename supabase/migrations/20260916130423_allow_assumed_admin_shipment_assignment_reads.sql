/* Allow a Super admin to load shipment assignment metadata while assuming an
   active admin account in the application UI. */

CREATE OR REPLACE FUNCTION public.list_assignable_admin_operators(
  requester_email text
)
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
  IF NOT public.authenticated_caller_can_assume_email(requester_email)
    OR NOT EXISTS (
      SELECT 1
      FROM public.app_users AS requester
      WHERE lower(trim(requester.email)) = lower(trim(requester_email))
        AND requester.role IN ('admin', 'super_admin')
        AND requester.is_active = true
        AND requester.deleted_at IS NULL
    ) THEN
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

CREATE OR REPLACE FUNCTION public.list_approved_shippers_for_shipments(
  requester_email text
)
RETURNS TABLE(
  shipper_name text,
  email text,
  contact_person text,
  admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
BEGIN
  IF NOT public.authenticated_caller_can_assume_email(requester_email)
    OR NOT EXISTS (
      SELECT 1
      FROM public.app_users AS requester
      WHERE lower(trim(requester.email)) = lower(trim(requester_email))
        AND requester.role IN ('admin', 'super_admin')
        AND requester.is_active = true
        AND requester.deleted_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Only the authenticated operator can list approved shippers'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    shipper_user.shipper_name,
    shipper_user.email,
    shipper_user.contact_person,
    public.get_normal_user_admin_assignments(shipper_user.id)
  FROM public.app_users AS shipper_user
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND shipper_user.approval_status = 'approved'
  ORDER BY shipper_user.shipper_name, shipper_user.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_approved_shippers_for_shipments(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_approved_shippers_for_shipments(text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
