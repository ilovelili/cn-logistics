/*
  # Rename the shipper registration email variable

  Keep the internal app_users/delivery schema unchanged, while presenting the
  business-facing value as customer_name in the editable email template.
*/

UPDATE public.email_templates
SET
  text_template = replace(
    replace(
      replace(text_template, '{{shipper_name}}', '{{customer_name}}'),
      '荷主名：',
      '顧客名：'
    ),
    'Shipper:',
    'Customer:'
  ),
  html_template = replace(
    replace(
      replace(html_template, '{{shipper_name}}', '{{customer_name}}'),
      '荷主名',
      '顧客名'
    ),
    'Shipper:',
    'Customer:'
  ),
  updated_at = now()
WHERE template_key = 'shipper_registration_approved';
