/*
  # Pending company user edits

  Allows admins in the current demo auth model to edit registered company users
  only while they are still waiting for approval.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_users'
      AND policyname = 'Anon can update pending company users in demo'
  ) THEN
    CREATE POLICY "Anon can update pending company users in demo"
      ON company_users FOR UPDATE
      TO anon
      USING (approval_status = 'to_be_approved')
      WITH CHECK (approval_status = 'to_be_approved');
  END IF;
END $$;
