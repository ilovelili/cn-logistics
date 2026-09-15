/*
  Re-run the reapproval notification backfill using the timestamp of the
  current pending state. Older registration approval deliveries must not hide
  a later reapproval request for the same shipper.
*/

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
