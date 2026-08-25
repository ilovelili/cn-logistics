/*
  # Simplify the internal document-download request email

  Internal administrators only need the customer and a link to the approval
  screen. Remove operational details and the English duplicate from the stored
  template while retaining the shared CN Navigator email styling.
*/

UPDATE public.email_templates
SET
  subject_template = '【CN Navigator自動送信】書類ダウンロード申請のお知らせ',
  text_template = $template${{admin_name}} 様

CN Navigatorで書類のダウンロード申請がありました。

顧客名：{{customer_name}}

以下のリンクからCN Navigatorにログインし、「書類承認」で申請内容をご確認ください。
{{application_url}}

本メールは自動送信のため、ご返信いただいても対応いたしかねます。$template$,
  html_template = $template$<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CN Navigator 書類ダウンロード申請</title>
  </head>

  <body style="margin:0; padding:0; background-color:#f1f5f9; color:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#ffffff; border-radius:16px;">
            <tr>
              <td align="center" style="padding:40px 32px 24px;">
                <img src="https://navigator.cnlogistics.co.jp/cn-logistics-logo.png" alt="CN Navigator" width="96" style="display:block; width:96px; max-width:96px; height:auto; margin:0 auto; border:0;" />
                <h1 style="margin:24px 0 0; color:#0f172a; font-size:24px; line-height:1.5; font-weight:700;">書類ダウンロード申請</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px 40px;">
                <p style="margin:0 0 16px; color:#0f172a; font-size:16px; line-height:1.8; text-align:center;">{{admin_name}} 様</p>
                <p style="margin:0 0 24px; color:#475569; font-size:16px; line-height:1.8; text-align:center;">CN Navigatorで書類のダウンロード申請がありました。</p>

                <div style="width:84%; max-width:440px; margin:0 auto 24px; padding:16px 20px; box-sizing:border-box; background-color:#f8fafc; border-radius:12px; color:#0f172a; font-size:14px; line-height:1.7; text-align:center;">
                  <span style="color:#64748b;">顧客名：</span><strong>{{customer_name}}</strong>
                </div>

                <p style="margin:0 0 24px; color:#475569; font-size:14px; line-height:1.8; text-align:center;">以下のリンクからCN Navigatorにログインし、「書類承認」で申請内容をご確認ください。</p>

                <div style="margin:0 0 24px; text-align:center;">
                  <a href="{{application_url}}" style="display:inline-block; padding:14px 28px; background-color:#22a7b8; border-radius:10px; color:#ffffff; font-size:16px; font-weight:700; text-decoration:none;">書類承認を確認する</a>
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
</html>$template$,
  updated_at = now()
WHERE template_key = 'document_download_requested_admin';
