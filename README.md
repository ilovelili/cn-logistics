# CN Navigator

## Email notifications

Shipment status changes create both the in-app notification and an email
delivery record in the same database transaction. Postgres invokes the
`send-shipment-notification-email` Edge Function asynchronously, and a cron job
retries pending or failed deliveries up to five times.

The `shipment_status_update` subject, plain-text body, and HTML body are stored
in `email_templates`. Verified active super administrators can edit them from
the **Email templates** menu. Shipment values use `{{variable_name}}`
placeholders and are substituted by the Edge Function when each email is sent.

When a shipper contact is approved and can log in, the same delivery system
sends the `shipper_registration_approved` template to the contact's registered
email address. Its editable variables are `{{customer_name}}`,
`{{contact_person}}`, `{{recipient_email}}`, and `{{application_url}}`.

When an administrator registers a new shipper, every active super administrator
receives the Japanese-only `shipper_registration_approval_admin` template so
they can review and approve it. Its editable variables are
`{{super_admin_name}}`, `{{customer_name}}`, `{{registered_by}}`, and
`{{application_url}}`.

When a user submits a customer-document download request, responsible active
administrators receive the `document_download_requested_admin` template. The
recipient set combines the shipment and customer assignments, with active super
administrators used only when no assigned administrator is available. This
template is also editable from **Email templates**.

When an administrator approves a pending document download, the requesting
user receives the editable `document_download_approved_user` template with the
approved private Storage object attached. Attachments are limited to 25 MB so
the encoded message stays within the SES SMTP message-size limit.

The sender is `CN Navigator <no-reply@navigator.cnlogistics.co.jp>`, using the
Tokyo-region endpoint `email-smtp.ap-northeast-1.amazonaws.com`. Verify that
address, or the `navigator.cnlogistics.co.jp` domain, in the same AWS SES region
as the SMTP credentials.

Before deployment, configure these Supabase Edge Function secrets in the
Dashboard. Never commit them to an env file:

- `SES_SMTP_PORT` — `587` for STARTTLS
- `SES_SMTP_USERNAME`
- `SES_SMTP_PASSWORD`
- `CN_NAVIGATOR_URL` — for example, `https://navigator.cnlogistics.co.jp`
- `EMAIL_WEBHOOK_SECRET` — a newly generated high-entropy shared secret

Add two encrypted Supabase Vault secrets through the Dashboard:

- `cn_navigator_project_url` — the Supabase project URL
- `cn_navigator_email_webhook_secret` — exactly the same value as the Edge
  Function's `EMAIL_WEBHOOK_SECRET`

Apply the notification/email migrations through the project's database release
workflow, then deploy the function:

```sh
supabase functions deploy send-shipment-notification-email
```

Do not run a blanket `supabase db push` until the remote migration ledger has
been reconciled with the repository's older migration files.

AWS SES SMTP credentials are region-specific. If the SES account is still in
sandbox mode, recipients must also be verified until production access is
approved.

## Auth0 user provisioning

CN Navigator uses an invite-only Auth0 passwordless connection. `app_users` is
the source of truth for access and roles; logging in through Auth0 never creates
an application user or derives an admin role from an email domain.

Before deploying the provisioning function:

1. Create an Auth0 Machine-to-Machine application authorized for the Auth0
   Management API with `read:users`, `create:users`, and `delete:users`.
2. Add that application's client ID to the passwordless email connection's
   enabled clients.
3. Configure these Supabase Edge Function secrets:
   `AUTH0_DOMAIN`, `AUTH0_MANAGEMENT_CLIENT_ID`,
   `AUTH0_MANAGEMENT_CLIENT_SECRET`, and optionally
   `AUTH0_USER_CONNECTION` (defaults to `email`).
4. Deploy the `provision-auth0-user` Edge Function and apply the migration.
5. In Auth0, disable sign-ups for the passwordless email connection only after
   the initial super-admin identity exists in both Auth0 and `app_users`.

Admin operators and normal users are provisioned in Auth0 by the existing
creation forms, including contacts added later from the shipper edit screen.
Normal users still cannot enter the application until their
`app_users.approval_status` is `approved`.

Provisioning suppresses Auth0's automatic verification email because that
message is generated for the Machine-to-Machine provisioning client, which has
no browser callback URL. A newly provisioned user should open CN Navigator and
complete the normal Auth0 passwordless email challenge there; provisioning does
not create a logged-in session or bypass that challenge.

Application users are saved before Auth0 provisioning begins. The database
tracks each attempt as `pending`, `provisioned`, or `failed`; if Auth0 is
temporarily unavailable, the user remains in the application list and an
administrator can retry provisioning safely. Auth0 stores identity only—roles
remain exclusively in `app_users`.

Deleting an admin operator or normal user disables application access before
calling the Auth0 Management API. A successful deletion soft-deletes the local
record and permanently removes the Auth0 user. If Auth0 is temporarily
unavailable, the local account stays disabled and visible so the super admin
can retry deletion safely.
