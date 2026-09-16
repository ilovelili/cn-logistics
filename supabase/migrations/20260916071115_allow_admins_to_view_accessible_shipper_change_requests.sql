/* Keep pending-request visibility consistent with regular-admin submission. */

CREATE OR REPLACE FUNCTION public.list_accessible_shipper_change_requests()
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
BEGIN
  SELECT app_user.id, app_user.role
  INTO caller_id, caller_role
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
      OR request.requested_by = caller_id
      OR EXISTS (
        SELECT 1
        FROM public.app_user_admin_assignments AS assignment
        WHERE assignment.normal_user_id = request.target_user_id
          AND assignment.admin_user_id = caller_id
      )
    )
  ORDER BY request.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_accessible_shipper_change_requests()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipper_change_requests()
  TO authenticated, service_role;
