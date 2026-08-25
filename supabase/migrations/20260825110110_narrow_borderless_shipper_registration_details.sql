-- Keep the registration details compact and visually lighter in both language sections.
UPDATE public.email_templates
SET
  html_template = replace(
    replace(
      replace(
        html_template,
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">',
        '<table role="presentation" width="84%" align="center" cellspacing="0" cellpadding="0" border="0" style="width:84%; max-width:440px; margin:0 auto 24px; background-color:#f8fafc; border:0; border-radius:12px;">'
      ),
      'padding:16px 20px; border-bottom:1px solid #e2e8f0; color:#64748b;',
      'padding:16px 20px; color:#64748b;'
    ),
    'padding:16px 20px; border-bottom:1px solid #e2e8f0; color:#0f172a;',
    'padding:16px 20px; color:#0f172a;'
  ),
  updated_at = now()
WHERE template_key = 'shipper_registration_approved';
