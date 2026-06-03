/*
  # Admin operator multi staff roles

  Allows one admin operator to belong to multiple staff role buckets while
  keeping app_users.staff_role as the primary role for older reads/sorts.
*/

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS staff_roles text[] NOT NULL DEFAULT ARRAY['other']::text[];

ALTER TABLE app_users
  DROP CONSTRAINT IF EXISTS app_users_staff_roles_check;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_staff_roles_check
  CHECK (
    staff_roles <@ ARRAY['sales', 'customer_service', 'operations', 'other']::text[]
    AND cardinality(staff_roles) > 0
  );

UPDATE app_users
SET staff_roles = ARRAY[COALESCE(staff_role, 'other')]::text[]
WHERE role = 'admin'
  AND (
    staff_roles IS NULL
    OR cardinality(staff_roles) = 0
    OR staff_roles = ARRAY['other']::text[]
  );

CREATE OR REPLACE FUNCTION normalize_admin_operator_staff_roles(operator_staff_roles text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT array_agg(normalized_role ORDER BY first_position)
      FROM (
        SELECT
          normalized_role,
          min(position) AS first_position
        FROM (
          SELECT
            NULLIF(trim(role_value), '') AS normalized_role,
            position
          FROM unnest(COALESCE(operator_staff_roles, ARRAY[]::text[]))
            WITH ORDINALITY AS selected_roles(role_value, position)
        ) trimmed_roles
        WHERE normalized_role IN ('sales', 'customer_service', 'operations', 'other')
        GROUP BY normalized_role
      ) valid_roles
    ),
    ARRAY['other']::text[]
  );
$$;

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
        'staff_role', COALESCE(admin_user.staff_role, 'other'),
        'staff_roles', COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]),
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

DROP FUNCTION IF EXISTS create_admin_operator(text, text, text, text, text);
DROP FUNCTION IF EXISTS create_admin_operator(text, text, text[], text, text);

CREATE OR REPLACE FUNCTION create_admin_operator(
  operator_email text,
  operator_name text,
  operator_staff_roles text[],
  operator_password text,
  super_admin_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_operator_email text := lower(trim(operator_email));
  normalized_super_admin_email text := lower(trim(super_admin_email));
  normalized_staff_roles text[] := normalize_admin_operator_staff_roles(operator_staff_roles);
  primary_staff_role text := normalized_staff_roles[1];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(operator_staff_roles, ARRAY[]::text[])) AS selected_roles(role_value)
    WHERE NULLIF(trim(role_value), '') IS NOT NULL
      AND NULLIF(trim(role_value), '') NOT IN ('sales', 'customer_service', 'operations', 'other')
  ) THEN
    RAISE EXCEPTION 'Invalid admin operator staff roles';
  END IF;

  IF cardinality(normalized_staff_roles) = 0 THEN
    RAISE EXCEPTION 'Invalid admin operator staff roles';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = normalized_super_admin_email
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only super admin can create admin operators';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = normalized_operator_email
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Admin operator email already exists';
  END IF;

  INSERT INTO app_users (
    email,
    role,
    temporary_password,
    user_name,
    staff_role,
    staff_roles,
    approval_status,
    created_by,
    deleted_at,
    deleted_by
  )
  VALUES (
    normalized_operator_email,
    'admin',
    operator_password,
    NULLIF(trim(operator_name), ''),
    primary_staff_role,
    normalized_staff_roles,
    'approved',
    normalized_super_admin_email,
    NULL,
    NULL
  )
  ON CONFLICT (email) DO UPDATE
  SET
    role = 'admin',
    temporary_password = operator_password,
    user_name = EXCLUDED.user_name,
    staff_role = primary_staff_role,
    staff_roles = normalized_staff_roles,
    approval_status = 'approved',
    created_by = normalized_super_admin_email,
    is_active = true,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = now()
  WHERE app_users.deleted_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION create_admin_operator(text, text, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_admin_operator(text, text, text[], text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS update_admin_operator(text, uuid, text, text);
DROP FUNCTION IF EXISTS update_admin_operator(text, uuid, text, text[]);

CREATE OR REPLACE FUNCTION update_admin_operator(
  super_admin_email text,
  target_operator_id uuid,
  operator_name text,
  operator_staff_roles text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_super_admin_email text := lower(trim(super_admin_email));
  normalized_staff_roles text[] := normalize_admin_operator_staff_roles(operator_staff_roles);
  primary_staff_role text := normalized_staff_roles[1];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(operator_staff_roles, ARRAY[]::text[])) AS selected_roles(role_value)
    WHERE NULLIF(trim(role_value), '') IS NOT NULL
      AND NULLIF(trim(role_value), '') NOT IN ('sales', 'customer_service', 'operations', 'other')
  ) THEN
    RAISE EXCEPTION 'Invalid admin operator staff roles';
  END IF;

  IF cardinality(normalized_staff_roles) = 0 THEN
    RAISE EXCEPTION 'Invalid admin operator staff roles';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = normalized_super_admin_email
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only super admin can update admin operators';
  END IF;

  UPDATE app_users
  SET
    user_name = NULLIF(trim(operator_name), ''),
    staff_role = primary_staff_role,
    staff_roles = normalized_staff_roles,
    updated_at = now()
  WHERE app_users.id = target_operator_id
    AND app_users.role = 'admin'
    AND app_users.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin operator was not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION update_admin_operator(text, uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_admin_operator(text, uuid, text, text[]) TO anon, authenticated;

DROP FUNCTION IF EXISTS list_admin_operators(text);

CREATE OR REPLACE FUNCTION list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  staff_role text,
  staff_roles text[],
  assigned_shipper_users jsonb,
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
    app_users.user_name,
    COALESCE(app_users.staff_role, 'other') AS staff_role,
    COALESCE(app_users.staff_roles, ARRAY[COALESCE(app_users.staff_role, 'other')]::text[]) AS staff_roles,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', normal_user.id,
            'email', normal_user.email,
            'shipper_name', normal_user.shipper_name,
            'zipcode', normal_user.zipcode,
            'shipper_address', normal_user.shipper_address,
            'telephone', normal_user.telephone,
            'budget', normal_user.budget,
            'contact_person', normal_user.contact_person,
            'notes', normal_user.notes,
            'approval_status', normal_user.approval_status,
            'admin_assignments', get_normal_user_admin_assignments(normal_user.id),
            'created_at', normal_user.created_at,
            'updated_at', normal_user.updated_at
          )
          ORDER BY normal_user.shipper_name, normal_user.email
        )
        FROM app_user_admin_assignments assignment
        JOIN app_users normal_user
          ON normal_user.id = assignment.normal_user_id
        WHERE assignment.admin_user_id = app_users.id
          AND normal_user.role = 'normal'
          AND normal_user.deleted_at IS NULL
      ),
      '[]'::jsonb
    ) AS assigned_shipper_users,
    app_users.created_at,
    app_users.updated_at
  FROM app_users
  WHERE app_users.role = 'admin'
    AND app_users.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM app_users requester
      WHERE lower(requester.email) = lower(trim(super_admin_email))
        AND requester.role = 'super_admin'
        AND requester.is_active = true
        AND requester.deleted_at IS NULL
    )
  ORDER BY app_users.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_admin_operators(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_admin_operators(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
