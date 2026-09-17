CREATE TABLE public.app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_email text,
  shipper_name text,
  subject text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_notifications_recipient_created_idx
  ON public.app_notifications(recipient_user_id, created_at DESC);
CREATE INDEX app_notifications_unread_idx
  ON public.app_notifications(recipient_user_id, created_at DESC) WHERE read_at IS NULL;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_notifications FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.emit_app_notification(
  target_event_type text, target_shipper_name text, target_actor_email text,
  target_subject text, target_metadata jsonb DEFAULT '{}'::jsonb,
  include_super_admins boolean DEFAULT false,
  include_shipper_users boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.app_notifications(
    recipient_user_id, event_type, actor_email, shipper_name, subject, metadata
  )
  SELECT DISTINCT recipient.id, target_event_type, target_actor_email,
    target_shipper_name, target_subject, COALESCE(target_metadata, '{}'::jsonb)
  FROM public.app_users recipient
  WHERE recipient.is_active = true AND recipient.deleted_at IS NULL AND (
    (include_super_admins AND recipient.role = 'super_admin')
    OR (recipient.role = 'admin' AND EXISTS (
      SELECT 1 FROM public.app_users shipper_user
      JOIN public.app_user_admin_assignments assignment
        ON assignment.normal_user_id = shipper_user.id
      WHERE assignment.admin_user_id = recipient.id
        AND shipper_user.role = 'normal' AND shipper_user.is_active = true
        AND shipper_user.deleted_at IS NULL
        AND lower(trim(shipper_user.shipper_name)) = lower(trim(target_shipper_name))
    ))
    OR (include_shipper_users AND recipient.role = 'normal'
      AND lower(trim(recipient.shipper_name)) = lower(trim(target_shipper_name)))
  );
END; $$;
REVOKE ALL ON FUNCTION public.emit_app_notification(text,text,text,text,jsonb,boolean,boolean)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.notify_app_event_triggers() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE event_name text; actor text; assignment_changed boolean;
BEGIN
  IF TG_TABLE_NAME = 'shipment_jobs' THEN
    IF TG_OP = 'INSERT' THEN event_name := 'shipment_created';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN event_name := 'shipment_status_updated';
    ELSE RETURN NEW; END IF;
    PERFORM public.emit_app_notification(event_name, NEW.shipper_name,
      public.current_app_user_email(), COALESCE(NEW.invoice_number, NEW.job_number, NEW.id::text),
      jsonb_build_object('job_id', NEW.id, 'previous_status', CASE WHEN TG_OP='UPDATE' THEN OLD.status END,
        'current_status', NEW.status), true, event_name = 'shipment_status_updated');
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'shipper_change_requests' THEN
    assignment_changed := NEW.current_snapshot->'admin_user_ids'
      IS DISTINCT FROM NEW.proposed_snapshot->'admin_user_ids';
    IF TG_OP = 'INSERT' THEN
      event_name := CASE WHEN assignment_changed THEN 'assignment_change_requested' ELSE 'shipper_update_requested' END;
      actor := NEW.requested_by_email;
    ELSIF OLD.status = 'pending' AND NEW.status IN ('approved','rejected') THEN
      event_name := CASE WHEN assignment_changed THEN 'assignment_change_' ELSE 'shipper_update_' END || NEW.status;
      actor := NEW.reviewed_by_email;
    ELSE RETURN NEW; END IF;
    PERFORM public.emit_app_notification(event_name, NEW.shipper_name, actor,
      NEW.shipper_name, jsonb_build_object('request_id', NEW.id, 'status', NEW.status), true, false);
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'shipment_documents' THEN
    IF TG_OP = 'INSERT' AND NEW.scope = 'customer' THEN event_name := 'customer_document_added';
    ELSIF OLD.approval_status IS DISTINCT FROM NEW.approval_status
      AND NEW.approval_status IN ('pending','approved','rejected') THEN
      event_name := 'document_download_' || NEW.approval_status;
    ELSE RETURN NEW; END IF;
    SELECT job.shipper_name INTO actor FROM public.shipment_jobs job WHERE job.id = NEW.shipment_job_id;
    PERFORM public.emit_app_notification(event_name, actor,
      COALESCE(NEW.approved_by, public.current_app_user_email()), NEW.name,
      jsonb_build_object('document_id', NEW.id, 'job_id', NEW.shipment_job_id), false, true);
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_app_event_triggers() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notify_shipment_created_app_event AFTER INSERT ON public.shipment_jobs
FOR EACH ROW EXECUTE FUNCTION public.notify_app_event_triggers();
CREATE TRIGGER notify_shipment_status_app_event AFTER UPDATE OF status ON public.shipment_jobs
FOR EACH ROW EXECUTE FUNCTION public.notify_app_event_triggers();
CREATE TRIGGER notify_shipper_change_requested_app_event AFTER INSERT ON public.shipper_change_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_app_event_triggers();
CREATE TRIGGER notify_shipper_change_reviewed_app_event AFTER UPDATE OF status ON public.shipper_change_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_app_event_triggers();
CREATE TRIGGER notify_document_added_app_event AFTER INSERT ON public.shipment_documents
FOR EACH ROW EXECUTE FUNCTION public.notify_app_event_triggers();
CREATE TRIGGER notify_document_download_app_event AFTER UPDATE OF approval_status ON public.shipment_documents
FOR EACH ROW EXECUTE FUNCTION public.notify_app_event_triggers();

CREATE FUNCTION public.notify_shipper_assignment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_admin uuid; target_shipper text;
BEGIN
  target_admin := COALESCE(NEW.admin_user_id, OLD.admin_user_id);
  SELECT shipper_name INTO target_shipper FROM public.app_users
    WHERE id = COALESCE(NEW.normal_user_id, OLD.normal_user_id);
  INSERT INTO public.app_notifications(recipient_user_id,event_type,actor_email,shipper_name,subject)
  VALUES(target_admin, CASE WHEN TG_OP='INSERT' THEN 'assignment_added' ELSE 'assignment_removed' END,
    public.current_app_user_email(), target_shipper, target_shipper);
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER notify_shipper_assignment_change AFTER INSERT OR DELETE ON public.app_user_admin_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_shipper_assignment_change();
REVOKE ALL ON FUNCTION public.notify_shipper_assignment_change() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.list_app_notifications(profile_email text)
RETURNS TABLE(id uuid,event_type text,actor_email text,shipper_name text,subject text,
 metadata jsonb,read_at timestamptz,created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT n.id,n.event_type,n.actor_email,n.shipper_name,n.subject,n.metadata,n.read_at,n.created_at
  FROM public.app_notifications n JOIN public.app_users recipient ON recipient.id=n.recipient_user_id
  WHERE lower(trim(recipient.email))=lower(trim(profile_email))
    AND recipient.is_active=true AND recipient.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(recipient.email)
  ORDER BY n.created_at DESC LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.list_app_notifications(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_app_notifications(text) TO authenticated, service_role;

CREATE FUNCTION public.mark_app_notification_read(profile_email text,target_notification_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.app_notifications n SET read_at=COALESCE(n.read_at,now())
  FROM public.app_users recipient
  WHERE recipient.id=n.recipient_user_id AND lower(trim(recipient.email))=lower(trim(profile_email))
    AND recipient.is_active=true AND recipient.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(recipient.email)
    AND (target_notification_id IS NULL OR n.id=target_notification_id) AND n.read_at IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed;
END; $$;
REVOKE ALL ON FUNCTION public.mark_app_notification_read(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_app_notification_read(text,uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
