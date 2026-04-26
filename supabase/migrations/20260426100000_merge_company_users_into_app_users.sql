/*
  # Merge company users into app_users

  app_users becomes the single user table with three roles:
  - normal: company users
  - admin: admin users
  - super_admin: future approval/admin owner role
*/

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'app_users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app_users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS zipcode text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS telephone text,
  ADD COLUMN IF NOT EXISTS budget numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS created_by text;

UPDATE app_users
SET role = 'normal'
WHERE role = 'user';

ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('normal', 'admin', 'super_admin'));

ALTER TABLE app_users
  ADD CONSTRAINT app_users_approval_status_check
  CHECK (approval_status IN ('to_be_approved', 'approved', 'rejected'));

UPDATE app_users
SET
  approval_status = 'approved',
  user_name = COALESCE(user_name, email),
  company_name = COALESCE(company_name, CASE WHEN role = 'normal' THEN email ELSE NULL END),
  updated_at = now()
WHERE email IN ('user@test.com', 'admin@cnlogistics.co.jp');

INSERT INTO app_users (email, role, temporary_password, user_name, approval_status, is_active)
VALUES (
  'super_admin@cnlogistics.co.jp',
  'super_admin',
  '12345',
  'Super Admin',
  'approved',
  true
)
ON CONFLICT (email) DO UPDATE
SET
  role = EXCLUDED.role,
  temporary_password = EXCLUDED.temporary_password,
  user_name = EXCLUDED.user_name,
  approval_status = EXCLUDED.approval_status,
  is_active = true,
  updated_at = now();

INSERT INTO app_users (
  email,
  role,
  temporary_password,
  user_name,
  company_name,
  zipcode,
  company_address,
  telephone,
  budget,
  contact_person,
  notes,
  approval_status,
  created_by,
  is_active,
  created_at,
  updated_at
)
SELECT
  company_users.email,
  'normal',
  '12345',
  company_users.company_name,
  company_users.company_name,
  company_users.zipcode,
  company_users.company_address,
  company_users.telephone,
  company_users.budget,
  company_users.contact_person,
  company_users.notes,
  company_users.approval_status,
  company_users.created_by,
  true,
  company_users.created_at,
  company_users.updated_at
FROM company_users
ON CONFLICT (email) DO UPDATE
SET
  role = 'normal',
  user_name = EXCLUDED.user_name,
  company_name = EXCLUDED.company_name,
  zipcode = EXCLUDED.zipcode,
  company_address = EXCLUDED.company_address,
  telephone = EXCLUDED.telephone,
  budget = EXCLUDED.budget,
  contact_person = EXCLUDED.contact_person,
  notes = EXCLUDED.notes,
  approval_status = EXCLUDED.approval_status,
  created_by = EXCLUDED.created_by,
  is_active = EXCLUDED.is_active,
  updated_at = now();

DROP FUNCTION IF EXISTS verify_app_login(text, text);

CREATE OR REPLACE FUNCTION verify_app_login(login_email text, login_password text)
RETURNS TABLE(role text, email text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_users.role, app_users.email, app_users.avatar_url
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(login_email))
    AND app_users.temporary_password = login_password
    AND app_users.is_active = true
    AND (
      app_users.role IN ('admin', 'super_admin')
      OR (
        app_users.role = 'normal'
        AND app_users.approval_status = 'approved'
      )
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION verify_app_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_app_login(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_registered_normal_users(admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  company_name text,
  zipcode text,
  company_address text,
  telephone text,
  budget numeric,
  contact_person text,
  notes text,
  approval_status text,
  created_by text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_users.id,
    app_users.email,
    app_users.company_name,
    app_users.zipcode,
    app_users.company_address,
    app_users.telephone,
    app_users.budget,
    app_users.contact_person,
    app_users.notes,
    app_users.approval_status,
    app_users.created_by,
    app_users.created_at,
    app_users.updated_at
  FROM app_users
  WHERE app_users.role = 'normal'
    AND app_users.created_by = admin_email
  ORDER BY app_users.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_registered_normal_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_registered_normal_users(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION create_registered_normal_user(
  user_email text,
  user_company_name text,
  user_zipcode text,
  user_company_address text,
  user_telephone text,
  user_budget numeric,
  user_contact_person text,
  user_notes text,
  admin_email text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO app_users (
    email,
    role,
    temporary_password,
    user_name,
    company_name,
    zipcode,
    company_address,
    telephone,
    budget,
    contact_person,
    notes,
    approval_status,
    created_by,
    is_active
  )
  VALUES (
    trim(user_email),
    'normal',
    '12345',
    trim(user_company_name),
    trim(user_company_name),
    trim(user_zipcode),
    trim(user_company_address),
    trim(user_telephone),
    user_budget,
    NULLIF(trim(user_contact_person), ''),
    NULLIF(trim(user_notes), ''),
    'to_be_approved',
    admin_email,
    true
  );
$$;

REVOKE ALL ON FUNCTION create_registered_normal_user(text, text, text, text, text, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_registered_normal_user(text, text, text, text, text, numeric, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_pending_registered_normal_user(
  user_id uuid,
  user_email text,
  user_company_name text,
  user_zipcode text,
  user_company_address text,
  user_telephone text,
  user_budget numeric,
  user_contact_person text,
  user_notes text
)
RETURNS TABLE(
  id uuid,
  email text,
  company_name text,
  zipcode text,
  company_address text,
  telephone text,
  budget numeric,
  contact_person text,
  notes text,
  approval_status text,
  created_by text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE app_users
  SET
    email = trim(user_email),
    user_name = trim(user_company_name),
    company_name = trim(user_company_name),
    zipcode = trim(user_zipcode),
    company_address = trim(user_company_address),
    telephone = trim(user_telephone),
    budget = user_budget,
    contact_person = NULLIF(trim(user_contact_person), ''),
    notes = NULLIF(trim(user_notes), ''),
    updated_at = now()
  WHERE app_users.id = user_id
    AND app_users.role = 'normal'
    AND app_users.approval_status = 'to_be_approved'
  RETURNING
    app_users.id,
    app_users.email,
    app_users.company_name,
    app_users.zipcode,
    app_users.company_address,
    app_users.telephone,
    app_users.budget,
    app_users.contact_person,
    app_users.notes,
    app_users.approval_status,
    app_users.created_by,
    app_users.created_at,
    app_users.updated_at;
$$;

REVOKE ALL ON FUNCTION update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text) TO anon, authenticated;
