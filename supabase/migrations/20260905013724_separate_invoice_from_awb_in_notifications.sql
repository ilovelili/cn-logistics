/*
  Keep invoice and AWB/BL identifiers distinct in shipment notification emails.
  Previously invoice_number was copied into awb_bl_number when no bill number
  existed, causing the email to display a correct value under the wrong label.
*/

ALTER TABLE public.shipment_notification_email_deliveries
  ADD COLUMN invoice_number text;

CREATE OR REPLACE FUNCTION public.normalize_shipment_notification_awb_bl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT COALESCE(
    NULLIF(trim(job.hbl_hawb), ''),
    NULLIF(trim(job.mbl_mawb), '')
  )
  INTO NEW.awb_bl_number
  FROM public.shipment_jobs AS job
  WHERE job.id = NEW.shipment_job_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_shipment_notification_awb_bl()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS normalize_shipment_notification_awb_bl_before_write
  ON public.shipment_notifications;
CREATE TRIGGER normalize_shipment_notification_awb_bl_before_write
  BEFORE INSERT OR UPDATE OF shipment_job_id
  ON public.shipment_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_shipment_notification_awb_bl();

UPDATE public.shipment_notifications AS notification
SET awb_bl_number = COALESCE(
  NULLIF(trim(job.hbl_hawb), ''),
  NULLIF(trim(job.mbl_mawb), '')
)
FROM public.shipment_jobs AS job
WHERE job.id = notification.shipment_job_id;

UPDATE public.shipment_notification_email_deliveries AS delivery
SET
  invoice_number = NULLIF(trim(job.invoice_number), ''),
  awb_bl_number = COALESCE(
    NULLIF(trim(job.hbl_hawb), ''),
    NULLIF(trim(job.mbl_mawb), '')
  )
FROM public.shipment_notifications AS notification
JOIN public.shipment_jobs AS job
  ON job.id = notification.shipment_job_id
WHERE notification.id = delivery.notification_id;

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
    invoice_number,
    awb_bl_number,
    origin,
    destination,
    change_details
  )
  SELECT
    NEW.id,
    app_user.email,
    NEW.previous_status,
    NEW.current_status,
    NULLIF(trim(job.invoice_number), ''),
    COALESCE(NULLIF(trim(job.hbl_hawb), ''), NULLIF(trim(job.mbl_mawb), '')),
    NEW.origin,
    NEW.destination,
    NEW.change_details
  FROM public.app_users AS app_user
  JOIN public.shipment_jobs AS job
    ON job.id = NEW.shipment_job_id
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

DROP FUNCTION public.claim_shipment_notification_email(uuid);
CREATE FUNCTION public.claim_shipment_notification_email(
  target_delivery_id uuid
)
RETURNS TABLE (
  id uuid,
  recipient_email text,
  previous_status text,
  current_status text,
  invoice_number text,
  awb_bl_number text,
  origin text,
  destination text,
  change_details jsonb
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
    delivery.invoice_number,
    delivery.awb_bl_number,
    delivery.origin,
    delivery.destination,
    delivery.change_details;
$$;

REVOKE ALL ON FUNCTION public.claim_shipment_notification_email(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shipment_notification_email(uuid)
  TO service_role;

UPDATE public.email_templates
SET
  subject_template = '【CN Navigator自動送信】船積みスケジュール更新のお知らせ【{{shipment_reference}}】',
  text_template = replace(
    replace(
      text_template,
      '・AWB/BL番号：{{awb_bl_number}}',
      '・インボイス番号：{{invoice_number}}' || E'\n' || '・AWB/BL番号：{{awb_bl_number}}'
    ),
    '・AWB/BL No.: {{awb_bl_number}}',
    '・Invoice No.: {{invoice_number}}' || E'\n' || '・AWB/BL No.: {{awb_bl_number}}'
  ),
  html_template = replace(
    replace(
      html_template,
      '<tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">AWB/BL番号</th>',
      '<tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">インボイス番号</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{invoice_number}}</td></tr><tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">AWB/BL番号</th>'
    ),
    '<tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">AWB/BL No.</th>',
    '<tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">Invoice No.</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{invoice_number}}</td></tr><tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">AWB/BL No.</th>'
  ),
  updated_at = now()
WHERE template_key = 'shipment_status_update';

NOTIFY pgrst, 'reload schema';
