/* One registration notice per company (name + creator) and recipient. */
LOCK TABLE public.app_notifications IN SHARE ROW EXCLUSIVE MODE;

-- Only backfill notices whose source contact is still identifiable.
UPDATE public.app_notifications AS notification
SET metadata = notification.metadata || jsonb_build_object(
  'shipper_group_key', jsonb_build_array(notification.shipper_name, COALESCE(shipper.created_by, ''))
)
FROM public.app_users AS shipper
WHERE notification.event_type = 'shipper_created'
  AND notification.metadata ->> 'shipper_user_id' = shipper.id::text
  AND shipper.role = 'normal'
  AND notification.shipper_name IS NOT NULL;

-- Keep the earliest notice and preserve unread status if any copy is unread.
WITH ranked AS (
  SELECT id,
    first_value(id) OVER (
      PARTITION BY recipient_user_id, metadata -> 'shipper_group_key'
      ORDER BY created_at, id
    ) AS retained_id,
    bool_or(read_at IS NULL) OVER (
      PARTITION BY recipient_user_id, metadata -> 'shipper_group_key'
    ) AS any_unread
  FROM public.app_notifications
  WHERE event_type = 'shipper_created' AND metadata ? 'shipper_group_key'
)
UPDATE public.app_notifications AS notification
SET read_at = NULL
FROM ranked
WHERE notification.id = ranked.retained_id AND ranked.any_unread;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY recipient_user_id, metadata -> 'shipper_group_key'
    ORDER BY created_at, id
  ) AS copy_number
  FROM public.app_notifications
  WHERE event_type = 'shipper_created' AND metadata ? 'shipper_group_key'
)
DELETE FROM public.app_notifications AS notification
USING ranked
WHERE notification.id = ranked.id AND ranked.copy_number > 1;

CREATE UNIQUE INDEX app_notifications_shipper_registration_unique
ON public.app_notifications (recipient_user_id, (metadata -> 'shipper_group_key'))
WHERE event_type = 'shipper_created' AND metadata ? 'shipper_group_key';

-- Internal helper: both triggers use the same conflict-safe insertion path.
CREATE FUNCTION public.emit_shipper_registration_notification(
  target_shipper_user_id uuid,
  target_recipient_id uuid,
  target_actor_email text
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.app_notifications (
    recipient_user_id, event_type, actor_email, shipper_name, subject, metadata
  )
  SELECT recipient.id, 'shipper_created', target_actor_email,
    shipper.shipper_name, shipper.shipper_name,
    jsonb_build_object(
      'shipper_user_id', shipper.id,
      'shipper_group_key', jsonb_build_array(shipper.shipper_name, COALESCE(shipper.created_by, ''))
    )
  FROM public.app_users AS shipper
  JOIN public.app_users AS recipient ON recipient.id = target_recipient_id
  WHERE shipper.id = target_shipper_user_id AND shipper.role = 'normal'
    AND shipper.shipper_name IS NOT NULL
    AND recipient.role IN ('admin', 'super_admin')
    AND recipient.is_active = true AND recipient.deleted_at IS NULL
  ON CONFLICT (recipient_user_id, (metadata -> 'shipper_group_key'))
    WHERE event_type = 'shipper_created' AND metadata ? 'shipper_group_key'
  DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.emit_shipper_registration_notification(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_shipper_created_in_app()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE recipient_id uuid;
BEGIN
  IF NEW.role = 'normal' AND NEW.shipper_name IS NOT NULL THEN
    FOR recipient_id IN
      SELECT recipient.id FROM public.app_users AS recipient
      WHERE recipient.is_active = true AND recipient.deleted_at IS NULL
        AND (recipient.role = 'super_admin' OR (
          recipient.role = 'admin' AND EXISTS (
            SELECT 1 FROM public.app_user_admin_assignments AS assignment
            JOIN public.app_users AS contact ON contact.id = assignment.normal_user_id
            WHERE assignment.admin_user_id = recipient.id AND contact.role = 'normal'
              AND contact.is_active = true AND contact.deleted_at IS NULL
              AND contact.shipper_name = NEW.shipper_name
              AND COALESCE(contact.created_by, '') = COALESCE(NEW.created_by, '')
          )
        ))
    LOOP
      PERFORM public.emit_shipper_registration_notification(
        NEW.id, recipient_id, COALESCE(NEW.created_by, public.current_app_user_email())
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_shipper_created_in_app() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_new_shipper_assignee_in_app()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE shipper_created_at timestamptz;
BEGIN
  SELECT created_at INTO shipper_created_at FROM public.app_users
  WHERE id = NEW.normal_user_id AND role = 'normal';
  IF shipper_created_at >= now() - interval '10 minutes' THEN
    PERFORM public.emit_shipper_registration_notification(
      NEW.normal_user_id, NEW.admin_user_id, NEW.assigned_by
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_new_shipper_assignee_in_app() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
