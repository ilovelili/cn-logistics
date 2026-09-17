CREATE FUNCTION public.notify_shipper_created_in_app()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.role = 'normal' AND NEW.shipper_name IS NOT NULL THEN
    PERFORM public.emit_app_notification(
      'shipper_created', NEW.shipper_name, COALESCE(NEW.created_by, public.current_app_user_email()),
      NEW.shipper_name, jsonb_build_object('shipper_user_id', NEW.id), true, false
    );
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_shipper_created_in_app() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notify_shipper_created_in_app
AFTER INSERT ON public.app_users FOR EACH ROW
EXECUTE FUNCTION public.notify_shipper_created_in_app();

-- When the initial assignee is linked immediately after registration, give
-- that operator the same creation notification as the Super admins.
CREATE FUNCTION public.notify_new_shipper_assignee_in_app()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE shipper_record record;
BEGIN
  SELECT id, shipper_name, created_at INTO shipper_record
  FROM public.app_users WHERE id = NEW.normal_user_id AND role = 'normal';
  IF shipper_record.created_at >= now() - interval '10 minutes' THEN
    INSERT INTO public.app_notifications(
      recipient_user_id,event_type,actor_email,shipper_name,subject,metadata
    ) VALUES (
      NEW.admin_user_id,'shipper_created',NEW.assigned_by,
      shipper_record.shipper_name,shipper_record.shipper_name,
      jsonb_build_object('shipper_user_id',shipper_record.id)
    );
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_new_shipper_assignee_in_app() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notify_new_shipper_assignee_in_app
AFTER INSERT ON public.app_user_admin_assignments FOR EACH ROW
EXECUTE FUNCTION public.notify_new_shipper_assignee_in_app();
NOTIFY pgrst, 'reload schema';
