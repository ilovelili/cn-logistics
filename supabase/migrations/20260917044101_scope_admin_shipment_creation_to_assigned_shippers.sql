/*
  Regular admins may create shipments only for approved shippers to which they
  are assigned. Super admins retain access to every approved shipper.
*/

SET lock_timeout = '5s';

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
DECLARE
  requester_record record;
BEGIN
  SELECT requester.id, requester.email, requester.role
  INTO requester_record
  FROM public.app_users AS requester
  WHERE lower(trim(requester.email)) = lower(trim(requester_email))
    AND requester.role IN ('admin', 'super_admin')
    AND requester.is_active = true
    AND requester.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(requester.email)
  LIMIT 1;

  IF requester_record.id IS NULL THEN
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
    AND (
      requester_record.role = 'super_admin'
      OR EXISTS (
        SELECT 1
        FROM public.app_user_admin_assignments AS assignment
        WHERE assignment.normal_user_id = shipper_user.id
          AND assignment.admin_user_id = requester_record.id
      )
    )
  ORDER BY shipper_user.shipper_name, shipper_user.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_approved_shippers_for_shipments(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_approved_shippers_for_shipments(text)
  TO authenticated, service_role;

CREATE FUNCTION public.enforce_shipment_creator_shipper_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  creator_role text;
BEGIN
  SELECT creator.role
  INTO creator_role
  FROM public.app_users AS creator
  WHERE creator.id = NEW.created_by_admin_user_id
    AND creator.is_active = true
    AND creator.deleted_at IS NULL;

  IF creator_role = 'admin' AND NOT EXISTS (
    SELECT 1
    FROM public.app_users AS shipper_user
    JOIN public.app_user_admin_assignments AS assignment
      ON assignment.normal_user_id = shipper_user.id
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active = true
      AND shipper_user.deleted_at IS NULL
      AND shipper_user.approval_status = 'approved'
      AND lower(trim(shipper_user.shipper_name)) = lower(trim(NEW.shipper_name))
      AND assignment.admin_user_id = NEW.created_by_admin_user_id
  ) THEN
    RAISE EXCEPTION 'The shipment creator is not assigned to this shipper'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_shipment_creator_shipper_assignment
BEFORE INSERT ON public.shipment_jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_shipment_creator_shipper_assignment();

REVOKE ALL ON FUNCTION public.enforce_shipment_creator_shipper_assignment()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
