/*
  # App user profile avatars

  Adds editable avatar support for app users. This migration is idempotent so it
  works whether the earlier app_users migration was already applied or not.
*/

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-avatars',
  'app-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anyone can read app avatars'
  ) THEN
    CREATE POLICY "Anyone can read app avatars"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'app-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anon can upload app avatars in demo'
  ) THEN
    CREATE POLICY "Anon can upload app avatars in demo"
      ON storage.objects FOR INSERT
      TO anon
      WITH CHECK (bucket_id = 'app-avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Anon can update app avatars in demo'
  ) THEN
    CREATE POLICY "Anon can update app avatars in demo"
      ON storage.objects FOR UPDATE
      TO anon
      USING (bucket_id = 'app-avatars')
      WITH CHECK (bucket_id = 'app-avatars');
  END IF;
END $$;

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
  RETURNING app_users.email, app_users.role, app_users.avatar_url;
$$;

REVOKE ALL ON FUNCTION update_app_user_avatar(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_app_user_avatar(text, text) TO anon, authenticated;
