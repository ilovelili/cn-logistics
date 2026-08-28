/*
  # Notify super admins of pending shipper registrations

  Queue one durable, Japanese-only internal email per active super admin after
  an authenticated operator successfully registers a shipper. Delivery reuses
  the existing SES Edge Function, Vault webhook secrets, and retry pattern.
*/

INSERT INTO public.email_templates (
  template_key,
  display_name,
  subject_template,
  text_template,
  html_template
)
VALUES (
  'shipper_registration_approval_admin',
  '荷主登録・承認依頼（スーパー管理者通知）',
  '【CN Navigator自動送信】荷主登録の承認依頼：{{customer_name}}',
  $template${{super_admin_name}} 様

CN Navigatorで新しい荷主が登録されました。

顧客名：{{customer_name}}
登録者：{{registered_by}}

以下のリンクからCN Navigatorにログインし、「荷主登録」で登録内容をご確認のうえ、承認してください。
{{application_url}}

本メールは自動送信のため、ご返信いただいても対応いたしかねます。$template$,
  $template$<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CN Navigator 荷主登録の承認依頼</title>
  </head>

  <body style="margin:0; padding:0; background-color:#f1f5f9; color:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:16px;">
            <tr>
              <td align="center" style="padding:40px 32px 24px;">
                <img src="https://navigator.cnlogistics.co.jp/cn-logistics-logo.png" alt="CN Navigator" width="96" style="display:block; width:96px; max-width:96px; height:auto; margin:0 auto; border:0;" />
                <h1 style="margin:24px 0 0; color:#0f172a; font-size:24px; line-height:1.5; font-weight:700;">荷主登録の承認依頼</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 40px;">
                <p style="margin:0 0 16px; color:#0f172a; font-size:16px; line-height:1.8; text-align:center;">{{super_admin_name}} 様</p>
                <p style="margin:0 0 24px; color:#475569; font-size:16px; line-height:1.8; text-align:center;">CN Navigatorで新しい荷主が登録されました。</p>

                <div style="width:84%; max-width:440px; margin:0 auto 24px; padding:16px 20px; box-sizing:border-box; background-color:#f8fafc; border-radius:12px; color:#0f172a; font-size:14px; line-height:1.9; text-align:center;">
                  <div><span style="color:#64748b;">顧客名：</span><strong>{{customer_name}}</strong></div>
                  <div><span style="color:#64748b;">登録者：</span><strong>{{registered_by}}</strong></div>
                </div>

                <p style="margin:0 0 24px; color:#475569; font-size:14px; line-height:1.8; text-align:center;">以下のリンクからCN Navigatorにログインし、「荷主登録」で登録内容をご確認のうえ、承認してください。</p>

                <div style="margin:0 0 24px; text-align:center;">
                  <a href="{{application_url}}" style="display:inline-block; padding:14px 28px; background-color:#22a7b8; border-radius:10px; color:#ffffff; font-size:16px; font-weight:700; text-decoration:none;">荷主登録を確認する</a>
                </div>

                <p style="margin:0; color:#64748b; font-size:13px; line-height:1.7; text-align:center; word-break:break-all;">ボタンを利用できない場合は、以下のURLを開いてください。<br /><a href="{{application_url}}" style="color:#0891b2;">{{application_url}}</a></p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px; background-color:#f8fafc; border-radius:0 0 16px 16px;">
                <p style="margin:0; color:#64748b; font-size:13px; line-height:1.7; text-align:center;">本メールは自動送信のため、ご返信いただいても対応いたしかねます。</p>
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0; color:#94a3b8; font-size:12px; text-align:center;">© CN Logistics. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>$template$
)
ON CONFLICT (template_key) DO NOTHING;

CREATE TABLE public.shipper_registration_approval_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  super_admin_name text NOT NULL,
  customer_name text NOT NULL,
  registered_by text NOT NULL,
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

CREATE INDEX shipper_registration_approval_email_pending_idx
  ON public.shipper_registration_approval_email_deliveries (created_at)
  WHERE delivery_status IN ('pending', 'sending', 'failed');

CREATE INDEX shipper_registration_approval_email_recipient_idx
  ON public.shipper_registration_approval_email_deliveries (recipient_user_id);

ALTER TABLE public.shipper_registration_approval_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shipper_registration_approval_email_deliveries
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_shipper_registration_approval_emails(
  customer_name text,
  registered_by_email text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  queued_count integer;
BEGIN
  INSERT INTO public.shipper_registration_approval_email_deliveries (
    recipient_user_id,
    recipient_email,
    super_admin_name,
    customer_name,
    registered_by
  )
  SELECT
    super_admin.id,
    lower(trim(super_admin.email)),
    COALESCE(NULLIF(trim(super_admin.user_name), ''), super_admin.email),
    COALESCE(NULLIF(trim(customer_name), ''), '-'),
    COALESCE(NULLIF(trim(operator.user_name), ''), operator.email)
  FROM public.app_users AS super_admin
  JOIN public.app_users AS operator
    ON lower(operator.email) = lower(trim(registered_by_email))
  WHERE super_admin.role = 'super_admin'
    AND super_admin.is_active = true
    AND super_admin.deleted_at IS NULL
    AND operator.role IN ('admin', 'super_admin')
    AND operator.is_active = true
    AND operator.deleted_at IS NULL;

  GET DIAGNOSTICS queued_count = ROW_COUNT;
  RETURN queued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_shipper_registration_approval_emails(text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_shipper_registration_approval_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_url text;
  webhook_secret text;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'cn_navigator_project_url'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cn_navigator_email_webhook_secret'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NULLIF(trim(project_url), '') IS NULL
    OR NULLIF(trim(webhook_secret), '') IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-shipment-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cn-navigator-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'delivery_type', 'shipper_registration_approval',
      'delivery_id', NEW.id
    ),
    timeout_milliseconds := 5000
  );

  UPDATE public.shipper_registration_approval_email_deliveries
  SET dispatched_at = now(), updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.shipper_registration_approval_email_deliveries
    SET last_error = left(SQLERRM, 1000), updated_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_shipper_registration_approval_email()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER dispatch_shipper_registration_approval_email_after_insert
  AFTER INSERT ON public.shipper_registration_approval_email_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_shipper_registration_approval_email();

CREATE OR REPLACE FUNCTION public.claim_shipper_registration_approval_email(
  target_delivery_id uuid
)
RETURNS TABLE (
  id uuid,
  recipient_email text,
  super_admin_name text,
  customer_name text,
  registered_by text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipper_registration_approval_email_deliveries AS delivery
  SET
    delivery_status = 'sending',
    attempts = delivery.attempts + 1,
    last_error = NULL,
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.attempts < 5
    AND (
      delivery.delivery_status IN ('pending', 'failed')
      OR (
        delivery.delivery_status = 'sending'
        AND delivery.updated_at < now() - interval '15 minutes'
      )
    )
  RETURNING
    delivery.id,
    delivery.recipient_email,
    delivery.super_admin_name,
    delivery.customer_name,
    delivery.registered_by;
$$;

REVOKE ALL ON FUNCTION public.claim_shipper_registration_approval_email(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shipper_registration_approval_email(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_shipper_registration_approval_email(
  target_delivery_id uuid,
  message_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipper_registration_approval_email_deliveries AS delivery
  SET
    delivery_status = 'sent',
    provider_message_id = NULLIF(message_id, ''),
    last_error = NULL,
    sent_at = now(),
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.complete_shipper_registration_approval_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shipper_registration_approval_email(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fail_shipper_registration_approval_email(
  target_delivery_id uuid,
  failure_message text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipper_registration_approval_email_deliveries AS delivery
  SET
    delivery_status = 'failed',
    last_error = left(COALESCE(failure_message, 'Unknown email error'), 1000),
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.fail_shipper_registration_approval_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_shipper_registration_approval_email(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.retry_shipper_registration_approval_emails()
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
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'cn_navigator_project_url'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT decrypted_secret INTO webhook_secret
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
    FROM public.shipper_registration_approval_email_deliveries AS delivery
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
        url := rtrim(project_url, '/') || '/functions/v1/send-shipment-notification-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cn-navigator-webhook-secret', webhook_secret
        ),
        body := jsonb_build_object(
          'delivery_type', 'shipper_registration_approval',
          'delivery_id', delivery_record.id
        ),
        timeout_milliseconds := 5000
      );

      UPDATE public.shipper_registration_approval_email_deliveries
      SET dispatched_at = now(), updated_at = now()
      WHERE id = delivery_record.id;
      dispatched_count := dispatched_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.shipper_registration_approval_email_deliveries
        SET last_error = left(SQLERRM, 1000), updated_at = now()
        WHERE id = delivery_record.id;
    END;
  END LOOP;

  RETURN dispatched_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_shipper_registration_approval_emails()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_shipper_registration_approval_emails()
  TO service_role;

SELECT cron.schedule(
  'retry-shipper-registration-approval-emails',
  '*/5 * * * *',
  'SELECT public.retry_shipper_registration_approval_emails()'
);

CREATE OR REPLACE FUNCTION public.create_registered_normal_user(
  user_shipper_name text,
  user_zipcode text,
  user_shipper_address text,
  user_telephone text,
  user_budget numeric,
  user_contacts jsonb,
  user_notes text,
  admin_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.current_app_user_role() NOT IN ('admin', 'super_admin')
    OR lower(trim(admin_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'The authenticated operator cannot create shipper users'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.create_registered_normal_user_unchecked_20260822(
    user_shipper_name, user_zipcode, user_shipper_address, user_telephone,
    user_budget, user_contacts, user_notes, admin_email
  );

  PERFORM public.queue_shipper_registration_approval_emails(
    user_shipper_name,
    admin_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_registered_normal_user(text, text, text, text, numeric, jsonb, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_registered_normal_user(text, text, text, text, numeric, jsonb, text, text)
  TO authenticated, service_role;
