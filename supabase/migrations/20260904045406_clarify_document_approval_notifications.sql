/*
  # Clarify document-download approval notifications

  Restore the document and shipment details already captured by the durable
  delivery queue so administrators can identify exactly what they are being
  asked to approve before opening CN Navigator.
*/

UPDATE public.email_templates
SET
  subject_template = '【CN Navigator自動送信】書類DL承認申請【{{document_name}}】',
  text_template = $template${{admin_name}} 様

CN Navigatorで書類のダウンロード承認申請がありました。

承認対象書類：{{document_name}}
書類区分：{{document_category}}
顧客名：{{customer_name}}
申請者：{{requester_name}}（{{requester_email}}）
案件番号：{{job_number}}
インボイス番号：{{invoice_number}}
AWB/BL番号：{{awb_bl_number}}

以下のリンクからCN Navigatorにログインし、「書類承認」で対象書類をご確認のうえ、承認または却下してください。
{{application_url}}

本メールは自動送信のため、ご返信いただいても対応いたしかねます。$template$,
  html_template = $template$<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CN Navigator 書類DL承認申請</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f1f5f9; color:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px; background-color:#ffffff; border-radius:16px;">
            <tr>
              <td align="center" style="padding:40px 32px 24px;">
                <img src="https://navigator.cnlogistics.co.jp/cn-logistics-logo.png" alt="CN Navigator" width="96" style="display:block; width:96px; max-width:96px; height:auto; margin:0 auto; border:0;" />
                <h1 style="margin:24px 0 0; color:#0f172a; font-size:24px; line-height:1.5; font-weight:700;">書類DL承認申請</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 40px;">
                <p style="margin:0 0 16px; color:#0f172a; font-size:16px; line-height:1.8; text-align:center;">{{admin_name}} 様</p>
                <p style="margin:0 0 24px; color:#475569; font-size:16px; line-height:1.8; text-align:center;">CN Navigatorで書類のダウンロード承認申請がありました。</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 24px; background-color:#f8fafc; border-radius:12px;">
                  <tr><td style="padding:11px 16px; color:#64748b; font-size:14px;">承認対象書類</td><td style="padding:11px 16px; color:#0f172a; font-size:14px; font-weight:700; word-break:break-all;">{{document_name}}</td></tr>
                  <tr><td style="padding:11px 16px; color:#64748b; font-size:14px;">書類区分</td><td style="padding:11px 16px; color:#0f172a; font-size:14px; font-weight:700;">{{document_category}}</td></tr>
                  <tr><td style="padding:11px 16px; color:#64748b; font-size:14px;">顧客名</td><td style="padding:11px 16px; color:#0f172a; font-size:14px; font-weight:700;">{{customer_name}}</td></tr>
                  <tr><td style="padding:11px 16px; color:#64748b; font-size:14px;">申請者</td><td style="padding:11px 16px; color:#0f172a; font-size:14px; font-weight:700;">{{requester_name}}<br /><span style="font-weight:400; color:#64748b;">{{requester_email}}</span></td></tr>
                  <tr><td style="padding:11px 16px; color:#64748b; font-size:14px;">案件番号</td><td style="padding:11px 16px; color:#0f172a; font-size:14px; font-weight:700;">{{job_number}}</td></tr>
                  <tr><td style="padding:11px 16px; color:#64748b; font-size:14px;">インボイス番号</td><td style="padding:11px 16px; color:#0f172a; font-size:14px; font-weight:700;">{{invoice_number}}</td></tr>
                  <tr><td style="padding:11px 16px; color:#64748b; font-size:14px;">AWB/BL番号</td><td style="padding:11px 16px; color:#0f172a; font-size:14px; font-weight:700;">{{awb_bl_number}}</td></tr>
                </table>
                <p style="margin:0 0 24px; color:#475569; font-size:14px; line-height:1.8; text-align:center;">対象書類をご確認のうえ、承認または却下してください。</p>
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
        </td>
      </tr>
    </table>
  </body>
</html>$template$,
  updated_at = now()
WHERE template_key = 'document_download_requested_admin';
