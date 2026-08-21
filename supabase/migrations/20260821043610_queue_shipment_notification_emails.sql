/*
  # Queue shipment notification emails

  In-app notifications and email deliveries share the same shipment status
  trigger. Email is dispatched asynchronously after commit through pg_net, so
  SMTP latency or temporary delivery failures never block shipment updates.
*/

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE public.shipment_notification_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE
    REFERENCES public.shipment_notifications(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  previous_status text NOT NULL,
  current_status text NOT NULL,
  awb_bl_number text,
  origin text,
  destination text,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id text,
  last_error text,
  dispatched_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shipment_notification_email_pending_idx
  ON public.shipment_notification_email_deliveries (created_at)
  WHERE delivery_status IN ('pending', 'sending', 'failed');

ALTER TABLE public.shipment_notification_email_deliveries
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shipment_notification_email_deliveries
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_shipment_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.shipment_notification_email_deliveries (
    notification_id,
    recipient_email,
    previous_status,
    current_status,
    awb_bl_number,
    origin,
    destination
  )
  SELECT
    NEW.id,
    app_user.email,
    NEW.previous_status,
    NEW.current_status,
    NEW.awb_bl_number,
    NEW.origin,
    NEW.destination
  FROM public.app_users AS app_user
  WHERE app_user.id = NEW.recipient_user_id
    AND app_user.role = 'normal'
    AND app_user.approval_status = 'approved'
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_shipment_notification_email()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER queue_shipment_notification_email_after_insert
  AFTER INSERT ON public.shipment_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_shipment_notification_email();

CREATE OR REPLACE FUNCTION public.dispatch_shipment_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_url text;
  webhook_secret text;
BEGIN
  SELECT decrypted_secret
  INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'cn_navigator_project_url'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT decrypted_secret
  INTO webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cn_navigator_email_webhook_secret'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NULLIF(trim(project_url), '') IS NULL
    OR NULLIF(trim(webhook_secret), '') IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := rtrim(project_url, '/') ||
      '/functions/v1/send-shipment-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cn-navigator-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('delivery_id', NEW.id),
    timeout_milliseconds := 5000
  );

  UPDATE public.shipment_notification_email_deliveries
  SET
    dispatched_at = now(),
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.shipment_notification_email_deliveries
    SET
      last_error = left(SQLERRM, 1000),
      updated_at = now()
    WHERE id = NEW.id;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_shipment_notification_email()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER dispatch_shipment_notification_email_after_insert
  AFTER INSERT ON public.shipment_notification_email_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_shipment_notification_email();

CREATE OR REPLACE FUNCTION public.retry_shipment_notification_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_url text;
  webhook_secret text;
  delivery_record record;
  dispatched_count integer := 0;
BEGIN
  SELECT decrypted_secret
  INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'cn_navigator_project_url'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT decrypted_secret
  INTO webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cn_navigator_email_webhook_secret'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NULLIF(trim(project_url), '') IS NULL
    OR NULLIF(trim(webhook_secret), '') IS NULL THEN
    RETURN 0;
  END IF;

  FOR delivery_record IN
    SELECT delivery.id
    FROM public.shipment_notification_email_deliveries AS delivery
    WHERE delivery.attempts < 5
      AND (
        delivery.delivery_status IN ('pending', 'failed')
        OR (
          delivery.delivery_status = 'sending'
          AND delivery.updated_at < now() - interval '15 minutes'
        )
      )
      AND delivery.updated_at < now() - interval '5 minutes'
    ORDER BY delivery.created_at
    LIMIT 50
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := rtrim(project_url, '/') ||
          '/functions/v1/send-shipment-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cn-navigator-webhook-secret', webhook_secret
        ),
        body := jsonb_build_object('delivery_id', delivery_record.id),
        timeout_milliseconds := 5000
      );

      UPDATE public.shipment_notification_email_deliveries
      SET
        dispatched_at = now(),
        updated_at = now()
      WHERE id = delivery_record.id;

      dispatched_count := dispatched_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.shipment_notification_email_deliveries
        SET
          last_error = left(SQLERRM, 1000),
          updated_at = now()
        WHERE id = delivery_record.id;
    END;
  END LOOP;

  RETURN dispatched_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_shipment_notification_emails()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_shipment_notification_emails()
  TO service_role;

SELECT cron.schedule(
  'retry-shipment-notification-emails',
  '*/5 * * * *',
  'SELECT public.retry_shipment_notification_emails()'
);

CREATE OR REPLACE FUNCTION public.claim_shipment_notification_email(
  target_delivery_id uuid
)
RETURNS TABLE (
  id uuid,
  recipient_email text,
  previous_status text,
  current_status text,
  awb_bl_number text,
  origin text,
  destination text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipment_notification_email_deliveries AS delivery
  SET
    delivery_status = 'sending',
    attempts = delivery.attempts + 1,
    last_error = NULL,
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND (
      delivery.delivery_status IN ('pending', 'failed')
      OR (
        delivery.delivery_status = 'sending'
        AND delivery.updated_at < now() - interval '15 minutes'
      )
    )
    AND delivery.attempts < 5
  RETURNING
    delivery.id,
    delivery.recipient_email,
    delivery.previous_status,
    delivery.current_status,
    delivery.awb_bl_number,
    delivery.origin,
    delivery.destination;
$$;

REVOKE ALL ON FUNCTION public.claim_shipment_notification_email(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shipment_notification_email(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_shipment_notification_email(
  target_delivery_id uuid,
  message_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipment_notification_email_deliveries AS delivery
  SET
    delivery_status = 'sent',
    provider_message_id = NULLIF(message_id, ''),
    last_error = NULL,
    sent_at = now(),
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.complete_shipment_notification_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shipment_notification_email(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fail_shipment_notification_email(
  target_delivery_id uuid,
  failure_message text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipment_notification_email_deliveries AS delivery
  SET
    delivery_status = 'failed',
    last_error = left(COALESCE(failure_message, 'Unknown email error'), 1000),
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.fail_shipment_notification_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_shipment_notification_email(uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
