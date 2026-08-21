/*
  # Persist shipment status notifications

  Each status change creates one immutable notification for every active,
  approved contact belonging to the shipment's shipper. The RPCs enforce the
  effective user scope for both direct customer sessions and the existing
  administrator "switch to user" workflow.
*/

CREATE TABLE public.shipment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  shipment_job_id uuid NOT NULL REFERENCES public.shipment_jobs(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  current_status text NOT NULL,
  awb_bl_number text,
  origin text,
  destination text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shipment_notifications_recipient_created_idx
  ON public.shipment_notifications (recipient_user_id, created_at DESC);

CREATE INDEX shipment_notifications_recipient_unread_idx
  ON public.shipment_notifications (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.shipment_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shipment_notifications
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_shipment_status_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.shipment_notifications (
    recipient_user_id,
    shipment_job_id,
    previous_status,
    current_status,
    awb_bl_number,
    origin,
    destination
  )
  SELECT
    app_user.id,
    NEW.id,
    OLD.status,
    NEW.status,
    COALESCE(
      NULLIF(trim(NEW.hbl_hawb), ''),
      NULLIF(trim(NEW.mbl_mawb), ''),
      NULLIF(trim(NEW.invoice_number), '')
    ),
    NULLIF(trim(NEW.pol_aol), ''),
    NULLIF(trim(NEW.pod_aod), '')
  FROM public.app_users AS app_user
  WHERE app_user.role = 'normal'
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
    AND app_user.approval_status = 'approved'
    AND NEW.shipper_name IS NOT NULL
    AND lower(trim(app_user.shipper_name)) = lower(trim(NEW.shipper_name));

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shipment_status_notifications()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER create_shipment_status_notifications_after_update
  AFTER UPDATE OF status ON public.shipment_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.create_shipment_status_notifications();

CREATE OR REPLACE FUNCTION public.list_shipment_notifications(
  profile_email text
)
RETURNS TABLE (
  id uuid,
  shipment_job_id uuid,
  previous_status text,
  current_status text,
  awb_bl_number text,
  origin text,
  destination text,
  read_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_email text := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  authenticated_email_verified boolean := COALESCE(
    (auth.jwt() ->> 'email_verified')::boolean,
    false
  );
  requester_record record;
  target_record record;
BEGIN
  IF authenticated_email = '' OR NOT authenticated_email_verified THEN
    RAISE EXCEPTION 'A verified Auth0 email address is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT app_user.id, app_user.email, app_user.role
  INTO requester_record
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = authenticated_email
    AND app_user.role IN ('normal', 'admin', 'super_admin')
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  SELECT app_user.id, app_user.email, app_user.shipper_name
  INTO target_record
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = lower(trim(profile_email))
    AND app_user.role = 'normal'
    AND app_user.approval_status = 'approved'
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL OR target_record.id IS NULL THEN
    RAISE EXCEPTION 'Notification profile is not accessible'
      USING ERRCODE = '42501';
  END IF;

  IF lower(requester_record.email) <> lower(target_record.email)
    AND NOT public.can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_record.shipper_name
    )
  THEN
    RAISE EXCEPTION 'Notification profile is not accessible'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    notification.id,
    notification.shipment_job_id,
    notification.previous_status,
    notification.current_status,
    notification.awb_bl_number,
    notification.origin,
    notification.destination,
    notification.read_at,
    notification.created_at
  FROM public.shipment_notifications AS notification
  WHERE notification.recipient_user_id = target_record.id
  ORDER BY notification.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_shipment_notifications(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_shipment_notifications(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_shipment_notification_read(
  profile_email text,
  notification_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_email text := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  authenticated_email_verified boolean := COALESCE(
    (auth.jwt() ->> 'email_verified')::boolean,
    false
  );
  requester_record record;
  target_record record;
  notification_read_at timestamptz;
BEGIN
  IF authenticated_email = '' OR NOT authenticated_email_verified THEN
    RAISE EXCEPTION 'A verified Auth0 email address is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT app_user.id, app_user.email, app_user.role
  INTO requester_record
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = authenticated_email
    AND app_user.role IN ('normal', 'admin', 'super_admin')
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  SELECT app_user.id, app_user.email, app_user.shipper_name
  INTO target_record
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = lower(trim(profile_email))
    AND app_user.role = 'normal'
    AND app_user.approval_status = 'approved'
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL OR target_record.id IS NULL THEN
    RAISE EXCEPTION 'Notification profile is not accessible'
      USING ERRCODE = '42501';
  END IF;

  IF lower(requester_record.email) <> lower(target_record.email)
    AND NOT public.can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_record.shipper_name
    )
  THEN
    RAISE EXCEPTION 'Notification profile is not accessible'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.shipment_notifications AS notification
  SET read_at = COALESCE(notification.read_at, now())
  WHERE notification.id = notification_id
    AND notification.recipient_user_id = target_record.id
  RETURNING notification.read_at INTO notification_read_at;

  IF notification_read_at IS NULL THEN
    RAISE EXCEPTION 'Notification was not found';
  END IF;

  RETURN notification_read_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_shipment_notification_read(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_shipment_notification_read(text, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
