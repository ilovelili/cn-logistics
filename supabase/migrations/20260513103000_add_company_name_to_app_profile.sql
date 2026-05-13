DROP FUNCTION IF EXISTS verify_app_login(text, text);

CREATE FUNCTION verify_app_login(login_email text, login_password text)
RETURNS TABLE(role text, email text, avatar_url text, company_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_users.role,
    app_users.email,
    app_users.avatar_url,
    app_users.company_name
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

DROP FUNCTION IF EXISTS get_app_user_profile(text);

CREATE FUNCTION get_app_user_profile(profile_email text)
RETURNS TABLE(email text, role text, avatar_url text, company_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    app_users.email,
    app_users.role,
    app_users.avatar_url,
    app_users.company_name
  FROM app_users
  WHERE lower(app_users.email) = lower(trim(profile_email))
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_app_user_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_app_user_profile(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS update_app_user_avatar(text, text);

CREATE FUNCTION update_app_user_avatar(profile_email text, profile_avatar_url text)
RETURNS TABLE(email text, role text, avatar_url text, company_name text)
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
    app_users.company_name;
$$;

REVOKE ALL ON FUNCTION update_app_user_avatar(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_app_user_avatar(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
