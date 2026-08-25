/*
  # Align the shipper registration email with the login email

  Use the same email-client-safe table layout, palette, typography, card,
  primary action, and footer as the Auth0 login email while retaining the
  registration template's own supported variables.
*/

UPDATE public.email_templates
SET
  html_template = $template$<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CN Navigator 荷主登録完了</title>
  </head>

  <body style="margin:0; padding:0; background-color:#f1f5f9; color:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:16px;">
            <tr>
              <td align="center" style="padding:40px 32px 24px;">
                <div style="margin:0; color:#0891b2; font-size:18px; line-height:1.5; font-weight:700; letter-spacing:0.04em;">CN Navigator</div>
                <h1 style="margin:24px 0 0; color:#0f172a; font-size:24px; line-height:1.5; font-weight:700;">荷主登録完了</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 40px;">
                <p style="margin:0 0 16px; color:#0f172a; font-size:16px; line-height:1.8; text-align:center;">{{contact_person}} 様</p>
                <p style="margin:0 0 24px; color:#475569; font-size:16px; line-height:1.8; text-align:center;">CN Navigatorへの荷主登録が完了しました。</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                  <tr>
                    <td style="padding:16px 20px; border-bottom:1px solid #e2e8f0; color:#64748b; font-size:14px; line-height:1.7;">顧客名</td>
                    <td align="right" style="padding:16px 20px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{customer_name}}</td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px; color:#64748b; font-size:14px; line-height:1.7;">ログインメール</td>
                    <td align="right" style="padding:16px 20px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700; word-break:break-all;">{{recipient_email}}</td>
                  </tr>
                </table>

                <div style="margin:0 0 24px; text-align:center;">
                  <a href="{{application_url}}" style="display:inline-block; padding:14px 28px; background-color:#22a7b8; border-radius:10px; color:#ffffff; font-size:16px; font-weight:700; text-decoration:none;">ログインする</a>
                </div>

                <p style="margin:0 0 20px; color:#64748b; font-size:13px; line-height:1.7; text-align:center; word-break:break-all;">ボタンを利用できない場合は、以下のURLを開いてください。<br /><a href="{{application_url}}" style="color:#0891b2;">{{application_url}}</a></p>
                <p style="margin:0; color:#64748b; font-size:14px; line-height:1.8; text-align:center;">初回ログイン時は、登録メールアドレスに届く認証メールの案内に従って認証を完了してください。</p>

                <div style="margin:32px 0; border-top:1px solid #e2e8f0;"></div>

                <h2 style="margin:0 0 16px; color:#0f172a; font-size:20px; line-height:1.5; font-weight:700; text-align:center;">Registration complete</h2>
                <p style="margin:0 0 16px; color:#0f172a; font-size:16px; line-height:1.8; text-align:center;">Dear {{contact_person}},</p>
                <p style="margin:0 0 24px; color:#475569; font-size:15px; line-height:1.8; text-align:center;">Your shipper registration for CN Navigator has been approved and is ready to use.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                  <tr>
                    <td style="padding:16px 20px; border-bottom:1px solid #e2e8f0; color:#64748b; font-size:14px; line-height:1.7;">Customer</td>
                    <td align="right" style="padding:16px 20px; border-bottom:1px solid #e2e8f0; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700;">{{customer_name}}</td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px; color:#64748b; font-size:14px; line-height:1.7;">Login email</td>
                    <td align="right" style="padding:16px 20px; color:#0f172a; font-size:14px; line-height:1.7; font-weight:700; word-break:break-all;">{{recipient_email}}</td>
                  </tr>
                </table>

                <div style="margin:0 0 24px; text-align:center;">
                  <a href="{{application_url}}" style="display:inline-block; padding:14px 28px; background-color:#22a7b8; border-radius:10px; color:#ffffff; font-size:16px; font-weight:700; text-decoration:none;">Log in</a>
                </div>

                <p style="margin:0; color:#64748b; font-size:14px; line-height:1.8; text-align:center;">On your first login, follow the instructions in the authentication email sent to your registered address.</p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 40px; background-color:#f8fafc; border-radius:0 0 16px 16px;">
                <p style="margin:0; color:#64748b; font-size:13px; line-height:1.7; text-align:center;">このメールに心当たりがない場合は、そのまま破棄してください。<br />このメールは送信専用です。</p>
                <p style="margin:16px 0 0; color:#64748b; font-size:13px; line-height:1.7; text-align:center;">If you did not expect this email, you can safely disregard it.<br />This mailbox is not monitored.</p>
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0; color:#94a3b8; font-size:12px; text-align:center;">© CN Logistics. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>$template$,
  updated_at = now()
WHERE template_key = 'shipper_registration_approved';
