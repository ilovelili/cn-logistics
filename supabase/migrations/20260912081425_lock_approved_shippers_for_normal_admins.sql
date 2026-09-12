CREATE OR REPLACE FUNCTION public.prevent_regular_admin_approved_shipper_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NULLIF(auth.jwt() ->> 'email', '') IS NOT NULL
    AND public.current_app_user_role() = 'admin'
    AND OLD.role = 'normal'
    AND OLD.approval_status = 'approved'
    AND ROW(
      NEW.email,
      NEW.shipper_name,
      NEW.zipcode,
      NEW.shipper_address,
      NEW.telephone,
      NEW.budget,
      NEW.contact_person,
      NEW.notes,
      NEW.approval_status
    ) IS DISTINCT FROM ROW(
      OLD.email,
      OLD.shipper_name,
      OLD.zipcode,
      OLD.shipper_address,
      OLD.telephone,
      OLD.budget,
      OLD.contact_person,
      OLD.notes,
      OLD.approval_status
    )
  THEN
    RAISE EXCEPTION 'Approved shipper records are read-only for regular admins'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_regular_admin_approved_shipper_update()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_approved_shipper_profile_lock
  ON public.app_users;

CREATE TRIGGER enforce_approved_shipper_profile_lock
BEFORE UPDATE ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_regular_admin_approved_shipper_update();

CREATE OR REPLACE FUNCTION public.prevent_regular_admin_approved_shipper_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target_normal_user_id uuid;
  target_is_approved boolean;
BEGIN
  target_normal_user_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.normal_user_id
    ELSE NEW.normal_user_id
  END;

  IF NULLIF(auth.jwt() ->> 'email', '') IS NOT NULL
    AND public.current_app_user_role() = 'admin'
  THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.app_users AS target_user
      WHERE target_user.id = target_normal_user_id
        AND target_user.role = 'normal'
        AND target_user.approval_status = 'approved'
        AND target_user.is_active
    )
    INTO target_is_approved;

    IF target_is_approved THEN
      RAISE EXCEPTION 'Approved shipper assignments are read-only for regular admins'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_regular_admin_approved_shipper_assignment_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_approved_shipper_assignment_lock
  ON public.app_user_admin_assignments;

CREATE TRIGGER enforce_approved_shipper_assignment_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.app_user_admin_assignments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_regular_admin_approved_shipper_assignment_change();
