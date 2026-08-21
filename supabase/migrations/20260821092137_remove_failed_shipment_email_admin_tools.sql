/*
 * Remove the super-admin failed-delivery inspection and manual-retry API.
 *
 * Failed deliveries remain stored in the queue and automatic retries continue.
 * Only the removed admin UI's now-unused RPC surface is retired here.
 */
DROP FUNCTION IF EXISTS public.retry_failed_shipment_email_for_super_admin(uuid);
DROP FUNCTION IF EXISTS public.list_failed_shipment_emails_for_super_admin();

NOTIFY pgrst, 'reload schema';
