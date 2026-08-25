/*
  # Notify approved shipper contacts

  A shipper contact can only log in after super-admin approval. When that
  approval completes, queue one durable login-notification email. Delivery is
  asynchronous and uses the existing SES Edge Function and Vault secrets.
*/

INSERT INTO public.email_templates (
  template_key,
  display_name,
  subject_template,
  text_template,
  html_template
)
VALUES (
  'shipper_registration_approved',
  '荷主登録完了・ログイン案内',
  '【CN Navigator自動送信】荷主登録完了とログインのご案内',
  $template${{contact_person}} 様

CN Navigatorへの荷主登録が完了しました。

荷主名：{{shipper_name}}
ログインメールアドレス：{{recipient_email}}

以下のリンクからCN Navigatorにログインしてください。
{{application_url}}

初回ログイン時は、登録メールアドレスに届く認証メールの案内に従って認証を完了してください。

本メールは自動送信のため、ご返信いただいても対応いたしかねます。
ご不明な点がございましたら、担当窓口までお問い合わせください。

Dear {{contact_person}},

Your shipper registration for CN Navigator has been approved and is ready to use.

Shipper: {{shipper_name}}
Login email: {{recipient_email}}

Please log in to CN Navigator using the link below:
{{application_url}}

On your first login, follow the instructions in the authentication email sent to your registered address.

This is an automated email and replies to this address cannot be answered.
If you have any questions, please contact your CN Logistics representative.$template$,
  $template$<!doctype html>
<html lang="ja">
  <body style="margin:0;background:#f4f7fa;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif;line-height:1.7">
    <div style="max-width:680px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #dce3eb;border-radius:16px;overflow:hidden">
        <div style="background:#0f172a;color:#ffffff;padding:20px 28px;font-size:20px;font-weight:700">CN Navigator</div>
        <div style="padding:28px">
          <p>{{contact_person}} 様</p>
          <p>CN Navigatorへの荷主登録が完了しました。</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin:22px 0">
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">荷主名</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{shipper_name}}</td></tr>
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;width:36%">ログインメール</th><td style="padding:10px 12px">{{recipient_email}}</td></tr>
          </table>
          <p style="margin:24px 0"><a href="{{application_url}}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">CN Navigatorにログイン</a></p>
          <p>初回ログイン時は、登録メールアドレスに届く認証メールの案内に従って認証を完了してください。</p>
          <p style="color:#64748b;font-size:13px">本メールは自動送信のため、ご返信いただいても対応いたしかねます。<br>ご不明な点がございましたら、担当窓口までお問い合わせください。</p>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:28px 0">
          <p>Dear {{contact_person}},</p>
          <p>Your shipper registration for CN Navigator has been approved and is ready to use.</p>
          <p><strong>Shipper:</strong> {{shipper_name}}<br><strong>Login email:</strong> {{recipient_email}}</p>
          <p style="margin:24px 0"><a href="{{application_url}}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">Log in to CN Navigator</a></p>
          <p>On your first login, follow the instructions in the authentication email sent to your registered address.</p>
          <p style="color:#64748b;font-size:13px">This is an automated email and replies to this address cannot be answered.<br>If you have any questions, please contact your CN Logistics representative.</p>
        </div>
      </div>
    </div>
  </body>
</html>$template$
)
ON CONFLICT (template_key) DO NOTHING;

CREATE TABLE public.shipper_registration_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  shipper_name text NOT NULL,
  contact_person text,
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

CREATE INDEX shipper_registration_email_pending_idx
  ON public.shipper_registration_email_deliveries (created_at)
  WHERE delivery_status IN ('pending', 'sending', 'failed');

CREATE INDEX shipper_registration_email_recipient_user_idx
  ON public.shipper_registration_email_deliveries (recipient_user_id);

ALTER TABLE public.shipper_registration_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shipper_registration_email_deliveries
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_approved_shipper_registration_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'normal'
    AND NEW.approval_status = 'approved'
    AND OLD.approval_status IS DISTINCT FROM NEW.approval_status
    AND NEW.is_active = true
    AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.shipper_registration_email_deliveries (
      recipient_user_id,
      recipient_email,
      shipper_name,
      contact_person
    )
    VALUES (
      NEW.id,
      lower(trim(NEW.email)),
      NEW.shipper_name,
      NEW.contact_person
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_approved_shipper_registration_email()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER queue_approved_shipper_registration_email_after_update
  AFTER UPDATE OF approval_status ON public.app_users
  FOR EACH ROW
  WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
  EXECUTE FUNCTION public.queue_approved_shipper_registration_email();

CREATE OR REPLACE FUNCTION public.dispatch_shipper_registration_email()
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
    url := rtrim(project_url, '/') ||
      '/functions/v1/send-shipment-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cn-navigator-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'delivery_type', 'shipper_registration',
      'delivery_id', NEW.id
    ),
    timeout_milliseconds := 5000
  );

  UPDATE public.shipper_registration_email_deliveries
  SET dispatched_at = now(), updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.shipper_registration_email_deliveries
    SET last_error = left(SQLERRM, 1000), updated_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_shipper_registration_email()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER dispatch_shipper_registration_email_after_insert
  AFTER INSERT ON public.shipper_registration_email_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_shipper_registration_email();

CREATE OR REPLACE FUNCTION public.claim_shipper_registration_email(
  target_delivery_id uuid
)
RETURNS TABLE (
  id uuid,
  recipient_email text,
  shipper_name text,
  contact_person text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipper_registration_email_deliveries AS delivery
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
    delivery.shipper_name,
    delivery.contact_person;
$$;

REVOKE ALL ON FUNCTION public.claim_shipper_registration_email(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shipper_registration_email(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_shipper_registration_email(
  target_delivery_id uuid,
  message_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipper_registration_email_deliveries AS delivery
  SET
    delivery_status = 'sent',
    provider_message_id = NULLIF(message_id, ''),
    sent_at = now(),
    last_error = NULL,
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.complete_shipper_registration_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_shipper_registration_email(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fail_shipper_registration_email(
  target_delivery_id uuid,
  failure_message text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.shipper_registration_email_deliveries AS delivery
  SET
    delivery_status = 'failed',
    last_error = left(failure_message, 1000),
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.fail_shipper_registration_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_shipper_registration_email(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.retry_shipper_registration_emails()
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
    FROM public.shipper_registration_email_deliveries AS delivery
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
        body := jsonb_build_object(
          'delivery_type', 'shipper_registration',
          'delivery_id', delivery_record.id
        ),
        timeout_milliseconds := 5000
      );

      UPDATE public.shipper_registration_email_deliveries
      SET dispatched_at = now(), updated_at = now()
      WHERE id = delivery_record.id;
      dispatched_count := dispatched_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.shipper_registration_email_deliveries
        SET last_error = left(SQLERRM, 1000), updated_at = now()
        WHERE id = delivery_record.id;
    END;
  END LOOP;

  RETURN dispatched_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_shipper_registration_emails()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_shipper_registration_emails()
  TO service_role;

SELECT cron.schedule(
  'retry-shipper-registration-emails',
  '*/5 * * * *',
  'SELECT public.retry_shipper_registration_emails()'
);

NOTIFY pgrst, 'reload schema';
