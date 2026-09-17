CREATE FUNCTION public.list_shipper_users_for_assignment_change(
  requester_email text,
  target_shipper_name text
)
RETURNS TABLE(
  id uuid, email text, shipper_name text, zipcode text, shipper_address text,
  telephone text, budget numeric, contact_person text, notes text,
  approval_status text, created_by text, created_at timestamptz,
  updated_at timestamptz, auth0_provisioning_status text,
  admin_assignments jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE requester_record record;
BEGIN
  SELECT u.id,u.email,u.role INTO requester_record FROM public.app_users u
  WHERE lower(trim(u.email))=lower(trim(requester_email))
    AND u.role IN ('admin','super_admin') AND u.is_active=true
    AND u.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(u.email) LIMIT 1;
  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipper'
      USING ERRCODE='42501';
  END IF;
  IF requester_record.role <> 'super_admin' AND NOT EXISTS (
    SELECT 1 FROM public.app_users shipper_user
    JOIN public.app_user_admin_assignments assignment
      ON assignment.normal_user_id=shipper_user.id
    WHERE assignment.admin_user_id=requester_record.id
      AND shipper_user.role='normal' AND shipper_user.is_active=true
      AND shipper_user.deleted_at IS NULL
      AND lower(trim(shipper_user.shipper_name))=lower(trim(target_shipper_name))
  ) THEN
    RAISE EXCEPTION 'The authenticated operator is not assigned to this shipper'
      USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT u.id,u.email,u.shipper_name,u.zipcode,u.shipper_address,
    u.telephone,u.budget,u.contact_person,u.notes,u.approval_status,u.created_by,
    u.created_at,u.updated_at,u.auth0_provisioning_status,
    public.get_normal_user_admin_assignments(u.id)
  FROM public.app_users u WHERE u.role='normal' AND u.is_active=true
    AND u.deleted_at IS NULL
    AND lower(trim(u.shipper_name))=lower(trim(target_shipper_name))
  ORDER BY u.created_at;
END; $$;
REVOKE ALL ON FUNCTION public.list_shipper_users_for_assignment_change(text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_shipper_users_for_assignment_change(text,text)
  TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
