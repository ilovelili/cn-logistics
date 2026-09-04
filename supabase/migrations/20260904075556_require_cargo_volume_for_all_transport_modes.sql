/*
  Require the customer-facing PKG, gross weight and M3 values for every
  transport mode. FCL additionally retains and validates booking/container
  details; Air and LCL do not store container details.
*/

CREATE OR REPLACE FUNCTION public.set_shipment_booking_details(
  requester_email text,
  target_job_id uuid,
  new_booking_details jsonb,
  new_cargo_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text;
  target_transport_mode text;
  booking_item jsonb;
  container_item jsonb;
  package_count numeric;
  gross_weight numeric;
  volume numeric;
BEGIN
  SELECT app_users.id, app_users.email, app_users.role
  INTO requester_record
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active
    AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;

  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot save cargo details'
      USING ERRCODE = '42501';
  END IF;

  SELECT shipper_name, transport_mode
  INTO target_shipper_name, target_transport_mode
  FROM public.shipment_jobs
  WHERE id = target_job_id
    AND deleted_at IS NULL;

  IF target_shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id,
      requester_record.email,
      requester_record.role,
      target_shipper_name
    ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipment'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(new_booking_details, '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(new_cargo_details, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Cargo details have an invalid shape'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    package_count := (new_cargo_details->>'package_count')::numeric;
    gross_weight := (new_cargo_details->>'gross_weight_kg')::numeric;
    volume := (new_cargo_details->>'volume_m3')::numeric;
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Cargo volume values must be numeric'
        USING ERRCODE = '22023';
  END;

  IF package_count IS NULL
    OR package_count <= 0
    OR package_count <> trunc(package_count)
    OR gross_weight IS NULL
    OR gross_weight <= 0
    OR volume IS NULL
    OR volume <= 0 THEN
    RAISE EXCEPTION 'Every transport mode requires positive PKG, Kgs and M3 values'
      USING ERRCODE = '22023';
  END IF;

  IF target_transport_mode = 'fcl' THEN
    IF jsonb_array_length(COALESCE(new_booking_details, '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'FCL requires at least one booking'
        USING ERRCODE = '22023';
    END IF;

    FOR booking_item IN
      SELECT value FROM jsonb_array_elements(new_booking_details)
    LOOP
      IF NULLIF(trim(booking_item->>'booking_number'), '') IS NULL
        OR jsonb_typeof(booking_item->'containers') <> 'array'
        OR jsonb_array_length(booking_item->'containers') = 0 THEN
        RAISE EXCEPTION 'Each FCL booking requires a number and containers'
          USING ERRCODE = '22023';
      END IF;

      FOR container_item IN
        SELECT value FROM jsonb_array_elements(booking_item->'containers')
      LOOP
        IF container_item->>'length' NOT IN ('20', '40')
          OR container_item->>'type' NOT IN ('Dry', 'HQ', 'RF', 'FR', 'OT')
          OR COALESCE(container_item->>'quantity', '') !~ '^[1-9][0-9]*$' THEN
          RAISE EXCEPTION 'Invalid FCL container length, type or quantity'
            USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END LOOP;
  ELSE
    new_booking_details := '[]'::jsonb;
  END IF;

  UPDATE public.shipment_jobs
  SET
    booking_details = COALESCE(new_booking_details, '[]'::jsonb),
    cargo_details = new_cargo_details
  WHERE id = target_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_shipment_booking_details(text, uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_shipment_booking_details(text, uuid, jsonb, jsonb)
  TO authenticated, service_role;
