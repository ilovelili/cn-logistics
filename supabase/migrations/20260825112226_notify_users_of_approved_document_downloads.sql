/*
  # Notify users when document downloads are approved

  Persist the requester on each document request, queue a durable email after
  an authorized approval, and attach the approved private Storage object in the
  SES Edge Function. Missing requester or file data aborts the approval so the
  user is never told an unavailable document was approved.
*/

ALTER TABLE public.shipment_documents
  ADD COLUMN download_requested_by_user_id uuid
    REFERENCES public.app_users(id) ON DELETE SET NULL,
  ADD COLUMN download_requested_at timestamptz;

CREATE INDEX shipment_documents_download_requester_idx
  ON public.shipment_documents (download_requested_by_user_id)
  WHERE download_requested_by_user_id IS NOT NULL;

WITH latest_request AS (
  SELECT DISTINCT ON (delivery.document_id)
    delivery.document_id,
    requester.id AS requester_id,
    delivery.created_at AS requested_at
  FROM public.document_download_request_email_deliveries AS delivery
  JOIN public.app_users AS requester
    ON lower(trim(requester.email)) = lower(trim(delivery.requester_email))
  WHERE requester.is_active = true
    AND requester.deleted_at IS NULL
  ORDER BY delivery.document_id, delivery.created_at DESC
)
UPDATE public.shipment_documents AS document
SET
  download_requested_by_user_id = latest_request.requester_id,
  download_requested_at = latest_request.requested_at
FROM latest_request
WHERE document.id = latest_request.document_id
  AND document.approval_status = 'pending'
  AND document.download_requested_by_user_id IS NULL;

INSERT INTO public.email_templates (
  template_key,
  display_name,
  subject_template,
  text_template,
  html_template
)
VALUES (
  'document_download_approved_user',
  '書類DL承認・ユーザー通知',
  '【CN Navigator自動送信】書類ダウンロード承認のお知らせ【{{document_name}}】',
  $template${{requester_name}} 様

申請いただいた書類のダウンロードが承認されました。
承認された書類を本メールに添付しています。

顧客名：{{customer_name}}
書類名：{{document_name}}
案件番号：{{job_number}}
インボイス番号：{{invoice_number}}
AWB/BL番号：{{awb_bl_number}}
承認者：{{approved_by}}

最新の案件情報は、以下のリンクからCN Navigatorにログインしてご確認ください。
{{application_url}}

本メールは自動送信のため、ご返信いただいても対応いたしかねます。

Dear {{requester_name}},

Your document download request has been approved.
The approved document is attached to this email.

Customer: {{customer_name}}
Document: {{document_name}}
Job No.: {{job_number}}
Invoice No.: {{invoice_number}}
AWB/BL No.: {{awb_bl_number}}
Approved by: {{approved_by}}

Please log in to CN Navigator using the link below to view the latest shipment details.
{{application_url}}

This is an automated email and replies to this address cannot be answered.$template$,
  $template$<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CN Navigator 書類ダウンロード承認</title>
  </head>

  <body style="margin:0; padding:0; background-color:#f1f5f9; color:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:16px;">
            <tr>
              <td align="center" style="padding:40px 32px 24px;">
                <img src="https://navigator.cnlogistics.co.jp/cn-logistics-logo.png" alt="CN Navigator" width="96" style="display:block; width:96px; max-width:96px; height:auto; margin:0 auto; border:0;" />
                <h1 style="margin:24px 0 0; color:#0f172a; font-size:24px; line-height:1.5; font-weight:700;">書類ダウンロード承認</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 40px;">
                <p style="margin:0 0 16px; color:#0f172a; font-size:16px; line-height:1.8; text-align:center;">{{requester_name}} 様</p>
                <p style="margin:0 0 8px; color:#475569; font-size:16px; line-height:1.8; text-align:center;">申請いただいた書類のダウンロードが承認されました。</p>
                <p style="margin:0 0 24px; color:#0891b2; font-size:14px; line-height:1.8; font-weight:700; text-align:center;">承認された書類を本メールに添付しています。</p>

                <table role="presentation" width="84%" align="center" cellspacing="0" cellpadding="0" border="0" style="width:84%; max-width:440px; margin:0 auto 24px; background-color:#f8fafc; border:0; border-radius:12px;">
                  <tr><td style="padding:10px 16px; color:#64748b; font-size:14px; line-height:1.7;">顧客名</td><td align="right" style="padding:10px 16px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{customer_name}}</td></tr>
                  <tr><td style="padding:10px 16px; color:#64748b; font-size:14px; line-height:1.7;">書類名</td><td align="right" style="padding:10px 16px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{document_name}}</td></tr>
                  <tr><td style="padding:10px 16px; color:#64748b; font-size:14px; line-height:1.7;">案件番号</td><td align="right" style="padding:10px 16px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{job_number}}</td></tr>
                  <tr><td style="padding:10px 16px; color:#64748b; font-size:14px; line-height:1.7;">AWB/BL番号</td><td align="right" style="padding:10px 16px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{awb_bl_number}}</td></tr>
                </table>

                <div style="margin:0 0 24px; text-align:center;">
                  <a href="{{application_url}}" style="display:inline-block; padding:14px 28px; background-color:#22a7b8; border-radius:10px; color:#ffffff; font-size:16px; font-weight:700; text-decoration:none;">CN Navigatorを確認する</a>
                </div>

                <p style="margin:0 0 20px; color:#64748b; font-size:13px; line-height:1.7; text-align:center; word-break:break-all;">ボタンを利用できない場合は、以下のURLを開いてください。<br /><a href="{{application_url}}" style="color:#0891b2;">{{application_url}}</a></p>

                <div style="margin:32px 0; border-top:1px solid #e2e8f0;"></div>

                <h2 style="margin:0 0 16px; color:#0f172a; font-size:20px; line-height:1.5; font-weight:700; text-align:center;">Document download approved</h2>
                <p style="margin:0 0 16px; color:#0f172a; font-size:16px; line-height:1.8; text-align:center;">Dear {{requester_name}},</p>
                <p style="margin:0 0 8px; color:#475569; font-size:15px; line-height:1.8; text-align:center;">Your document download request has been approved.</p>
                <p style="margin:0 0 24px; color:#0891b2; font-size:14px; line-height:1.8; font-weight:700; text-align:center;">The approved document is attached to this email.</p>

                <table role="presentation" width="84%" align="center" cellspacing="0" cellpadding="0" border="0" style="width:84%; max-width:440px; margin:0 auto 24px; background-color:#f8fafc; border:0; border-radius:12px;">
                  <tr><td style="padding:10px 16px; color:#64748b; font-size:14px; line-height:1.7;">Customer</td><td align="right" style="padding:10px 16px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{customer_name}}</td></tr>
                  <tr><td style="padding:10px 16px; color:#64748b; font-size:14px; line-height:1.7;">Document</td><td align="right" style="padding:10px 16px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{document_name}}</td></tr>
                  <tr><td style="padding:10px 16px; color:#64748b; font-size:14px; line-height:1.7;">Job No.</td><td align="right" style="padding:10px 16px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{job_number}}</td></tr>
                  <tr><td style="padding:10px 16px; color:#64748b; font-size:14px; line-height:1.7;">AWB/BL No.</td><td align="right" style="padding:10px 16px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{awb_bl_number}}</td></tr>
                </table>

                <div style="margin:0; text-align:center;">
                  <a href="{{application_url}}" style="display:inline-block; padding:14px 28px; background-color:#22a7b8; border-radius:10px; color:#ffffff; font-size:16px; font-weight:700; text-decoration:none;">View CN Navigator</a>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px; background-color:#f8fafc; border-radius:0 0 16px 16px;">
                <p style="margin:0; color:#64748b; font-size:13px; line-height:1.7; text-align:center;">このメールは送信専用です。</p>
                <p style="margin:16px 0 0; color:#64748b; font-size:13px; line-height:1.7; text-align:center;">This mailbox is not monitored.</p>
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

CREATE TABLE public.document_download_approved_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.shipment_documents(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  requester_name text NOT NULL,
  customer_name text NOT NULL,
  document_name text NOT NULL,
  storage_path text NOT NULL,
  job_number text,
  invoice_number text,
  awb_bl_number text,
  approved_by text NOT NULL,
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

CREATE INDEX document_download_approved_email_pending_idx
  ON public.document_download_approved_email_deliveries (created_at)
  WHERE delivery_status IN ('pending', 'sending', 'failed');

CREATE INDEX document_download_approved_email_document_idx
  ON public.document_download_approved_email_deliveries (document_id);

ALTER TABLE public.document_download_approved_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_download_approved_email_deliveries
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_document_download_approved_email(
  target_document_id uuid,
  approver_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  queued_delivery_id uuid;
BEGIN
  INSERT INTO public.document_download_approved_email_deliveries (
    document_id,
    recipient_user_id,
    recipient_email,
    requester_name,
    customer_name,
    document_name,
    storage_path,
    job_number,
    invoice_number,
    awb_bl_number,
    approved_by
  )
  SELECT
    document.id,
    requester.id,
    lower(trim(requester.email)),
    COALESCE(
      NULLIF(trim(requester.contact_person), ''),
      NULLIF(trim(requester.user_name), ''),
      requester.email
    ),
    COALESCE(NULLIF(trim(job.shipper_name), ''), '-'),
    document.name,
    document.storage_path,
    job.job_number,
    job.invoice_number,
    COALESCE(NULLIF(job.hbl_hawb, ''), NULLIF(job.mbl_mawb, '')),
    lower(trim(approver_email))
  FROM public.shipment_documents AS document
  JOIN public.shipment_jobs AS job ON job.id = document.shipment_job_id
  JOIN public.app_users AS requester
    ON requester.id = document.download_requested_by_user_id
  JOIN storage.objects AS stored_file
    ON stored_file.bucket_id = 'shipment-documents'
    AND stored_file.name = document.storage_path
  WHERE document.id = target_document_id
    AND document.scope = 'customer'
    AND document.approval_status = 'approved'
    AND document.deleted_at IS NULL
    AND requester.is_active = true
    AND requester.deleted_at IS NULL
    AND COALESCE((stored_file.metadata ->> 'size')::bigint, 0) <= 26214400
  RETURNING id INTO queued_delivery_id;

  IF queued_delivery_id IS NULL THEN
    RAISE EXCEPTION 'Approved document requester or emailable attachment is unavailable';
  END IF;

  RETURN queued_delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_document_download_approved_email(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_document_download_approved_email()
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
      'delivery_type', 'document_download_approved',
      'delivery_id', NEW.id
    ),
    timeout_milliseconds := 5000
  );

  UPDATE public.document_download_approved_email_deliveries
  SET dispatched_at = now(), updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.document_download_approved_email_deliveries
    SET last_error = left(SQLERRM, 1000), updated_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_document_download_approved_email()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER dispatch_document_download_approved_email_after_insert
  AFTER INSERT ON public.document_download_approved_email_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_document_download_approved_email();

CREATE OR REPLACE FUNCTION public.claim_document_download_approved_email(
  target_delivery_id uuid
)
RETURNS TABLE (
  id uuid,
  recipient_email text,
  requester_name text,
  customer_name text,
  document_name text,
  storage_path text,
  job_number text,
  invoice_number text,
  awb_bl_number text,
  approved_by text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.document_download_approved_email_deliveries AS delivery
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
    delivery.requester_name,
    delivery.customer_name,
    delivery.document_name,
    delivery.storage_path,
    delivery.job_number,
    delivery.invoice_number,
    delivery.awb_bl_number,
    delivery.approved_by;
$$;

REVOKE ALL ON FUNCTION public.claim_document_download_approved_email(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_document_download_approved_email(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_document_download_approved_email(
  target_delivery_id uuid,
  message_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.document_download_approved_email_deliveries AS delivery
  SET
    delivery_status = 'sent',
    provider_message_id = NULLIF(message_id, ''),
    last_error = NULL,
    sent_at = now(),
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.complete_document_download_approved_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_document_download_approved_email(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fail_document_download_approved_email(
  target_delivery_id uuid,
  failure_message text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.document_download_approved_email_deliveries AS delivery
  SET
    delivery_status = 'failed',
    last_error = left(COALESCE(failure_message, 'Unknown email error'), 1000),
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.delivery_status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.fail_document_download_approved_email(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_document_download_approved_email(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.retry_document_download_approved_emails()
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
    FROM public.document_download_approved_email_deliveries AS delivery
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
          'delivery_type', 'document_download_approved',
          'delivery_id', delivery_record.id
        ),
        timeout_milliseconds := 5000
      );

      UPDATE public.document_download_approved_email_deliveries
      SET dispatched_at = now(), updated_at = now()
      WHERE id = delivery_record.id;
      dispatched_count := dispatched_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.document_download_approved_email_deliveries
        SET last_error = left(SQLERRM, 1000), updated_at = now()
        WHERE id = delivery_record.id;
    END;
  END LOOP;

  RETURN dispatched_count;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_document_download_approved_emails()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_document_download_approved_emails()
  TO service_role;

SELECT cron.schedule(
  'retry-document-download-approved-emails',
  '*/5 * * * *',
  'SELECT public.retry_document_download_approved_emails()'
);

CREATE OR REPLACE FUNCTION public.request_accessible_shipment_document_download(
  requester_email text,
  target_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('normal', 'admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only active users can request document downloads';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM public.shipment_documents
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND (
      shipment_documents.approval_status IN ('not_requested', 'rejected')
      OR (
        shipment_documents.approval_status = 'approved'
        AND (
          shipment_documents.approved_at IS NULL
          OR shipment_documents.approved_at <= now() - interval '3 days'
        )
      )
    )
  LIMIT 1;

  IF target_shipper_name IS NULL THEN
    RAISE EXCEPTION 'Requestable customer document was not found';
  END IF;

  IF NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'User cannot request this shipper document';
  END IF;

  UPDATE public.shipment_documents
  SET
    approval_status = 'pending',
    approved_at = NULL,
    approved_by = NULL,
    rejection_reason = NULL,
    download_requested_by_user_id = requester_record.id,
    download_requested_at = now(),
    updated_at = now()
  WHERE id = target_document_id;

  PERFORM public.queue_document_download_request_emails(
    target_document_id,
    requester_record.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_accessible_shipment_document_download(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_accessible_shipment_document_download(text, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_accessible_shipment_document_approval(
  requester_email text,
  target_document_id uuid,
  next_approval_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
BEGIN
  IF next_approval_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported approval status';
  END IF;

  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only admins can approve document download requests';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM public.shipment_documents
  JOIN public.shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND shipment_documents.approval_status = 'pending'
  LIMIT 1;

  IF target_shipper_name IS NULL THEN
    RAISE EXCEPTION 'Pending customer document request was not found';
  END IF;

  IF NOT public.can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'Admin cannot approve this shipper document';
  END IF;

  UPDATE public.shipment_documents
  SET
    approval_status = next_approval_status,
    approved_at = CASE
      WHEN next_approval_status = 'approved' THEN now()
      ELSE NULL
    END,
    approved_by = CASE
      WHEN next_approval_status = 'approved' THEN requester_record.email
      ELSE NULL
    END,
    rejection_reason = CASE
      WHEN next_approval_status = 'rejected' THEN ''
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_document_id;

  IF next_approval_status = 'approved' THEN
    PERFORM public.queue_document_download_approved_email(
      target_document_id,
      requester_record.email
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_accessible_shipment_document_approval(text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_accessible_shipment_document_approval(text, uuid, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
