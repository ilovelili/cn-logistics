/*
  # Add the CN Navigator logo to the registration email

  Use the same public CDN asset as the application and place it in the centered
  header position used by the login email.
*/

UPDATE public.email_templates
SET
  html_template = replace(
    html_template,
    '<div style="margin:0; color:#0891b2; font-size:18px; line-height:1.5; font-weight:700; letter-spacing:0.04em;">CN Navigator</div>',
    '<img src="https://navigator.cnlogistics.co.jp/cn-logistics-logo.png" alt="CN Navigator" width="96" style="display:block; width:96px; max-width:96px; height:auto; margin:0 auto; border:0;" />'
  ),
  updated_at = now()
WHERE template_key = 'shipper_registration_approved';
