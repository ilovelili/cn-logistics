/*
  # Reconcile production schema drift

  Production accumulated two unused columns, a retired feedback overload, and
  implicit table grants outside migration history. Remove the unused objects,
  keep client roles on the hardened RPC boundary, and record trusted backend
  access explicitly so clean rebuilds and production converge.
*/

ALTER TABLE public.shipment_jobs
  DROP COLUMN IF EXISTS contact_person;

ALTER TABLE public.app_user_admin_assignments
  DROP COLUMN IF EXISTS assignment_status;

DROP FUNCTION IF EXISTS public.submit_shipment_feedback(
  uuid,
  text,
  integer,
  text
);

REVOKE ALL ON TABLE
  public.app_users,
  public.app_user_admin_assignments,
  public.shipment_feedback
FROM anon, authenticated;

REVOKE DELETE ON TABLE public.shipment_tracking_event_templates
  FROM authenticated;

GRANT ALL ON TABLE
  public.app_feedback,
  public.app_user_admin_assignments,
  public.app_users,
  public.carriers,
  public.company_users,
  public.customs_declarations,
  public.email_templates,
  public.orders,
  public.parcel_documents,
  public.parcels,
  public.shipment_feedback,
  public.shipment_notification_email_deliveries,
  public.shipment_notifications,
  public.shipment_tracking_event_templates,
  public.shipments,
  public.tracking_events,
  public.warehouses
TO service_role;

NOTIFY pgrst, 'reload schema';
