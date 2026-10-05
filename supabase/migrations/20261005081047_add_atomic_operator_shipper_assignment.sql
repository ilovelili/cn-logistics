/* Change only one contact/operator pair, preserving concurrent edits to other operators. */
CREATE FUNCTION public.set_operator_shipper_assignment(
  requester_email text,
  target_user_id uuid,
  target_operator_id uuid,
  should_be_assigned boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_requester_email text := lower(trim(requester_email));
BEGIN
  -- This RPC is for the super-admin operator-management screen only.
  IF public.current_app_user_role() IS DISTINCT FROM 'super_admin'
    OR normalized_requester_email IS NULL
    OR normalized_requester_email IS DISTINCT FROM public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated super admin can update operator assignments'
      USING ERRCODE = '42501';
  END IF;

  IF should_be_assigned IS NULL OR target_operator_id IS NULL THEN
    RAISE EXCEPTION 'An operator and assignment state are required'
      USING ERRCODE = '22023';
  END IF;

  -- Use the same parent-row lock as the existing assignment replacement RPC.
  PERFORM 1 FROM public.app_users AS target
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

  IF should_be_assigned THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.app_users AS operator
      WHERE operator.id = target_operator_id
        AND operator.role = 'admin'
        AND operator.is_active = true
        AND operator.deleted_at IS NULL
        AND COALESCE(operator.staff_roles,
          ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
        ) && ARRAY['operations', 'sales']::text[]
    ) THEN
      RAISE EXCEPTION 'The selected admin is not assignable'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.app_user_admin_assignments (
      normal_user_id, admin_user_id, assigned_by
    ) VALUES (target_user_id, target_operator_id, normalized_requester_email)
    ON CONFLICT (normal_user_id, admin_user_id) DO NOTHING;
  ELSE
    DELETE FROM public.app_user_admin_assignments AS assignment
    WHERE assignment.normal_user_id = target_user_id
      AND assignment.admin_user_id = target_operator_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_operator_shipper_assignment(text, uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_operator_shipper_assignment(text, uuid, uuid, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
