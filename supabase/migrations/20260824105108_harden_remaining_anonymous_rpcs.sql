/*
  # Harden remaining anonymous SECURITY DEFINER RPCs

  Keep the application-facing list RPC signatures, but bind their requester
  parameters to the verified Auth0 JWT before delegating to the prior
  implementations. The obsolete four-argument feedback RPC is unused and is
  revoked instead of being exposed through another compatibility wrapper.
*/

ALTER FUNCTION public.list_admin_operators(text)
  RENAME TO list_admin_operators_unchecked_20260824;

REVOKE ALL ON FUNCTION public.list_admin_operators_unchecked_20260824(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  staff_role text,
  staff_roles text[],
  auth0_provisioning_status text,
  assigned_shipper_users jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() <> 'super_admin'
    OR lower(trim(super_admin_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated super admin can list admin operators'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.list_admin_operators_unchecked_20260824(super_admin_email);
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_operators(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_operators(text)
  TO authenticated, service_role;

ALTER FUNCTION public.list_registered_normal_users(text)
  RENAME TO list_registered_normal_users_unchecked_20260824;

REVOKE ALL ON FUNCTION public.list_registered_normal_users_unchecked_20260824(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.list_registered_normal_users(admin_email text)
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
BEGIN
  IF public.current_app_user_role() NOT IN ('admin', 'super_admin')
    OR NOT public.authenticated_caller_can_assume_email(admin_email) THEN
    RAISE EXCEPTION 'The authenticated operator cannot list users for this account'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.list_registered_normal_users_unchecked_20260824(admin_email);
END;
$$;

REVOKE ALL ON FUNCTION public.list_registered_normal_users(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_registered_normal_users(text)
  TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure(
    'public.submit_shipment_feedback(uuid,text,integer,text)'
  ) IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.submit_shipment_feedback(uuid, text, integer, text)
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
