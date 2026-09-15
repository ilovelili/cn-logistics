/*
  New shipper registrations already notify super admins, but returning an
  approved shipper to pending approval did not. Queue one approval email per
  changed shipper group and backfill pending groups that have not queued one
  since entering their current pending state.
*/

UPDATE public.email_templates
SET
  subject_template = replace(
    subject_template,
    '荷主登録の承認依頼',
    '荷主情報の承認依頼'
  ),
  text_template = replace(
    replace(
      text_template,
      'CN Navigatorで新しい荷主が登録されました。',
      'CN Navigatorで荷主情報が登録または更新され、承認待ちになりました。'
    ),
    '登録者：',
    '登録・更新者：'
  ),
  html_template = replace(
    replace(
      html_template,
      'CN Navigatorで新しい荷主が登録されました。',
      'CN Navigatorで荷主情報が登録または更新され、承認待ちになりました。'
    ),
    '登録者',
    '登録・更新者'
  ),
  updated_at = now()
WHERE template_key = 'shipper_registration_approval_admin';

CREATE OR REPLACE FUNCTION public.queue_shipper_reapproval_emails_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed_shipper record;
  requester_email text;
BEGIN
  IF NULLIF(auth.jwt() ->> 'email', '') IS NULL THEN
    RETURN NULL;
  END IF;

  requester_email := public.current_app_user_email();

  FOR changed_shipper IN
    SELECT DISTINCT
      new_user.shipper_name,
      COALESCE(new_user.created_by, '') AS created_by
    FROM new_rows AS new_user
    INNER JOIN old_rows AS old_user ON old_user.id = new_user.id
    WHERE new_user.role = 'normal'
      AND old_user.approval_status = 'approved'
      AND new_user.approval_status = 'to_be_approved'
      AND NULLIF(trim(new_user.shipper_name), '') IS NOT NULL
  LOOP
    PERFORM public.queue_shipper_registration_approval_emails(
      changed_shipper.shipper_name,
      requester_email
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_shipper_reapproval_emails_after_update()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_shipper_reapproval_emails
  ON public.app_users;

CREATE TRIGGER queue_shipper_reapproval_emails
AFTER UPDATE ON public.app_users
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.queue_shipper_reapproval_emails_after_update();

DO $$
DECLARE
  pending_shipper record;
BEGIN
  FOR pending_shipper IN
    SELECT
      pending.shipper_name,
      pending.registered_by_email
    FROM (
      SELECT
        shipper_name,
        min(created_by) AS registered_by_email,
        max(updated_at) AS pending_since
      FROM public.app_users
      WHERE role = 'normal'
        AND approval_status = 'to_be_approved'
        AND is_active
        AND deleted_at IS NULL
        AND NULLIF(trim(shipper_name), '') IS NOT NULL
        AND NULLIF(trim(created_by), '') IS NOT NULL
      GROUP BY shipper_name
    ) AS pending
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.shipper_registration_approval_email_deliveries AS delivery
      WHERE lower(trim(delivery.customer_name)) = lower(trim(pending.shipper_name))
        AND delivery.created_at >= pending.pending_since
    )
  LOOP
    PERFORM public.queue_shipper_registration_approval_emails(
      pending_shipper.shipper_name,
      pending_shipper.registered_by_email
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
