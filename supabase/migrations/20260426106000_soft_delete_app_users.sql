/*
  # Soft delete app users

  Ensures user deletion keeps database history by marking rows inactive instead
  of removing them.
*/

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE OR REPLACE FUNCTION delete_normal_user(
  super_admin_email text,
  target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(super_admin_email))
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only super admin can delete normal users';
  END IF;

  UPDATE app_users
  SET
    is_active = false,
    deleted_at = now(),
    deleted_by = lower(trim(super_admin_email)),
    updated_at = now()
  WHERE app_users.id = target_user_id
    AND app_users.role = 'normal'
    AND app_users.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION delete_normal_user(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_normal_user(text, uuid) TO anon, authenticated;

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
    AND app_users.deleted_at IS NULL
    AND (
      app_users.created_by = admin_email
      OR EXISTS (
        SELECT 1
        FROM app_users requester
        WHERE lower(requester.email) = lower(trim(admin_email))
          AND requester.role = 'super_admin'
          AND requester.is_active = true
          AND requester.deleted_at IS NULL
      )
    )
  ORDER BY app_users.created_at DESC;
$$;

REVOKE ALL ON FUNCTION list_registered_normal_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_registered_normal_users(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_admin_operators(super_admin_email text)
RETURNS TABLE(
  id uuid,
  email text,
  user_name text,
  is_active boolean,
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
    app_users.is_active,
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
  updated_at timestamptz
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
    app_users.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION update_normal_user_approval_status(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_normal_user_approval_status(text, uuid, text) TO anon, authenticated;

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
RETURNS TABLE(email text, role text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_users.email, app_users.role, app_users.avatar_url
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(profile_email))
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_app_user_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_app_user_profile(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_app_user_avatar(profile_email text, profile_avatar_url text)
RETURNS TABLE(email text, role text, avatar_url text)
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
  RETURNING app_users.email, app_users.role, app_users.avatar_url;
$$;

REVOKE ALL ON FUNCTION update_app_user_avatar(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_app_user_avatar(text, text) TO anon, authenticated;

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
  WHERE app_users.deleted_at IS NOT NULL;
END;
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
    app_users.updated_at;
$$;

REVOKE ALL ON FUNCTION update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_pending_registered_normal_user(uuid, text, text, text, text, text, numeric, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION create_admin_operator(
  operator_email text,
  operator_name text,
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
BEGIN
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
    approval_status,
    created_by,
    is_active,
    deleted_at,
    deleted_by
  )
  VALUES (
    normalized_operator_email,
    'admin',
    operator_password,
    NULLIF(trim(operator_name), ''),
    'approved',
    normalized_super_admin_email,
    true,
    NULL,
    NULL
  )
  ON CONFLICT (email) DO UPDATE
  SET
    role = 'admin',
    temporary_password = operator_password,
    user_name = EXCLUDED.user_name,
    approval_status = 'approved',
    created_by = normalized_super_admin_email,
    is_active = true,
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = now()
  WHERE app_users.deleted_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION create_admin_operator(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_admin_operator(text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION submit_shipment_feedback(
  feedback_shipment_job_id uuid,
  feedback_submitter_email text,
  feedback_rating integer,
  feedback_reason text
)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  submitter_email text,
  admin_operator_email text,
  rating integer,
  reason text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_submitter_email text := lower(trim(feedback_submitter_email));
  operator_email text;
BEGIN
  IF feedback_rating < 1 OR feedback_rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;

  SELECT app_users.created_by
  INTO operator_email
  FROM app_users
  WHERE lower(app_users.email) = normalized_submitter_email
    AND app_users.role = 'normal'
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF operator_email IS NULL THEN
    RAISE EXCEPTION 'Only active normal users can submit shipment feedback';
  END IF;

  RETURN QUERY
  INSERT INTO shipment_feedback (
    shipment_job_id,
    submitter_email,
    admin_operator_email,
    rating,
    reason
  )
  VALUES (
    feedback_shipment_job_id,
    normalized_submitter_email,
    operator_email,
    feedback_rating,
    NULLIF(trim(feedback_reason), '')
  )
  RETURNING
    shipment_feedback.id,
    shipment_feedback.shipment_job_id,
    shipment_feedback.submitter_email,
    shipment_feedback.admin_operator_email,
    shipment_feedback.rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION submit_shipment_feedback(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_shipment_feedback(uuid, text, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_all_shipment_feedback(super_admin_email text)
RETURNS TABLE(
  id uuid,
  shipment_job_id uuid,
  shipment_invoice_number text,
  submitter_email text,
  admin_operator_email text,
  rating integer,
  reason text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    shipment_feedback.id,
    shipment_feedback.shipment_job_id,
    shipment_jobs.invoice_number,
    shipment_feedback.submitter_email,
    shipment_feedback.admin_operator_email,
    shipment_feedback.rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at
  FROM shipment_feedback
  LEFT JOIN shipment_jobs ON shipment_jobs.id = shipment_feedback.shipment_job_id
  WHERE EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(super_admin_email))
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  )
  ORDER BY shipment_feedback.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION list_all_shipment_feedback(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_all_shipment_feedback(text) TO anon, authenticated;
