/*
  # Enable RLS on administrator assignments

  The application accesses this internal relationship table through hardened
  database RPCs. With no direct client policies, RLS provides default-deny
  protection for Data API access.
*/

ALTER TABLE public.app_user_admin_assignments
  ENABLE ROW LEVEL SECURITY;
