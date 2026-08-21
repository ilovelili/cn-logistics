/*
  # Manage permanently failed shipment notification emails

  Verified, active super administrators can inspect deliveries that exhausted
  automatic retries and explicitly start a fresh retry cycle. The queue table
  remains private and is exposed only through role-checked RPCs.
*/

CREATE OR REPLACE FUNCTION public.list_failed_shipment_emails_for_super_admin()
RETURNS TABLE (
  id uuid,
  recipient_email text,
  previous_status text,
  current_status text,
  awb_bl_number text,
  origin text,
  destination text,
  attempts integer,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
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
BEGIN
  IF authenticated_email = '' OR NOT authenticated_email_verified OR NOT EXISTS (
    SELECT 1
    FROM public.app_users AS app_user
    WHERE lower(trim(app_user.email)) = authenticated_email
      AND app_user.role = 'super_admin'
      AND app_user.is_active = true
      AND app_user.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Super administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    delivery.id,
    delivery.recipient_email,
    delivery.previous_status,
    delivery.current_status,
    delivery.awb_bl_number,
    delivery.origin,
    delivery.destination,
    delivery.attempts,
    delivery.last_error,
    delivery.created_at,
    delivery.updated_at
  FROM public.shipment_notification_email_deliveries AS delivery
  WHERE delivery.delivery_status = 'failed'
    AND delivery.attempts >= 5
  ORDER BY delivery.updated_at DESC, delivery.id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_failed_shipment_emails_for_super_admin()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_failed_shipment_emails_for_super_admin()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.retry_failed_shipment_email_for_super_admin(
  target_delivery_id uuid
)
RETURNS uuid
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
  project_url text;
  webhook_secret text;
  retry_delivery_id uuid;
BEGIN
  IF authenticated_email = '' OR NOT authenticated_email_verified OR NOT EXISTS (
    SELECT 1
    FROM public.app_users AS app_user
    WHERE lower(trim(app_user.email)) = authenticated_email
      AND app_user.role = 'super_admin'
      AND app_user.is_active = true
      AND app_user.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Super administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT delivery.id
  INTO retry_delivery_id
  FROM public.shipment_notification_email_deliveries AS delivery
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'failed'
    AND delivery.attempts >= 5
  FOR UPDATE;

  IF retry_delivery_id IS NULL THEN
    RAISE EXCEPTION 'Permanently failed email delivery was not found';
  END IF;

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
    RAISE EXCEPTION 'Email delivery webhook configuration is missing';
  END IF;

  UPDATE public.shipment_notification_email_deliveries AS delivery
  SET
    delivery_status = 'pending',
    attempts = 0,
    provider_message_id = NULL,
    last_error = NULL,
    dispatched_at = now(),
    sent_at = NULL,
    updated_at = now()
  WHERE delivery.id = retry_delivery_id;

  PERFORM net.http_post(
    url := rtrim(project_url, '/') ||
      '/functions/v1/send-shipment-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cn-navigator-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object('delivery_id', retry_delivery_id),
    timeout_milliseconds := 5000
  );

  RETURN retry_delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_failed_shipment_email_for_super_admin(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_failed_shipment_email_for_super_admin(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
