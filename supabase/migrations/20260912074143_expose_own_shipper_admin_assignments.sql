/*
  Expose the Ops/Sales assignments registered against a shipper to that
  shipper's own users. Admins may also use this while viewing an accessible
  customer account. Only assignment metadata is returned; no shipper profile
  details are exposed by this function.
*/

CREATE FUNCTION public.list_accessible_shipper_admin_assignments(
  requester_email text
)
RETURNS TABLE(
  shipper_name text,
  admin_assignments jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  WITH requested_user AS (
    SELECT app_users.shipper_name
    FROM public.app_users
    WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
      AND app_users.role = 'normal'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
      AND public.authenticated_caller_can_assume_email(app_users.email)
    LIMIT 1
  )
  SELECT
    shipper_user.shipper_name,
    public.get_normal_user_admin_assignments(shipper_user.id)
  FROM public.app_users AS shipper_user
  CROSS JOIN requested_user
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND lower(trim(shipper_user.shipper_name)) =
      lower(trim(requested_user.shipper_name));
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipper_admin_assignments(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipper_admin_assignments(text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
