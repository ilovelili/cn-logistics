/*
  # App users for demo login

  Stores the temporary user/admin accounts in the database. The frontend calls
  verify_app_login instead of hardcoding credentials or reading this table.
  Password storage here is intentionally temporary until Auth0 OTP replaces it.
*/

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'admin')),
  temporary_password text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct app user reads" ON app_users;
CREATE POLICY "No direct app user reads"
  ON app_users FOR SELECT
  USING (false);

INSERT INTO app_users (email, role, temporary_password)
VALUES
  ('user@test.com', 'user', '12345'),
  ('admin@cnlogistics.co.jp', 'admin', '12345')
ON CONFLICT (email) DO UPDATE
SET
  role = EXCLUDED.role,
  temporary_password = EXCLUDED.temporary_password,
  is_active = true,
  updated_at = now();

CREATE OR REPLACE FUNCTION verify_app_login(login_email text, login_password text)
RETURNS TABLE(role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_users.role
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(login_email))
    AND app_users.temporary_password = login_password
    AND app_users.is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION verify_app_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_app_login(text, text) TO anon, authenticated;
