/*
  Store the role an operator fulfils on a shipment independently from the
  operator's global staff roles. New shipments created by a regular admin use
  the creator as Ops and snapshot the shipper's Sales assignments.
*/

SET lock_timeout = '5s';

ALTER TABLE public.shipment_jobs
  ADD COLUMN operations_admin_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN sales_admin_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN created_by_admin_user_id uuid REFERENCES public.app_users(id);

CREATE INDEX shipment_jobs_operations_admin_user_ids_idx
  ON public.shipment_jobs USING gin (operations_admin_user_ids);
CREATE INDEX shipment_jobs_sales_admin_user_ids_idx
  ON public.shipment_jobs USING gin (sales_admin_user_ids);

-- Existing Ops assignments are classified from the legacy combined list.
UPDATE public.shipment_jobs AS job
SET operations_admin_user_ids = COALESCE((
  SELECT array_agg(DISTINCT operator.id ORDER BY operator.id)
  FROM unnest(COALESCE(job.assigned_admin_user_ids, ARRAY[]::uuid[])) AS selected(id)
  JOIN public.app_users AS operator ON operator.id = selected.id
  WHERE operator.role = 'admin'
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
    AND 'operations' = ANY(COALESCE(
      operator.staff_roles,
      ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
    ))
), ARRAY[]::uuid[]);

-- Existing Sales assignments are rebuilt from each shipper's current Sales links.
UPDATE public.shipment_jobs AS job
SET sales_admin_user_ids = COALESCE((
  SELECT array_agg(DISTINCT operator.id ORDER BY operator.id)
  FROM public.app_users AS shipper_user
  JOIN public.app_user_admin_assignments AS assignment
    ON assignment.normal_user_id = shipper_user.id
  JOIN public.app_users AS operator ON operator.id = assignment.admin_user_id
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND lower(trim(shipper_user.shipper_name)) = lower(trim(job.shipper_name))
    AND operator.role = 'admin'
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
    AND 'sales' = ANY(COALESCE(
      operator.staff_roles,
      ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
    ))
), ARRAY[]::uuid[]);

UPDATE public.shipment_jobs AS job
SET assigned_admin_user_ids = ARRAY(
  SELECT DISTINCT selected_id
  FROM unnest(
    COALESCE(job.operations_admin_user_ids, ARRAY[]::uuid[])
    || COALESCE(job.sales_admin_user_ids, ARRAY[]::uuid[])
  ) AS selected(selected_id)
  ORDER BY selected_id
);

-- Shipper master data now carries Sales assignments only. A dual-role operator
-- remains linked because they are still a valid Sales assignee.
DELETE FROM public.app_user_admin_assignments AS assignment
USING public.app_users AS operator
WHERE operator.id = assignment.admin_user_id
  AND operator.role = 'admin'
  AND NOT ('sales' = ANY(COALESCE(
    operator.staff_roles,
    ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
  )));

-- Pending shipper change requests created before this migration may still
-- contain Ops IDs. Normalize both snapshots before enforcing Sales-only links.
UPDATE public.shipper_change_requests AS request
SET current_snapshot = jsonb_set(
      request.current_snapshot,
      '{admin_user_ids}',
      COALESCE((
        SELECT jsonb_agg(selected.id_text)
        FROM jsonb_array_elements_text(
          COALESCE(request.current_snapshot->'admin_user_ids', '[]'::jsonb)
        ) AS selected(id_text)
        JOIN public.app_users AS operator ON operator.id = selected.id_text::uuid
        WHERE 'sales' = ANY(COALESCE(
          operator.staff_roles,
          ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
        ))
      ), '[]'::jsonb),
      true
    ),
    proposed_snapshot = jsonb_set(
      request.proposed_snapshot,
      '{admin_user_ids}',
      COALESCE((
        SELECT jsonb_agg(selected.id_text)
        FROM jsonb_array_elements_text(
          COALESCE(request.proposed_snapshot->'admin_user_ids', '[]'::jsonb)
        ) AS selected(id_text)
        JOIN public.app_users AS operator ON operator.id = selected.id_text::uuid
        WHERE 'sales' = ANY(COALESCE(
          operator.staff_roles,
          ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
        ))
      ), '[]'::jsonb),
      true
    )
WHERE request.status = 'pending';

CREATE FUNCTION public.enforce_sales_only_shipper_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users AS operator
    WHERE operator.id = NEW.admin_user_id
      AND operator.role = 'admin'
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
      AND 'sales' = ANY(COALESCE(
        operator.staff_roles,
        ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
      ))
  ) THEN
    -- Legacy shipper-registration functions try to bind the creator. Ignore
    -- that insert when the creator is not Sales instead of blocking creation.
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_sales_only_shipper_assignment
BEFORE INSERT OR UPDATE OF admin_user_id
ON public.app_user_admin_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_sales_only_shipper_assignment();
REVOKE ALL ON FUNCTION public.enforce_sales_only_shipper_assignment()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_requester_access_shipment_shipper(
  requester_id uuid,
  requester_email text,
  requester_role text,
  target_shipper_name text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    public.authenticated_caller_can_assume_email(requester_email)
    AND EXISTS (
      SELECT 1
      FROM public.app_users AS claimed_requester
      WHERE claimed_requester.id = requester_id
        AND lower(trim(claimed_requester.email)) = lower(trim(requester_email))
        AND claimed_requester.role = requester_role
        AND claimed_requester.is_active = true
        AND claimed_requester.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.app_users AS shipper_user
      WHERE shipper_user.role = 'normal'
        AND shipper_user.is_active = true
        AND shipper_user.deleted_at IS NULL
        AND lower(trim(shipper_user.shipper_name)) = lower(trim(target_shipper_name))
        AND (
          requester_role = 'super_admin'
          OR (
            requester_role = 'admin'
            AND shipper_user.approval_status = 'approved'
          )
          OR (
            requester_role = 'normal'
            AND lower(trim(shipper_user.email)) = lower(trim(requester_email))
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_requester_access_shipment_shipper(uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_requester_access_shipment_shipper(uuid, text, text, text)
  TO authenticated, service_role;

DROP FUNCTION public.list_accessible_shipment_jobs(text);
CREATE FUNCTION public.list_accessible_shipment_jobs(requester_email text)
RETURNS TABLE(
  id uuid, shipper_name text, status text,
  under_process_from_date date, under_process_to_date date,
  customs_hold_from_date date, customs_hold_to_date date,
  completed_from_date date, completed_to_date date,
  trade_mode text, trade_term text, invoice_number text, job_number text,
  transport_mode text, consignee_name text, consignor_name text,
  pol_aol text, pod_aod text, vessel_flight_numbers text[],
  mbl_mawb text, hbl_hawb text, bl_awb_date date,
  assigned_admin_user_ids uuid[], operations_admin_user_ids uuid[],
  sales_admin_user_ids uuid[], created_by_admin_user_id uuid,
  progress_percent integer, progress_color_hex text, documents text[],
  internal_documents text[], notes text, created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  WITH requester AS (
    SELECT app_users.id, app_users.email, app_users.role
    FROM public.app_users
    WHERE lower(app_users.email) = lower(trim(requester_email))
      AND app_users.role IN ('normal', 'admin', 'super_admin')
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
      AND public.authenticated_caller_can_assume_email(app_users.email)
    LIMIT 1
  )
  SELECT
    job.id, job.shipper_name, job.status,
    job.under_process_from_date, job.under_process_to_date,
    job.customs_hold_from_date, job.customs_hold_to_date,
    job.completed_from_date, job.completed_to_date,
    job.trade_mode, job.trade_term, job.invoice_number, job.job_number,
    job.transport_mode, job.consignee_name, job.consignor_name,
    job.pol_aol, job.pod_aod, job.vessel_flight_numbers,
    job.mbl_mawb, job.hbl_hawb, job.bl_awb_date,
    job.assigned_admin_user_ids, job.operations_admin_user_ids,
    job.sales_admin_user_ids, job.created_by_admin_user_id,
    job.progress_percent, job.progress_color_hex, job.documents,
    job.internal_documents, job.notes, job.created_at, job.updated_at
  FROM public.shipment_jobs AS job
  CROSS JOIN requester
  WHERE job.shipper_name IS NOT NULL
    AND job.deleted_at IS NULL
    AND public.can_requester_access_shipment_shipper(
      requester.id, requester.email, requester.role, job.shipper_name
    )
  ORDER BY GREATEST(
    COALESCE(job.under_process_from_date, DATE '0001-01-01'),
    COALESCE(job.customs_hold_from_date, DATE '0001-01-01'),
    COALESCE(job.completed_from_date, DATE '0001-01-01'),
    job.updated_at::date
  ) DESC;
$$;
REVOKE ALL ON FUNCTION public.list_accessible_shipment_jobs(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipment_jobs(text)
  TO authenticated, service_role;

CREATE FUNCTION public.list_approved_shippers_for_shipments(requester_email text)
RETURNS TABLE(
  shipper_name text,
  email text,
  contact_person text,
  admin_assignments jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE
AS $$
BEGIN
  IF public.current_app_user_role() NOT IN ('admin', 'super_admin')
    OR lower(trim(requester_email)) <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated operator can list approved shippers'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    shipper_user.shipper_name,
    shipper_user.email,
    shipper_user.contact_person,
    public.get_normal_user_admin_assignments(shipper_user.id)
  FROM public.app_users AS shipper_user
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND shipper_user.approval_status = 'approved'
  ORDER BY shipper_user.shipper_name, shipper_user.email;
END;
$$;
REVOKE ALL ON FUNCTION public.list_approved_shippers_for_shipments(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_approved_shippers_for_shipments(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_accessible_shipment_job(
  requester_email text, target_job_id uuid, job_payload jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_record record;
  target_shipper_name text := NULLIF(job_payload->>'shipper_name', '');
  next_ops_ids uuid[];
  next_sales_ids uuid[];
BEGIN
  SELECT app_users.id, app_users.email, app_users.role INTO requester_record
  FROM public.app_users
  WHERE lower(app_users.email) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;
  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot update shipment jobs'
      USING ERRCODE = '42501';
  END IF;

  SELECT job.id, job.shipper_name, job.operations_admin_user_ids,
    job.sales_admin_user_ids
  INTO target_record
  FROM public.shipment_jobs AS job
  WHERE job.id = target_job_id
  FOR UPDATE;
  IF target_record.id IS NULL THEN RAISE EXCEPTION 'Shipment job not found'; END IF;
  IF target_record.shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id, requester_record.email, requester_record.role,
      target_record.shipper_name
    )
    OR target_shipper_name IS NULL
    OR NOT public.can_requester_access_shipment_shipper(
      requester_record.id, requester_record.email, requester_record.role,
      target_shipper_name
    ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipper'
      USING ERRCODE = '42501';
  END IF;

  IF requester_record.role = 'super_admin' THEN
    next_ops_ids := COALESCE(ARRAY(
      SELECT DISTINCT jsonb_array_elements_text(
        COALESCE(job_payload->'operations_admin_user_ids', '[]'::jsonb)
      )::uuid
    ), ARRAY[]::uuid[]);
    next_sales_ids := COALESCE(ARRAY(
      SELECT DISTINCT jsonb_array_elements_text(
        COALESCE(job_payload->'sales_admin_user_ids', '[]'::jsonb)
      )::uuid
    ), ARRAY[]::uuid[]);
  ELSE
    next_ops_ids := target_record.operations_admin_user_ids;
    next_sales_ids := target_record.sales_admin_user_ids;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(next_ops_ids || next_sales_ids) AS selected(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = selected.id
      AND operator.role = 'admin'
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected shipment admins are not assignable'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.shipment_jobs SET
    status = job_payload->>'status',
    under_process_from_date = NULLIF(job_payload->>'under_process_from_date', '')::date,
    under_process_to_date = NULLIF(job_payload->>'under_process_to_date', '')::date,
    customs_hold_from_date = NULLIF(job_payload->>'customs_hold_from_date', '')::date,
    customs_hold_to_date = NULLIF(job_payload->>'customs_hold_to_date', '')::date,
    completed_from_date = NULLIF(job_payload->>'completed_from_date', '')::date,
    completed_to_date = NULLIF(job_payload->>'completed_to_date', '')::date,
    trade_mode = job_payload->>'trade_mode',
    trade_term = NULLIF(job_payload->>'trade_term', ''),
    invoice_number = NULLIF(job_payload->>'invoice_number', ''),
    job_number = NULLIF(job_payload->>'job_number', ''),
    transport_mode = NULLIF(job_payload->>'transport_mode', ''),
    shipper_name = target_shipper_name,
    consignee_name = NULLIF(job_payload->>'consignee_name', ''),
    consignor_name = NULLIF(job_payload->>'consignor_name', ''),
    pol_aol = NULLIF(job_payload->>'pol_aol', ''),
    pod_aod = NULLIF(job_payload->>'pod_aod', ''),
    vessel_flight_numbers = COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(job_payload->'vessel_flight_numbers')
    ), ARRAY[]::text[]),
    mbl_mawb = NULLIF(job_payload->>'mbl_mawb', ''),
    hbl_hawb = NULLIF(job_payload->>'hbl_hawb', ''),
    bl_awb_date = NULLIF(job_payload->>'bl_awb_date', '')::date,
    operations_admin_user_ids = next_ops_ids,
    sales_admin_user_ids = next_sales_ids,
    assigned_admin_user_ids = ARRAY(
      SELECT DISTINCT selected_id
      FROM unnest(next_ops_ids || next_sales_ids) AS selected(selected_id)
      ORDER BY selected_id
    ),
    progress_percent = NULLIF(job_payload->>'progress_percent', '')::integer,
    progress_color_hex = NULLIF(job_payload->>'progress_color_hex', ''),
    documents = COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(job_payload->'documents')
    ), ARRAY[]::text[]),
    internal_documents = COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(job_payload->'internal_documents')
    ), ARRAY[]::text[]),
    notes = NULLIF(job_payload->>'notes', '')
  WHERE id = target_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job(
  requester_email text, target_job_id uuid, job_payload jsonb,
  documents_payload jsonb, events_payload jsonb, create_new boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  requester_record record;
  target_shipper_name text := NULLIF(job_payload->>'shipper_name', '');
  next_ops_ids uuid[];
  next_sales_ids uuid[];
BEGIN
  SELECT app_users.id, app_users.email, app_users.role INTO requester_record
  FROM public.app_users
  WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
    AND app_users.role IN ('admin', 'super_admin')
    AND app_users.is_active AND app_users.deleted_at IS NULL
    AND public.authenticated_caller_can_assume_email(app_users.email)
  LIMIT 1;
  IF requester_record.id IS NULL THEN
    RAISE EXCEPTION 'The authenticated operator cannot save shipment jobs'
      USING ERRCODE = '42501';
  END IF;
  IF target_shipper_name IS NULL OR NOT public.can_requester_access_shipment_shipper(
    requester_record.id, requester_record.email, requester_record.role,
    target_shipper_name
  ) THEN
    RAISE EXCEPTION 'The authenticated operator cannot access this shipper'
      USING ERRCODE = '42501';
  END IF;

  IF create_new THEN
    IF requester_record.role = 'admin' THEN
      next_ops_ids := ARRAY[requester_record.id]::uuid[];
      SELECT COALESCE(array_agg(DISTINCT operator.id ORDER BY operator.id), ARRAY[]::uuid[])
      INTO next_sales_ids
      FROM public.app_users AS shipper_user
      JOIN public.app_user_admin_assignments AS assignment
        ON assignment.normal_user_id = shipper_user.id
      JOIN public.app_users AS operator ON operator.id = assignment.admin_user_id
      WHERE shipper_user.role = 'normal'
        AND shipper_user.is_active = true
        AND shipper_user.deleted_at IS NULL
        AND lower(trim(shipper_user.shipper_name)) = lower(trim(target_shipper_name))
        AND operator.role = 'admin'
        AND operator.is_active = true
        AND operator.deleted_at IS NULL
        AND 'sales' = ANY(COALESCE(
          operator.staff_roles,
          ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
        ));
    ELSE
      next_ops_ids := COALESCE(ARRAY(
        SELECT DISTINCT jsonb_array_elements_text(
          COALESCE(job_payload->'operations_admin_user_ids', '[]'::jsonb)
        )::uuid
      ), ARRAY[]::uuid[]);
      next_sales_ids := COALESCE(ARRAY(
        SELECT DISTINCT jsonb_array_elements_text(
          COALESCE(job_payload->'sales_admin_user_ids', '[]'::jsonb)
        )::uuid
      ), ARRAY[]::uuid[]);
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(next_ops_ids || next_sales_ids) AS selected(id)
      LEFT JOIN public.app_users AS operator
        ON operator.id = selected.id
        AND operator.role = 'admin'
        AND operator.is_active = true
        AND operator.deleted_at IS NULL
      WHERE operator.id IS NULL
    ) THEN
      RAISE EXCEPTION 'One or more selected shipment admins are not assignable'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.shipment_jobs (
      id, status, under_process_from_date, under_process_to_date,
      customs_hold_from_date, customs_hold_to_date, completed_from_date,
      completed_to_date, trade_mode, trade_term, invoice_number, job_number,
      transport_mode, shipper_name, consignee_name, consignor_name, pol_aol,
      pod_aod, vessel_flight_numbers, mbl_mawb, hbl_hawb, bl_awb_date,
      assigned_admin_user_ids, operations_admin_user_ids, sales_admin_user_ids,
      created_by_admin_user_id, progress_percent, progress_color_hex,
      documents, internal_documents, notes
    ) VALUES (
      target_job_id, job_payload->>'status',
      NULLIF(job_payload->>'under_process_from_date', '')::date,
      NULLIF(job_payload->>'under_process_to_date', '')::date,
      NULLIF(job_payload->>'customs_hold_from_date', '')::date,
      NULLIF(job_payload->>'customs_hold_to_date', '')::date,
      NULLIF(job_payload->>'completed_from_date', '')::date,
      NULLIF(job_payload->>'completed_to_date', '')::date,
      job_payload->>'trade_mode', NULLIF(job_payload->>'trade_term', ''),
      NULLIF(job_payload->>'invoice_number', ''), NULLIF(job_payload->>'job_number', ''),
      NULLIF(job_payload->>'transport_mode', ''), target_shipper_name,
      NULLIF(job_payload->>'consignee_name', ''), NULLIF(job_payload->>'consignor_name', ''),
      NULLIF(job_payload->>'pol_aol', ''), NULLIF(job_payload->>'pod_aod', ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'vessel_flight_numbers')), ARRAY[]::text[]),
      NULLIF(job_payload->>'mbl_mawb', ''), NULLIF(job_payload->>'hbl_hawb', ''),
      NULLIF(job_payload->>'bl_awb_date', '')::date,
      ARRAY(SELECT DISTINCT selected_id FROM unnest(next_ops_ids || next_sales_ids) AS selected(selected_id) ORDER BY selected_id),
      next_ops_ids, next_sales_ids, requester_record.id,
      NULLIF(job_payload->>'progress_percent', '')::integer,
      NULLIF(job_payload->>'progress_color_hex', ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'documents')), ARRAY[]::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(job_payload->'internal_documents')), ARRAY[]::text[]),
      NULLIF(job_payload->>'notes', '')
    );
  ELSE
    PERFORM public.update_accessible_shipment_job(requester_email, target_job_id, job_payload);
  END IF;
  PERFORM public.replace_accessible_shipment_documents(
    requester_email, target_job_id, COALESCE(documents_payload, '[]'::jsonb)
  );
  PERFORM public.replace_accessible_shipment_tracking_events(
    requester_email, target_job_id, COALESCE(events_payload, '[]'::jsonb)
  );
  RETURN target_job_id;
END;
$$;

-- Customers need metadata for the staff snapshotted on their shipments even
-- after Ops links are removed from shipper master data.
CREATE OR REPLACE FUNCTION public.list_accessible_shipper_admin_assignments(
  requester_email text
)
RETURNS TABLE(shipper_name text, admin_assignments jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = '' STABLE
AS $$
  WITH requested_user AS (
    SELECT app_users.shipper_name
    FROM public.app_users
    WHERE lower(trim(app_users.email)) = lower(trim(requester_email))
      AND app_users.role = 'normal'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
      AND public.authenticated_caller_can_assume_email(app_users.email)
    LIMIT 1
  ), assigned_ids AS (
    SELECT assignment.admin_user_id
    FROM public.app_users AS shipper_user
    JOIN public.app_user_admin_assignments AS assignment
      ON assignment.normal_user_id = shipper_user.id
    CROSS JOIN requested_user
    WHERE shipper_user.role = 'normal'
      AND shipper_user.is_active = true
      AND shipper_user.deleted_at IS NULL
      AND lower(trim(shipper_user.shipper_name)) = lower(trim(requested_user.shipper_name))
    UNION
    SELECT selected.id
    FROM public.shipment_jobs AS job
    CROSS JOIN requested_user
    CROSS JOIN LATERAL unnest(
      COALESCE(job.operations_admin_user_ids, ARRAY[]::uuid[])
      || COALESCE(job.sales_admin_user_ids, ARRAY[]::uuid[])
    ) AS selected(id)
    WHERE job.deleted_at IS NULL
      AND lower(trim(job.shipper_name)) = lower(trim(requested_user.shipper_name))
  )
  SELECT requested_user.shipper_name, COALESCE(jsonb_agg(
    jsonb_build_object(
      'admin_user_id', operator.id,
      'email', operator.email,
      'user_name', operator.user_name,
      'staff_role', COALESCE(operator.staff_role, 'other'),
      'staff_roles', COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]),
      'created_at', operator.created_at,
      'updated_at', operator.updated_at
    ) ORDER BY operator.email
  ) FILTER (WHERE operator.id IS NOT NULL), '[]'::jsonb)
  FROM requested_user
  LEFT JOIN assigned_ids ON true
  LEFT JOIN public.app_users AS operator
    ON operator.id = assigned_ids.admin_user_id
    AND operator.role = 'admin'
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
  GROUP BY requested_user.shipper_name;
$$;
REVOKE ALL ON FUNCTION public.list_accessible_shipper_admin_assignments(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_accessible_shipper_admin_assignments(text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
