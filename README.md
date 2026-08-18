# CN Navigator

## TODO

- Set up email sending infrastructure before implementing email notification features.
  - Candidate: AWS SES.
  - Needed for future shipment/customer notification workflows.

- Supabase Edge Functions
- An email provider like Resend, SendGrid, Postmark, AWS SES, etc.
- Database triggers or app-side calls to invoke the Edge Function

## Auth0 user provisioning

CN Navigator uses an invite-only Auth0 passwordless connection. `app_users` is
the source of truth for access and roles; logging in through Auth0 never creates
an application user or derives an admin role from an email domain.

Before deploying the provisioning function:

1. Create an Auth0 Machine-to-Machine application authorized for the Auth0
   Management API with `read:users` and `create:users`.
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
creation forms. Normal users still cannot enter the application until their
`app_users.approval_status` is `approved`.

Application users are saved before Auth0 provisioning begins. The database
tracks each attempt as `pending`, `provisioned`, or `failed`; if Auth0 is
temporarily unavailable, the user remains in the application list and an
administrator can retry provisioning safely. Auth0 stores identity only—roles
remain exclusively in `app_users`.
