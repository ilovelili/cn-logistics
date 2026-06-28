# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

CN Navigator is a React + TypeScript + Vite web app for shipment management. It uses Supabase for persistence, RPC-backed business logic, and storage-backed document/avatar files.

The app has three role surfaces:

- **Super admin**: shipment management, shipper registration, admin operator registration, standard flow management, feedback review, and account switching.
- **Admin**: assigned shipment management, shipper registration, document approval, and switch-to-user view.
- **Normal user / shipper user**: own-shipment list/detail, document download requests, feedback submission, profile/avatar.

The product is Japanese-first. Keep Japanese labels and copy polished, and update English translations when adding or changing translation keys.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Supabase JS client
- lucide-react icons
- ESLint + Prettier

## Important Files

- `src/main.tsx`: React app entrypoint.
- `src/App.tsx`: top-level auth/session routing, user/admin mode switching, shared shipment loading.
- `src/admin/AdminPanel.tsx`: admin shell and role-specific admin navigation.
- `src/admin/ShipmentEntryForm.tsx`: admin shipment create/update workflow.
- `src/admin/UserRegistrationForm.tsx`: shipper user registration, approval, assignment UI.
- `src/admin/AdminOperatorManagement.tsx`: super-admin admin-operator management.
- `src/admin/StandardFlowManagement.tsx`: super-admin tracking template/standard flow management.
- `src/admin/FeedbackReviewPanel.tsx`: super-admin feedback review.
- `src/components/ShipmentJobs.tsx`: shipper/admin shipment list, filters, stats, feedback entry.
- `src/components/ShipmentJobsTable.tsx`: shipment table rendering and action controls.
- `src/components/ShipmentJobDetailModal.tsx`: shipment detail modal.
- `src/lib/supabase.ts`: Supabase client initialization from Vite env vars.
- `src/lib/auth.ts`: app login/profile/avatar RPC helpers.
- `src/lib/shipmentJobs.ts`: shipment/document/tracking types and Supabase calls.
- `src/lib/shipperUsers.ts`: shipper user RPC helpers.
- `src/lib/adminOperators.ts`: admin operator RPC helpers.
- `src/lib/shipmentFeedback.ts`: feedback RPC helpers.
- `src/lib/i18n.ts`: Japanese and English strings.
- `supabase/migrations/`: database schema, RPCs, policies, and seed data.
- `public/sample-document.pdf`: sample document asset used by migrations/storage workflows.

## Environment

The app requires these Vite environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not print, commit, or copy `.env` values into logs, docs, screenshots, or generated artifacts.

## Common Commands

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Typecheck:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Format:

```bash
npm run format
```

Format check:

```bash
npm run format:check
```

There is no dedicated test script currently. For risky changes, run at least `npm run typecheck`, `npm run lint`, and `npm run build`.

## Architecture Notes

- Authentication is app-level and RPC-based, not Supabase Auth session-based.
- Session state is stored in `sessionStorage` keys such as `app_auth_role`, `app_auth_email`, `app_profile_role`, and `admin_auth`.
- `App.tsx` decides whether to render the admin panel or the normal shipment UI.
- Super admins and admins can switch into user views through header account-switch controls. Preserve the “currently switched as”/return-to-admin behavior.
- Role authorization should be enforced in Supabase RPCs and policies as well as hidden/disabled in the UI.
- Shipment data includes customer documents and internal documents. Normal users should only see allowed customer-facing documents.
- The current shipment status flow uses the standard flow statuses in `standardFlowStatusOptions`; legacy statuses still exist in types and migrations for backward compatibility.
- Most database operations go through Supabase RPC functions. Prefer adding/updating typed helpers in `src/lib/*` instead of scattering direct calls in UI components.

## UI Conventions

- Use Tailwind classes and the existing component patterns.
- Use `lucide-react` icons for icon buttons and navigation items.
- Keep table tooling consistent: pagination, sticky header toggle, column settings, horizontal scroll hints, and sortable headers are already reusable.
- Keep card radii and control styling consistent with existing components.
- Do not introduce a marketing landing page; the app opens directly into operational workflows after login.
- For admin/operations screens, favor dense, scannable layouts over decorative presentation.
- Preserve mobile behavior: sidebars collapse into overlays; headers wrap controls.

## Internationalization

- All user-facing copy should go through `src/lib/i18n.ts`.
- Add keys to both Japanese (`ja`) and English (`en`) maps.
- Japanese is the primary UX. Write natural business Japanese, not machine-literal translations.
- Avoid hard-coded labels in components unless the text is not user-facing.

## Supabase And Migrations

- Treat `supabase/migrations/` as append-only history. Do not edit old migrations unless the user explicitly asks and the project workflow requires it.
- Add a new timestamped migration for schema/RPC/policy changes.
- Keep TypeScript types in `src/lib/*` aligned with RPC return shapes.
- Be careful with soft-delete fields and read scopes; many migrations harden visibility by role.
- Document/download approval status values are:
  - `not_requested`
  - `pending`
  - `approved`
  - `rejected`
- Shipper user approval status values are:
  - `to_be_approved`
  - `approved`
  - `rejected`

## Security And Privacy

- Never expose user passwords, demo passwords, initial passwords, Supabase keys, or `.env` values in chat responses, docs, screenshots, PDFs, commit messages, or logs.
- If screenshots are needed, ensure password fields are empty or masked and no secret-bearing developer console output is visible.
- Do not add credentials to `AGENTS.md`, README, migration comments, seed explanations, or manuals.
- Avoid logging sensitive form values such as passwords, customer contact data, or document URLs.
- Admin operator creation includes an initial password field. Treat it as sensitive even in demos.
- Customer documents and internal documents have different visibility rules; do not loosen them without checking the RPC/policy layer.
- Do not submit forms in a live environment unless the user explicitly asked for that data-changing action.

## Coding Guidelines

- Keep changes scoped to the requested workflow.
- Prefer existing helper functions and component utilities over new abstractions.
- Use typed interfaces for Supabase data and form shapes.
- Normalize emails with trimming/lowercasing where existing code does.
- Handle Supabase errors by throwing in `src/lib/*` helpers and showing localized toasts/messages in UI components.
- Keep async effects cancellable with the existing `active` boolean pattern where applicable.
- Avoid broad refactors in table components; they carry many role-specific display rules.
- Use concise comments only for non-obvious logic.

## Verification Checklist

Before finishing substantial changes:

- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm run build`.
- Manually verify affected role(s): super admin, admin, normal user.
- Check both Japanese and English strings if translation keys changed.
- For document/download changes, verify customer/internal visibility and approval states.
- For auth/session changes, verify login, logout, admin mode, user mode, and account switching.
- For UI changes, check desktop and mobile widths.

## Generated Artifacts

- `manual-output/` is used for generated manuals and similar deliverables. Do not treat generated PDFs as source code.
- Do not commit generated artifacts unless the user asks for them to be versioned.
- Clean up temporary scripts used only for generation unless they are intentionally part of project tooling.
