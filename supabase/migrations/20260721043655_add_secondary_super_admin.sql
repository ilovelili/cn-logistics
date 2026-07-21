/*
  # Add a secondary super-admin identity

  Keeps the Auth0-backed server-side role derivation aligned with the explicit
  two-address super-admin allowlist.
*/

UPDATE public.app_users
SET
  role = CASE
    WHEN lower(trim(email)) LIKE '%@cnlogistics.co.jp' THEN 'admin'
    ELSE 'normal'
  END,
  updated_at = now()
WHERE role = 'super_admin'
  AND lower(trim(email)) NOT IN (
    'super_admin@cnlogistics.co.jp',
    'route666@live.cn'
  );

UPDATE public.app_users
SET
  role = 'super_admin',
  temporary_password = '',
  approval_status = 'approved',
  is_active = true,
  deleted_at = NULL,
  updated_at = now()
WHERE lower(trim(email)) IN (
  'super_admin@cnlogistics.co.jp',
  'route666@live.cn'
);

CREATE OR REPLACE FUNCTION public.sync_auth0_app_user()
RETURNS TABLE(
  email text,
  role text,
  avatar_url text,
  shipper_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  authenticated_email text := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  authenticated_email_verified boolean := COALESCE(
    (auth.jwt() ->> 'email_verified')::boolean,
    false
  );
  derived_role text;
BEGIN
  IF authenticated_email = '' OR NOT authenticated_email_verified THEN
    RAISE EXCEPTION 'A verified Auth0 email address is required'
      USING ERRCODE = '42501';
  END IF;

  derived_role := CASE
    WHEN authenticated_email IN (
      'super_admin@cnlogistics.co.jp',
      'route666@live.cn'
    ) THEN 'super_admin'
    WHEN authenticated_email LIKE '%@cnlogistics.co.jp' THEN 'admin'
    ELSE 'normal'
  END;

  UPDATE public.app_users AS existing_user
  SET
    email = authenticated_email,
    role = derived_role,
    temporary_password = '',
    approval_status = CASE
      WHEN derived_role IN ('admin', 'super_admin') THEN 'approved'
      ELSE existing_user.approval_status
    END,
    is_active = true,
    deleted_at = NULL,
    updated_at = now()
  WHERE lower(trim(existing_user.email)) = authenticated_email;

  IF NOT FOUND THEN
    INSERT INTO public.app_users (
      email,
      role,
      temporary_password,
      user_name,
      shipper_name,
      approval_status,
      is_active
    )
    VALUES (
      authenticated_email,
      derived_role,
      '',
      authenticated_email,
      CASE WHEN derived_role = 'normal' THEN authenticated_email ELSE NULL END,
      'approved',
      true
    );
  END IF;

  RETURN QUERY
  SELECT
    app_user.email,
    app_user.role,
    app_user.avatar_url,
    app_user.shipper_name
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = authenticated_email
    AND app_user.is_active = true
    AND app_user.deleted_at IS NULL
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth0_app_user()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_auth0_app_user()
  TO authenticated;

NOTIFY pgrst, 'reload schema';
