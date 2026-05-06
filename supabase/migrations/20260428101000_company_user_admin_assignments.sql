/*
  # Company user admin assignments

  Allows a normal/company user to be bound to multiple admin operators.
  The legacy app_users.created_by value remains as the creator/primary admin,
  and is backfilled as the first assignment.
*/

CREATE TABLE IF NOT EXISTS app_user_admin_assignments (
  normal_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  assigned_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (normal_user_id, admin_user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_user_admin_assignments_admin
  ON app_user_admin_assignments(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_app_user_admin_assignments_normal
  ON app_user_admin_assignments(normal_user_id);

INSERT INTO app_user_admin_assignments (
  normal_user_id,
  admin_user_id,
  assigned_by
)
SELECT
  normal_user.id,
  admin_user.id,
  normal_user.created_by
FROM app_users normal_user
JOIN app_users admin_user
  ON lower(admin_user.email) = lower(normal_user.created_by)
WHERE normal_user.role = 'normal'
  AND normal_user.created_by IS NOT NULL
  AND normal_user.deleted_at IS NULL
  AND admin_user.role = 'admin'
  AND admin_user.deleted_at IS NULL
ON CONFLICT (normal_user_id, admin_user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_normal_user_admin_assignments(target_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'admin_user_id', admin_user.id,
        'email', admin_user.email,
        'user_name', admin_user.user_name,
        'created_at', assignment.created_at,
        'updated_at', assignment.updated_at
      )
      ORDER BY admin_user.email
    ),
    '[]'::jsonb
  )
  FROM app_user_admin_assignments assignment
  JOIN app_users admin_user
    ON admin_user.id = assignment.admin_user_id
  WHERE assignment.normal_user_id = target_user_id
    AND admin_user.role = 'admin'
    AND admin_user.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION get_normal_user_admin_assignments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_normal_user_admin_assignments(uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS list_registered_normal_users(text);

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
  updated_at timestamptz,
  admin_assignments jsonb
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
    app_users.updated_at,
    get_normal_user_admin_assignments(app_users.id) AS admin_assignments
  FROM app_users
  WHERE app_users.role = 'normal'
    AND app_users.deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM app_users requester
        WHERE lower(requester.email) = lower(trim(admin_email))
          AND requester.role = 'super_admin'
          AND requester.is_active = true
          AND requester.deleted_at IS NULL
      )
      OR app_users.created_by = lower(trim(admin_email))
      OR EXISTS (
        SELECT 1
        FROM app_user_admin_assignments assignment
        JOIN app_users admin_user
          ON admin_user.id = assignment.admin_user_id
        WHERE assignment.normal_user_id = app_users.id
          AND lower(admin_user.email) = lower(trim(admin_email))
          AND admin_user.role = 'admin'
          AND admin_user.deleted_at IS NULL
      )
    )
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_user_email text := lower(trim(user_email));
  normalized_admin_email text := lower(trim(admin_email));
  created_user_id uuid;
  creator_admin_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = normalized_user_email
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User email already exists';
  END IF;

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
    deleted_at,
    deleted_by
  )
  VALUES (
    normalized_user_email,
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
    normalized_admin_email,
    true,
    NULL,
    NULL
  )
  ON CONFLICT (email) DO UPDATE
  SET
    role = 'normal',
    temporary_password = '12345',
    user_name = EXCLUDED.user_name,
    company_name = EXCLUDED.company_name,
    zipcode = EXCLUDED.zipcode,
    company_address = EXCLUDED.company_address,
    telephone = EXCLUDED.telephone,
    budget = EXCLUDED.budget,
    contact_person = EXCLUDED.contact_person,
    notes = EXCLUDED.notes,
    approval_status = 'to_be_approved',
    created_by = normalized_admin_email,
    is_active = true,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = now()
  WHERE app_users.deleted_at IS NOT NULL
  RETURNING app_users.id INTO created_user_id;

  SELECT app_users.id
  INTO creator_admin_id
  FROM app_users
  WHERE lower(app_users.email) = normalized_admin_email
    AND app_users.role = 'admin'
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF created_user_id IS NOT NULL AND creator_admin_id IS NOT NULL THEN
    INSERT INTO app_user_admin_assignments (
      normal_user_id,
      admin_user_id,
      assigned_by
    )
    VALUES (
      created_user_id,
      creator_admin_id,
      normalized_admin_email
    )
    ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
    SET
      assigned_by = EXCLUDED.assigned_by,
      updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION create_registered_normal_user(text, text, text, text, text, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_registered_normal_user(text, text, text, text, text, numeric, text, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text);

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
  updated_at timestamptz,
  admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE app_users
  SET
    email = lower(trim(user_email)),
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
    AND app_users.deleted_at IS NULL
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
    app_users.updated_at,
    get_normal_user_admin_assignments(app_users.id);
END;
$$;

REVOKE ALL ON FUNCTION update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS update_normal_user_approval_status(text, uuid, text);

CREATE OR REPLACE FUNCTION update_normal_user_approval_status(
  super_admin_email text,
  target_user_id uuid,
  next_approval_status text
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
  updated_at timestamptz,
  admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF next_approval_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported approval status';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(super_admin_email))
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only super admin can approve normal users';
  END IF;

  RETURN QUERY
  UPDATE app_users
  SET
    approval_status = next_approval_status,
    updated_at = now()
  WHERE app_users.id = target_user_id
    AND app_users.role = 'normal'
    AND app_users.approval_status = 'to_be_approved'
    AND app_users.deleted_at IS NULL
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
    app_users.updated_at,
    get_normal_user_admin_assignments(app_users.id);
END;
$$;

REVOKE ALL ON FUNCTION update_normal_user_approval_status(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_normal_user_approval_status(text, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_normal_user_admin_assignments(
  super_admin_email text,
  target_user_id uuid,
  admin_user_ids uuid[]
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
  updated_at timestamptz,
  admin_assignments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_super_admin_email text := lower(trim(super_admin_email));
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = normalized_super_admin_email
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only super admin can update admin assignments';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE app_users.id = target_user_id
      AND app_users.role = 'normal'
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target normal user was not found';
  END IF;

  DELETE FROM app_user_admin_assignments
  WHERE normal_user_id = target_user_id;

  INSERT INTO app_user_admin_assignments (
    normal_user_id,
    admin_user_id,
    assigned_by
  )
  SELECT
    target_user_id,
    admin_user.id,
    normalized_super_admin_email
  FROM app_users admin_user
  WHERE admin_user.id = ANY(admin_user_ids)
    AND admin_user.role = 'admin'
    AND admin_user.deleted_at IS NULL
  ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
  SET
    assigned_by = normalized_super_admin_email,
    updated_at = now();

  RETURN QUERY
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
    app_users.updated_at,
    get_normal_user_admin_assignments(app_users.id)
  FROM app_users
  WHERE app_users.id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION update_normal_user_admin_assignments(text, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_normal_user_admin_assignments(text, uuid, uuid[]) TO anon, authenticated;
