/*
  # Manage shipment email templates

  The shipment-status email remains delivered through SES SMTP, while its
  subject and bodies are editable by verified, active super administrators.
  The table itself is private; the UI can only access it through role-checked
  RPCs and the email Edge Function reads it with the service role.
*/

CREATE TABLE public.email_templates (
  template_key text PRIMARY KEY,
  display_name text NOT NULL,
  subject_template text NOT NULL,
  text_template text NOT NULL,
  html_template text NOT NULL,
  updated_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_templates_key_format_check
    CHECK (template_key ~ '^[a-z0-9_]+$'),
  CONSTRAINT email_templates_subject_length_check
    CHECK (char_length(subject_template) BETWEEN 1 AND 500),
  CONSTRAINT email_templates_subject_single_line_check
    CHECK (subject_template !~ E'[\r\n]'),
  CONSTRAINT email_templates_text_length_check
    CHECK (char_length(text_template) BETWEEN 1 AND 50000),
  CONSTRAINT email_templates_html_length_check
    CHECK (char_length(html_template) BETWEEN 1 AND 200000)
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_templates
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.email_templates TO service_role;

INSERT INTO public.email_templates (
  template_key,
  display_name,
  subject_template,
  text_template,
  html_template
)
VALUES (
  'shipment_status_update',
  '船積みスケジュール更新',
  '【CN Navigator自動送信】船積みスケジュール更新のお知らせ【AWB/BL No: {{awb_bl_number}}】',
  $template$CN Navigatorをご利用のお客様

いつもお世話になっております。
船積み管理システム（CN Navigator）より自動配信しております。
ご依頼を頂いております以下の案件について船積みスケジュールが更新されましたのでお知らせいたします。
*******************************************
・AWB/BL番号：{{awb_bl_number}}
・積地：{{origin}}
・向け地／揚地：{{destination}}
・更新内容：{{update_details_ja}}
*******************************************
詳細および最新の状況は、以下のリンクよりシステムにログインしてご確認ください。
{{application_url}}

本メールは自動送信のため、ご返信いただいても対応いたしかねます。
ご不明な点がございましたら、担当窓口までお問い合わせください。

Subject: [CN Navigator Automated Email] Notice of Shipping Schedule Update [AWB/BL No: {{awb_bl_number}}]

Dear CN Navigator Customer,

This is an automated notification from our shipping management system, CN Navigator.
We are writing to inform you that the shipment has been updated as follows:
・AWB/BL No.: {{awb_bl_number}}
・Origin (POL): {{origin}}
・Destination (POD): {{destination}}
・Update Details: {{update_details_en}}

Please log in to the system via the link below to check the details and the latest status.
{{application_url}}

Please note that this is an automated email and replies to this address cannot be answered.
If you have any questions, please contact our Customer Service desk for further support.
Thank you.$template$,
  $template$<!doctype html>
<html lang="ja">
  <body style="margin:0;background:#f4f7fa;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif;line-height:1.7">
    <div style="max-width:680px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #dce3eb;border-radius:16px;overflow:hidden">
        <div style="background:#0f172a;color:#ffffff;padding:20px 28px;font-size:20px;font-weight:700">CN Navigator</div>
        <div style="padding:28px">
          <p>CN Navigatorをご利用のお客様</p>
          <p>いつもお世話になっております。<br>船積み管理システム（CN Navigator）より自動配信しております。<br>ご依頼を頂いております以下の案件について船積みスケジュールが更新されましたのでお知らせいたします。</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin:22px 0">
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">AWB/BL番号</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{awb_bl_number}}</td></tr>
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">積地</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{origin}}</td></tr>
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">向け地／揚地</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{destination}}</td></tr>
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">更新内容</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{update_details_ja}}</td></tr>
          </table>
          <p style="margin:24px 0"><a href="{{application_url}}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">システムにログインして確認</a></p>
          <p style="color:#64748b;font-size:13px">本メールは自動送信のため、ご返信いただいても対応いたしかねます。<br>ご不明な点がございましたら、担当窓口までお問い合わせください。</p>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:28px 0">
          <p>Dear CN Navigator Customer,</p>
          <p>This is an automated notification from our shipping management system, CN Navigator.<br>We are writing to inform you that the shipment has been updated as follows:</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin:22px 0">
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">AWB/BL No.</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{awb_bl_number}}</td></tr>
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">Origin (POL)</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{origin}}</td></tr>
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">Destination (POD)</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{destination}}</td></tr>
            <tr><th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:36%">Update Details</th><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">{{update_details_en}}</td></tr>
          </table>
          <p style="margin:24px 0"><a href="{{application_url}}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px">Log in to CN Navigator</a></p>
          <p style="color:#64748b;font-size:13px">Please note that this is an automated email and replies to this address cannot be answered.<br>If you have any questions, please contact our Customer Service desk for further support.</p>
        </div>
      </div>
    </div>
  </body>
</html>$template$
);

CREATE OR REPLACE FUNCTION public.list_email_templates_for_super_admin()
RETURNS TABLE (
  template_key text,
  display_name text,
  subject_template text,
  text_template text,
  html_template text,
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
    template.template_key,
    template.display_name,
    template.subject_template,
    template.text_template,
    template.html_template,
    template.updated_at
  FROM public.email_templates AS template
  ORDER BY template.display_name, template.template_key;
END;
$$;

REVOKE ALL ON FUNCTION public.list_email_templates_for_super_admin()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_email_templates_for_super_admin()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_email_template_for_super_admin(
  target_template_key text,
  new_subject_template text,
  new_text_template text,
  new_html_template text
)
RETURNS TABLE (
  template_key text,
  display_name text,
  subject_template text,
  text_template text,
  html_template text,
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
  requester_id uuid;
BEGIN
  SELECT app_user.id
  INTO requester_id
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = authenticated_email
    AND app_user.role = 'super_admin'
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  IF authenticated_email = ''
    OR NOT authenticated_email_verified
    OR requester_id IS NULL THEN
    RAISE EXCEPTION 'Super administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(trim(new_subject_template), '') IS NULL
    OR NULLIF(trim(new_text_template), '') IS NULL
    OR NULLIF(trim(new_html_template), '') IS NULL THEN
    RAISE EXCEPTION 'Subject, plain text, and HTML templates are required';
  END IF;

  RETURN QUERY
  UPDATE public.email_templates AS template
  SET
    subject_template = new_subject_template,
    text_template = new_text_template,
    html_template = new_html_template,
    updated_by = requester_id,
    updated_at = now()
  WHERE template.template_key = target_template_key
  RETURNING
    template.template_key,
    template.display_name,
    template.subject_template,
    template.text_template,
    template.html_template,
    template.updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email template was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_email_template_for_super_admin(
  text,
  text,
  text,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_email_template_for_super_admin(
  text,
  text,
  text,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
