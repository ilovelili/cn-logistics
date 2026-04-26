/*
  # Company user registration

  Admins can register company users for later super-admin approval. Registered
  records do not grant login access until the future approval flow is added.
*/

CREATE TABLE IF NOT EXISTS company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  user_name text NOT NULL,
  company_name text NOT NULL,
  company_address text NOT NULL,
  telephone text NOT NULL,
  budget numeric(14, 2) NOT NULL DEFAULT 0,
  contact_person text,
  notes text,
  approval_status text NOT NULL DEFAULT 'to_be_approved'
    CHECK (approval_status IN ('to_be_approved', 'approved', 'rejected')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_users'
      AND policyname = 'Anon can insert company users in demo'
  ) THEN
    CREATE POLICY "Anon can insert company users in demo"
      ON company_users FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_users'
      AND policyname = 'Anon can view company users in demo'
  ) THEN
    CREATE POLICY "Anon can view company users in demo"
      ON company_users FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
