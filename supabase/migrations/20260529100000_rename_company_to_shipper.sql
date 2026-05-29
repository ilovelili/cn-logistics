/*
  # Rename company terminology to shipper

  Keeps existing data by moving the old company fields into the canonical
  shipper fields used by normal users and shipment jobs.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_users'
      AND column_name = 'company_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_users'
      AND column_name = 'shipper_name'
  ) THEN
    ALTER TABLE app_users RENAME COLUMN company_name TO shipper_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_users'
      AND column_name = 'shipper_account_name'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'app_users'
        AND column_name = 'shipper_name'
    ) THEN
      UPDATE app_users
      SET shipper_name = COALESCE(NULLIF(trim(shipper_name), ''), shipper_account_name)
      WHERE shipper_account_name IS NOT NULL;

      ALTER TABLE app_users DROP COLUMN shipper_account_name;
    ELSE
      ALTER TABLE app_users RENAME COLUMN shipper_account_name TO shipper_name;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_users'
      AND column_name = 'company_address'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'app_users'
      AND column_name = 'shipper_address'
  ) THEN
    ALTER TABLE app_users RENAME COLUMN company_address TO shipper_address;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shipment_jobs'
      AND column_name = 'company_name'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'shipment_jobs'
        AND column_name = 'shipper_name'
    ) THEN
      UPDATE shipment_jobs
      SET shipper_name = COALESCE(NULLIF(trim(shipper_name), ''), company_name)
      WHERE company_name IS NOT NULL;

      ALTER TABLE shipment_jobs DROP COLUMN company_name;
    ELSE
      ALTER TABLE shipment_jobs RENAME COLUMN company_name TO shipper_name;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shipment_jobs'
      AND column_name = 'shipper_account_name'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'shipment_jobs'
        AND column_name = 'shipper_name'
    ) THEN
      UPDATE shipment_jobs
      SET shipper_name = COALESCE(NULLIF(trim(shipper_name), ''), shipper_account_name)
      WHERE shipper_account_name IS NOT NULL;

      ALTER TABLE shipment_jobs DROP COLUMN shipper_account_name;
    ELSE
      ALTER TABLE shipment_jobs RENAME COLUMN shipper_account_name TO shipper_name;
    END IF;
  END IF;
END;
$$;

DROP INDEX IF EXISTS idx_shipment_jobs_company_name;
DROP INDEX IF EXISTS idx_shipment_jobs_shipper_account_name;
CREATE INDEX IF NOT EXISTS idx_shipment_jobs_shipper_name
  ON shipment_jobs(shipper_name);

DROP FUNCTION IF EXISTS verify_app_login(text, text);
DROP FUNCTION IF EXISTS get_app_user_profile(text);
DROP FUNCTION IF EXISTS update_app_user_avatar(text, text);
DROP FUNCTION IF EXISTS list_registered_normal_users(text);
DROP FUNCTION IF EXISTS update_normal_user_approval_status(text, uuid, text);
DROP FUNCTION IF EXISTS update_normal_user_admin_assignments(text, uuid, uuid[]);
DROP FUNCTION IF EXISTS update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text);
DROP FUNCTION IF EXISTS create_registered_normal_user(text, text, text, text, text, numeric, text, text, text);
DROP FUNCTION IF EXISTS list_admin_operators(text);
DROP FUNCTION IF EXISTS list_accessible_shipment_jobs(text);
DROP FUNCTION IF EXISTS list_accessible_shipment_documents(text);
DROP FUNCTION IF EXISTS request_accessible_shipment_document_download(text, uuid);
DROP FUNCTION IF EXISTS update_accessible_shipment_document_approval(text, uuid, text);
DROP FUNCTION IF EXISTS soft_delete_accessible_shipment_document(text, uuid);
DROP FUNCTION IF EXISTS can_requester_access_shipment_company(uuid, text, text, text);
DROP FUNCTION IF EXISTS can_requester_access_shipment_shipper(uuid, text, text, text);

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

CREATE OR REPLACE FUNCTION verify_app_login(login_email text, login_password text)
RETURNS TABLE(role text, email text, avatar_url text, shipper_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_users.role,
    app_users.email,
    app_users.avatar_url,
    app_users.shipper_name
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(login_email))
    AND app_users.temporary_password = login_password
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
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

CREATE OR REPLACE FUNCTION get_app_user_profile(profile_email text)
RETURNS TABLE(email text, role text, avatar_url text, shipper_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_users.email,
    app_users.role,
    app_users.avatar_url,
    app_users.shipper_name
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(profile_email))
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_app_user_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_app_user_profile(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_app_user_avatar(profile_email text, profile_avatar_url text)
RETURNS TABLE(email text, role text, avatar_url text, shipper_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE app_users
  SET
    avatar_url = profile_avatar_url,
    updated_at = now()
  WHERE lower(app_users.email) = lower(trim(profile_email))
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  RETURNING
    app_users.email,
    app_users.role,
    app_users.avatar_url,
    app_users.shipper_name;
$$;

REVOKE ALL ON FUNCTION update_app_user_avatar(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_app_user_avatar(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_registered_normal_users(admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  shipper_name text,
  zipcode text,
  shipper_address text,
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
    app_users.shipper_name,
    app_users.zipcode,
    app_users.shipper_address,
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
  user_shipper_name text,
  user_zipcode text,
  user_shipper_address text,
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
    shipper_name,
    zipcode,
    shipper_address,
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
    trim(user_shipper_name),
    trim(user_shipper_name),
    trim(user_zipcode),
    trim(user_shipper_address),
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
    shipper_name = EXCLUDED.shipper_name,
    zipcode = EXCLUDED.zipcode,
    shipper_address = EXCLUDED.shipper_address,
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
  WHERE app_users.deleted_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION create_registered_normal_user(text, text, text, text, text, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_registered_normal_user(text, text, text, text, text, numeric, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_pending_registered_normal_user(
  user_id uuid,
  user_email text,
  user_shipper_name text,
  user_zipcode text,
  user_shipper_address text,
  user_telephone text,
  user_budget numeric,
  user_contact_person text,
  user_notes text
)
RETURNS TABLE(
  id uuid,
  email text,
  shipper_name text,
  zipcode text,
  shipper_address text,
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
  UPDATE app_users
  SET
    email = lower(trim(user_email)),
    user_name = trim(user_shipper_name),
    shipper_name = trim(user_shipper_name),
    zipcode = trim(user_zipcode),
    shipper_address = trim(user_shipper_address),
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
    app_users.shipper_name,
    app_users.zipcode,
    app_users.shipper_address,
    app_users.telephone,
    app_users.budget,
    app_users.contact_person,
    app_users.notes,
    app_users.approval_status,
    app_users.created_by,
    app_users.created_at,
    app_users.updated_at,
    get_normal_user_admin_assignments(app_users.id);
$$;

REVOKE ALL ON FUNCTION update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_normal_user_approval_status(
  super_admin_email text,
  target_user_id uuid,
  next_approval_status text
)
RETURNS TABLE(
  id uuid,
  email text,
  shipper_name text,
  zipcode text,
  shipper_address text,
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
    app_users.shipper_name,
    app_users.zipcode,
    app_users.shipper_address,
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
  shipper_name text,
  zipcode text,
  shipper_address text,
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
    app_users.shipper_name,
    app_users.zipcode,
    app_users.shipper_address,
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

CREATE OR REPLACE FUNCTION list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  staff_role text,
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

CREATE OR REPLACE FUNCTION can_requester_access_shipment_shipper(
  requester_id uuid,
  requester_email text,
  requester_role text,
  target_shipper_name text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    requester_role = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM app_users normal_user
      WHERE normal_user.role = 'normal'
        AND normal_user.deleted_at IS NULL
        AND lower(trim(normal_user.shipper_name)) = lower(trim(target_shipper_name))
        AND (
          (
            requester_role = 'normal'
            AND lower(normal_user.email) = lower(requester_email)
          )
          OR (
            requester_role = 'admin'
            AND (
              lower(coalesce(normal_user.created_by, '')) = lower(requester_email)
              OR EXISTS (
                SELECT 1
                FROM app_user_admin_assignments assignment
                WHERE assignment.normal_user_id = normal_user.id
                  AND assignment.admin_user_id = requester_id
              )
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION can_requester_access_shipment_shipper(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_requester_access_shipment_shipper(uuid, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_accessible_shipment_jobs(requester_email text)
RETURNS TABLE(
  id uuid,
  shipper_name text,
  status text,
  under_process_from_date date,
  under_process_to_date date,
  customs_hold_from_date date,
  customs_hold_to_date date,
  completed_from_date date,
  completed_to_date date,
  trade_mode text,
  trade_term text,
  invoice_number text,
  transport_mode text,
  consignee_name text,
  pol_aol text,
  pod_aod text,
  vessel_flight_numbers text[],
  mbl_mawb text,
  hbl_hawb text,
  bl_awb_date date,
  assigned_admin_user_ids uuid[],
  documents text[],
  internal_documents text[],
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    shipment_jobs.id,
    shipment_jobs.shipper_name,
    shipment_jobs.status,
    shipment_jobs.under_process_from_date,
    shipment_jobs.under_process_to_date,
    shipment_jobs.customs_hold_from_date,
    shipment_jobs.customs_hold_to_date,
    shipment_jobs.completed_from_date,
    shipment_jobs.completed_to_date,
    shipment_jobs.trade_mode,
    shipment_jobs.trade_term,
    shipment_jobs.invoice_number,
    shipment_jobs.transport_mode,
    shipment_jobs.consignee_name,
    shipment_jobs.pol_aol,
    shipment_jobs.pod_aod,
    shipment_jobs.vessel_flight_numbers,
    shipment_jobs.mbl_mawb,
    shipment_jobs.hbl_hawb,
    shipment_jobs.bl_awb_date,
    shipment_jobs.assigned_admin_user_ids,
    shipment_jobs.documents,
    shipment_jobs.internal_documents,
    shipment_jobs.notes,
    shipment_jobs.created_at,
    shipment_jobs.updated_at
  FROM shipment_jobs
  CROSS JOIN requester
  WHERE shipment_jobs.shipper_name IS NOT NULL
    AND can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.shipper_name
    )
  ORDER BY GREATEST(
    COALESCE(shipment_jobs.under_process_from_date, DATE '0001-01-01'),
    COALESCE(shipment_jobs.customs_hold_from_date, DATE '0001-01-01'),
    COALESCE(shipment_jobs.completed_from_date, DATE '0001-01-01'),
    shipment_jobs.updated_at::date
  ) DESC;
$$;

REVOKE ALL ON FUNCTION list_accessible_shipment_jobs(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accessible_shipment_jobs(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_accessible_shipment_documents(requester_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  scope text,
  name text,
  storage_path text,
  file_url text,
  approval_status text,
  rejection_reason text,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    shipment_documents.id,
    shipment_documents.shipment_job_id,
    shipment_documents.scope,
    shipment_documents.name,
    CASE
      WHEN requester.role = 'normal'
        AND shipment_documents.scope = 'customer'
        AND shipment_documents.approval_status <> 'approved'
        THEN NULL
      ELSE shipment_documents.storage_path
    END,
    CASE
      WHEN requester.role = 'normal'
        AND shipment_documents.scope = 'customer'
        AND shipment_documents.approval_status <> 'approved'
        THEN NULL
      ELSE shipment_documents.file_url
    END,
    shipment_documents.approval_status,
    shipment_documents.rejection_reason,
    shipment_documents.approved_at,
    shipment_documents.approved_by,
    shipment_documents.created_at,
    shipment_documents.updated_at
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  CROSS JOIN requester
  WHERE shipment_jobs.shipper_name IS NOT NULL
    AND shipment_documents.deleted_at IS NULL
    AND (
      requester.role <> 'normal'
      OR shipment_documents.scope = 'customer'
    )
    AND can_requester_access_shipment_shipper(
      requester.id,
      requester.email,
      requester.role,
      shipment_jobs.shipper_name
    )
  ORDER BY shipment_documents.created_at ASC, shipment_documents.id ASC;
$$;

REVOKE ALL ON FUNCTION list_accessible_shipment_documents(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accessible_shipment_documents(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION request_accessible_shipment_document_download(
  requester_email text,
  target_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('normal', 'admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only active users can request document downloads';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND shipment_documents.approval_status IN ('not_requested', 'rejected')
  LIMIT 1;

  IF target_shipper_name IS NULL THEN
    RAISE EXCEPTION 'Requestable customer document was not found';
  END IF;

  IF NOT can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'User cannot request this shipper document';
  END IF;

  UPDATE shipment_documents
  SET
    approval_status = 'pending',
    approved_at = NULL,
    approved_by = NULL,
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = target_document_id;
END;
$$;

REVOKE ALL ON FUNCTION request_accessible_shipment_document_download(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_accessible_shipment_document_download(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_accessible_shipment_document_approval(
  requester_email text,
  target_document_id uuid,
  next_approval_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
BEGIN
  IF next_approval_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported approval status';
  END IF;

  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only admins can approve document download requests';
  END IF;

  SELECT shipment_jobs.shipper_name
  INTO target_shipper_name
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.scope = 'customer'
    AND shipment_documents.approval_status = 'pending'
  LIMIT 1;

  IF target_shipper_name IS NULL THEN
    RAISE EXCEPTION 'Pending customer document request was not found';
  END IF;

  IF NOT can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'Admin cannot approve this shipper document';
  END IF;

  UPDATE shipment_documents
  SET
    approval_status = next_approval_status,
    approved_at = CASE
      WHEN next_approval_status = 'approved' THEN now()
      ELSE NULL
    END,
    approved_by = CASE
      WHEN next_approval_status = 'approved' THEN requester_record.email
      ELSE NULL
    END,
    rejection_reason = CASE
      WHEN next_approval_status = 'rejected' THEN ''
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = target_document_id;
END;
$$;

REVOKE ALL ON FUNCTION update_accessible_shipment_document_approval(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_accessible_shipment_document_approval(text, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION soft_delete_accessible_shipment_document(
  requester_email text,
  target_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_record record;
  target_record record;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'Only admins can delete shipment documents';
  END IF;

  SELECT
    shipment_documents.id,
    shipment_jobs.shipper_name
  INTO target_record
  FROM shipment_documents
  JOIN shipment_jobs
    ON shipment_jobs.id = shipment_documents.shipment_job_id
  WHERE shipment_documents.id = target_document_id
    AND shipment_documents.deleted_at IS NULL
  LIMIT 1;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'Shipment document was not found';
  END IF;

  IF NOT can_requester_access_shipment_shipper(
    requester_record.id,
    requester_record.email,
    requester_record.role,
    target_record.shipper_name
  ) THEN
    RAISE EXCEPTION 'Admin cannot delete this shipper document';
  END IF;

  UPDATE shipment_documents
  SET
    deleted_at = now(),
    deleted_by = requester_record.email,
    updated_at = now()
  WHERE id = target_document_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment document was not deleted';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION soft_delete_accessible_shipment_document(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_accessible_shipment_document(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
