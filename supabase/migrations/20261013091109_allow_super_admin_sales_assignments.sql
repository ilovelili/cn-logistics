/* Allow super admins with explicit Sales duties to act as CN assignees.
   Login roles, requester authorization and existing function grants are preserved. */
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.enforce_shipment_assignment_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM unnest(
      COALESCE(NEW.operations_admin_user_ids, ARRAY[]::uuid[])
    ) AS selected(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = selected.id
      AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
      OR (
        NOT ('operations' = ANY(COALESCE(
          operator.staff_roles,
          ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
        )))
        AND selected.id IS DISTINCT FROM NEW.created_by_admin_user_id
      )
  ) THEN
    RAISE EXCEPTION 'Ops assignments require an active Operations admin or the shipment creator'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(
      COALESCE(NEW.sales_admin_user_ids, ARRAY[]::uuid[])
    ) AS selected(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = selected.id
      AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
      OR NOT ('sales' = ANY(COALESCE(
        operator.staff_roles,
        ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
      )))
  ) THEN
    RAISE EXCEPTION 'Sales assignments require an active Sales admin'
      USING ERRCODE = '22023';
  END IF;

  NEW.assigned_admin_user_ids := ARRAY(
    SELECT DISTINCT selected_id
    FROM unnest(
      COALESCE(NEW.operations_admin_user_ids, ARRAY[]::uuid[])
      || COALESCE(NEW.sales_admin_user_ids, ARRAY[]::uuid[])
    ) AS selected(selected_id)
    ORDER BY selected_id
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_shipper_staff_assignment_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users AS operator
    WHERE operator.id = NEW.admin_user_id
      AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
      AND COALESCE(
        operator.staff_roles,
        ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
      ) && ARRAY['operations', 'sales']::text[]
  ) THEN
    -- Legacy registration functions also try to bind their creator. Ignore
    -- that automatic link when the creator is neither Ops nor Sales.
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_normal_user_admin_assignments(target_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'admin_user_id', admin_user.id,
        'email', admin_user.email,
        'user_name', admin_user.user_name,
        'staff_role', COALESCE(admin_user.staff_role, 'other'),
        'staff_roles', COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]),
        'created_at', assignment.created_at,
        'updated_at', assignment.updated_at
      )
      ORDER BY admin_user.email
    ),
    '[]'::jsonb
  )
  FROM app_user_admin_assignments assignment
  JOIN app_users admin_user
    ON admin_user.id = assignment.admin_user_id
  WHERE assignment.normal_user_id = target_user_id
    AND (admin_user.role = 'admin' OR (admin_user.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]))))
    AND admin_user.deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.list_accessible_shipper_admin_assignments(requester_email text)
 RETURNS TABLE(shipper_name text, admin_assignments jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
  GROUP BY requested_user.shipper_name;
$function$;

CREATE OR REPLACE FUNCTION public.list_all_shipment_feedback_unchecked_20260822(super_admin_email text)
 RETURNS TABLE(id uuid, shipment_job_id uuid, shipment_invoice_number text, submitter_email text, admin_operator_email text, admin_operator_staff_role text, rating integer, attitude_rating integer, professionalism_rating integer, speed_rating integer, accuracy_rating integer, price_rating integer, reason text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    shipment_feedback.id,
    shipment_feedback.shipment_job_id,
    shipment_jobs.invoice_number,
    shipment_feedback.submitter_email,
    COALESCE(role_matched_admin.email, shipment_feedback.admin_operator_email),
    shipment_feedback.admin_operator_staff_role,
    shipment_feedback.rating,
    shipment_feedback.attitude_rating,
    shipment_feedback.professionalism_rating,
    shipment_feedback.speed_rating,
    shipment_feedback.accuracy_rating,
    shipment_feedback.price_rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at
  FROM shipment_feedback
  LEFT JOIN shipment_jobs
    ON shipment_jobs.id = shipment_feedback.shipment_job_id
  LEFT JOIN app_users normal_user
    ON lower(normal_user.email) = shipment_feedback.submitter_email
    AND normal_user.role = 'normal'
    AND normal_user.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT admin_user.email
    FROM app_user_admin_assignments assignment
    JOIN app_users admin_user
      ON admin_user.id = assignment.admin_user_id
    WHERE assignment.normal_user_id = normal_user.id
      AND (admin_user.role = 'admin' OR (admin_user.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]))))
      AND admin_user.deleted_at IS NULL
      AND shipment_feedback.admin_operator_staff_role = ANY(
        COALESCE(
          admin_user.staff_roles,
          ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]
        )
      )
      AND (
        shipment_jobs.assigned_admin_user_ids IS NULL
        OR cardinality(shipment_jobs.assigned_admin_user_ids) = 0
        OR admin_user.id = ANY(shipment_jobs.assigned_admin_user_ids)
      )
    ORDER BY admin_user.email
    LIMIT 1
  ) role_matched_admin ON true
  WHERE EXISTS (
    SELECT 1
    FROM app_users
    WHERE lower(app_users.email) = lower(trim(super_admin_email))
      AND app_users.role = 'super_admin'
      AND app_users.is_active = true
      AND app_users.deleted_at IS NULL
  )
  ORDER BY shipment_feedback.updated_at DESC, admin_operator_email;
$function$;

CREATE OR REPLACE FUNCTION public.list_assignable_admin_operators(requester_email text)
 RETURNS TABLE(id uuid, email text, user_name text, staff_role text, staff_roles text[], auth0_provisioning_status text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.authenticated_caller_can_assume_email(requester_email)
    OR NOT EXISTS (
      SELECT 1
      FROM public.app_users AS requester
      WHERE lower(trim(requester.email)) = lower(trim(requester_email))
        AND requester.role IN ('admin', 'super_admin')
        AND requester.is_active = true
        AND requester.deleted_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Only the authenticated operator can list assignable admins'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    operator.id,
    operator.email,
    operator.user_name,
    COALESCE(operator.staff_role, 'other'),
    COALESCE(
      operator.staff_roles,
      ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
    ),
    operator.auth0_provisioning_status,
    operator.created_at,
    operator.updated_at
  FROM public.app_users AS operator
  WHERE (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
  ORDER BY operator.user_name NULLS LAST, operator.email;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_accessible_shipment_job(requester_email text, target_job_id uuid, job_payload jsonb, documents_payload jsonb, events_payload jsonb, create_new boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
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
        AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
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
$function$;

CREATE OR REPLACE FUNCTION public.set_operator_shipper_assignment(requester_email text, target_user_id uuid, target_operator_id uuid, should_be_assigned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  normalized_requester_email text := lower(trim(requester_email));
BEGIN
  -- This RPC is for the super-admin operator-management screen only.
  IF public.current_app_user_role() IS DISTINCT FROM 'super_admin'
    OR normalized_requester_email IS NULL
    OR normalized_requester_email IS DISTINCT FROM public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated super admin can update operator assignments'
      USING ERRCODE = '42501';
  END IF;

  IF should_be_assigned IS NULL OR target_operator_id IS NULL THEN
    RAISE EXCEPTION 'An operator and assignment state are required'
      USING ERRCODE = '22023';
  END IF;

  -- Use the same parent-row lock as the existing assignment replacement RPC.
  PERFORM 1 FROM public.app_users AS target
  WHERE target.id = target_user_id
    AND target.role = 'normal'
    AND target.is_active = true
    AND target.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND
    OR NOT public.authenticated_caller_can_manage_normal_user(target_user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot manage this shipper user'
      USING ERRCODE = '42501';
  END IF;

  IF should_be_assigned THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.app_users AS operator
      WHERE operator.id = target_operator_id
        AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
        AND operator.is_active = true
        AND operator.deleted_at IS NULL
        AND COALESCE(operator.staff_roles,
          ARRAY[COALESCE(operator.staff_role, 'other')]::text[]
        ) && ARRAY['operations', 'sales']::text[]
    ) THEN
      RAISE EXCEPTION 'The selected admin is not assignable'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.app_user_admin_assignments (
      normal_user_id, admin_user_id, assigned_by
    ) VALUES (target_user_id, target_operator_id, normalized_requester_email)
    ON CONFLICT (normal_user_id, admin_user_id) DO NOTHING;
  ELSE
    DELETE FROM public.app_user_admin_assignments AS assignment
    WHERE assignment.normal_user_id = target_user_id
      AND assignment.admin_user_id = target_operator_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_shipment_assignment_change_request(target_user_id uuid, shipment_job_id uuid, proposed_operations_admin_user_ids uuid[], proposed_sales_admin_user_ids uuid[], requester_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requester_record record;
  target_record record;
  job_record public.shipment_jobs%rowtype;
  normalized_ops_ids uuid[];
  normalized_sales_ids uuid[];
  request_id uuid;
begin
  select app_user.id, app_user.email
  into requester_record
  from public.app_users app_user
  where lower(trim(app_user.email)) = lower(trim(requester_email))
    and app_user.role = 'admin'
    and app_user.is_active = true
    and app_user.deleted_at is null
    and public.authenticated_caller_can_assume_email(app_user.email)
  limit 1;

  if requester_record.id is null then
    raise exception 'Only an active regular administrator can request shipment assignment changes'
      using errcode = '42501';
  end if;

  select app_user.shipper_name, app_user.created_by, app_user.approval_status
  into target_record
  from public.app_users app_user
  where app_user.id = target_user_id
    and app_user.role = 'normal'
    and app_user.is_active = true
    and app_user.deleted_at is null;

  select * into job_record
  from public.shipment_jobs job
  where job.id = shipment_job_id
    and job.deleted_at is null
    and lower(trim(job.shipper_name)) = lower(trim(target_record.shipper_name))
    and (
      requester_record.id = any(coalesce(job.operations_admin_user_ids, array[]::uuid[]))
      or requester_record.id = any(coalesce(job.sales_admin_user_ids, array[]::uuid[]))
    )
  for update;

  if job_record.id is null then
    raise exception 'The administrator cannot request assignment changes for this shipment'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct selected_id order by selected_id), array[]::uuid[])
  into normalized_ops_ids
  from unnest(coalesce(proposed_operations_admin_user_ids, array[]::uuid[])) selected(selected_id);

  select coalesce(array_agg(distinct selected_id order by selected_id), array[]::uuid[])
  into normalized_sales_ids
  from unnest(coalesce(proposed_sales_admin_user_ids, array[]::uuid[])) selected(selected_id);

  if exists (
    select 1 from unnest(normalized_ops_ids) selected(id)
    left join public.app_users operator on operator.id = selected.id
      and (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[])))) and operator.is_active and operator.deleted_at is null
      and 'operations' = any(coalesce(operator.staff_roles, array[operator.staff_role]))
    where operator.id is null
  ) or exists (
    select 1 from unnest(normalized_sales_ids) selected(id)
    left join public.app_users operator on operator.id = selected.id
      and (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[])))) and operator.is_active and operator.deleted_at is null
      and 'sales' = any(coalesce(operator.staff_roles, array[operator.staff_role]))
    where operator.id is null
  ) then
    raise exception 'One or more selected admins do not have the requested shipment role'
      using errcode = '22023';
  end if;

  if normalized_ops_ids = coalesce(job_record.operations_admin_user_ids, array[]::uuid[])
    and normalized_sales_ids = coalesce(job_record.sales_admin_user_ids, array[]::uuid[]) then
    raise exception 'No shipment assignment changes were provided' using errcode = '22023';
  end if;

  insert into public.shipper_change_requests (
    target_user_id, shipper_name, shipper_created_by, requested_by,
    requested_by_email, current_snapshot, proposed_snapshot
  ) values (
    target_user_id, target_record.shipper_name, target_record.created_by,
    requester_record.id, lower(trim(requester_email)),
    jsonb_build_object(
      'shipment_job_id', shipment_job_id,
      'operations_admin_user_ids', to_jsonb(job_record.operations_admin_user_ids),
      'sales_admin_user_ids', to_jsonb(job_record.sales_admin_user_ids)
    ),
    jsonb_build_object(
      'shipment_job_id', shipment_job_id,
      'operations_admin_user_ids', to_jsonb(normalized_ops_ids),
      'sales_admin_user_ids', to_jsonb(normalized_sales_ids)
    )
  ) returning id into request_id;

  perform public.queue_shipper_registration_approval_emails(
    target_record.shipper_name,
    lower(trim(requester_email))
  );

  return request_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_shipment_feedback_batch(feedback_shipment_job_id uuid, feedback_submitter_email text, feedback_by_target jsonb, feedback_reason text)
 RETURNS TABLE(id uuid, shipment_job_id uuid, submitter_email text, admin_operator_id uuid, admin_operator_name text, admin_operator_email text, admin_operator_staff_role text, rating integer, attitude_rating integer, professionalism_rating integer, speed_rating integer, accuracy_rating integer, price_rating integer, reason text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  normalized_submitter_email text := lower(trim(feedback_submitter_email));
  target_feedback jsonb;
  target_admin public.app_users%ROWTYPE;
  target_admin_id uuid;
  target_role text;
  attitude integer;
  professionalism integer;
  speed integer;
  accuracy integer;
  price integer;
BEGIN
  IF NOT public.authenticated_caller_can_assume_email(
    normalized_submitter_email
  ) THEN
    RAISE EXCEPTION 'The authenticated user cannot submit feedback for this customer'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users submitter
    WHERE lower(trim(submitter.email)) = normalized_submitter_email
      AND submitter.role = 'normal'
      AND submitter.is_active = true
      AND submitter.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Feedback submitter must be an active customer user'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(feedback_by_target) <> 'array'
    OR jsonb_array_length(feedback_by_target) = 0 THEN
    RAISE EXCEPTION 'At least one staff feedback target is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(feedback_by_target) AS target(value)
    GROUP BY target.value->>'admin_operator_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Each staff member can only be rated once';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shipment_jobs job
    JOIN public.app_users requester
      ON lower(trim(requester.email)) = public.current_app_user_email()
    WHERE job.id = feedback_shipment_job_id
      AND public.can_requester_access_shipment_shipper(
        requester.id, requester.email, requester.role, job.shipper_name
      )
  ) THEN
    RAISE EXCEPTION 'The authenticated user cannot rate this shipment'
      USING ERRCODE = '42501';
  END IF;

  FOR target_feedback IN
    SELECT value FROM jsonb_array_elements(feedback_by_target)
  LOOP
    target_admin_id := (target_feedback->>'admin_operator_id')::uuid;
    target_role := target_feedback->>'target_role';
    attitude := (target_feedback->>'attitude_rating')::integer;
    professionalism := (target_feedback->>'professionalism_rating')::integer;
    speed := (target_feedback->>'speed_rating')::integer;
    accuracy := (target_feedback->>'accuracy_rating')::integer;
    price := (target_feedback->>'price_rating')::integer;

    IF target_role NOT IN ('sales', 'operations') THEN
      RAISE EXCEPTION 'Invalid feedback staff role';
    END IF;

    IF attitude NOT BETWEEN 1 AND 5
      OR professionalism NOT BETWEEN 1 AND 5
      OR speed NOT BETWEEN 1 AND 5
      OR accuracy NOT BETWEEN 1 AND 5
      OR price NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'Feedback ratings must be between 1 and 5';
    END IF;

    SELECT admin_user.*
    INTO target_admin
    FROM public.app_users admin_user
    JOIN public.shipment_jobs job
      ON job.id = feedback_shipment_job_id
     AND target_admin_id = ANY(COALESCE(job.assigned_admin_user_ids, ARRAY[]::uuid[]))
    WHERE admin_user.id = target_admin_id
      AND (admin_user.role = 'admin' OR (admin_user.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]))))
      AND admin_user.is_active = true
      AND admin_user.deleted_at IS NULL
      AND target_role = ANY(COALESCE(
        admin_user.staff_roles,
        ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]
      ));

    IF target_admin.id IS NULL THEN
      RAISE EXCEPTION 'Feedback target must be an active staff member assigned to this shipment'
        USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    INSERT INTO public.shipment_feedback (
      shipment_job_id,
      submitter_email,
      admin_operator_id,
      admin_operator_name,
      admin_operator_email,
      admin_operator_staff_role,
      rating,
      attitude_rating,
      professionalism_rating,
      speed_rating,
      accuracy_rating,
      price_rating,
      reason
    ) VALUES (
      feedback_shipment_job_id,
      normalized_submitter_email,
      target_admin.id,
      COALESCE(NULLIF(trim(target_admin.user_name), ''), target_admin.email),
      target_admin.email,
      target_role,
      round((attitude + professionalism + speed + accuracy + price) / 5.0)::integer,
      attitude,
      professionalism,
      speed,
      accuracy,
      price,
      NULLIF(trim(feedback_reason), '')
    )
    RETURNING
      shipment_feedback.id,
      shipment_feedback.shipment_job_id,
      shipment_feedback.submitter_email,
      shipment_feedback.admin_operator_id,
      shipment_feedback.admin_operator_name,
      shipment_feedback.admin_operator_email,
      shipment_feedback.admin_operator_staff_role,
      shipment_feedback.rating,
      shipment_feedback.attitude_rating,
      shipment_feedback.professionalism_rating,
      shipment_feedback.speed_rating,
      shipment_feedback.accuracy_rating,
      shipment_feedback.price_rating,
      shipment_feedback.reason,
      shipment_feedback.created_at,
      shipment_feedback.updated_at;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_shipment_feedback_unchecked_20260822(feedback_shipment_job_id uuid, feedback_submitter_email text, feedback_attitude_rating integer, feedback_professionalism_rating integer, feedback_speed_rating integer, feedback_accuracy_rating integer, feedback_price_rating integer, feedback_admin_operator_staff_role text, feedback_reason text)
 RETURNS TABLE(id uuid, shipment_job_id uuid, submitter_email text, admin_operator_email text, admin_operator_staff_role text, rating integer, attitude_rating integer, professionalism_rating integer, speed_rating integer, accuracy_rating integer, price_rating integer, reason text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized_submitter_email text := lower(trim(feedback_submitter_email));
  normalized_staff_role text := COALESCE(NULLIF(trim(feedback_admin_operator_staff_role), ''), 'sales');
  submitter_user_id uuid;
  primary_operator_email text;
  assigned_operator_email text;
  total_rating integer;
BEGIN
  IF normalized_staff_role NOT IN ('sales', 'operations') THEN
    RAISE EXCEPTION 'Invalid feedback admin operator staff role';
  END IF;

  IF feedback_attitude_rating < 1 OR feedback_attitude_rating > 5
    OR feedback_professionalism_rating < 1 OR feedback_professionalism_rating > 5
    OR feedback_speed_rating < 1 OR feedback_speed_rating > 5
    OR feedback_accuracy_rating < 1 OR feedback_accuracy_rating > 5
    OR feedback_price_rating < 1 OR feedback_price_rating > 5 THEN
    RAISE EXCEPTION 'feedback ratings must be between 1 and 5';
  END IF;

  SELECT app_users.id, app_users.created_by
  INTO submitter_user_id, primary_operator_email
  FROM app_users
  WHERE lower(app_users.email) = normalized_submitter_email
    AND app_users.role = 'normal'
    AND app_users.is_active = true
    AND app_users.deleted_at IS NULL
  LIMIT 1;

  IF submitter_user_id IS NULL THEN
    RAISE EXCEPTION 'Only active normal users can submit shipment feedback';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM shipment_feedback
    WHERE shipment_feedback.shipment_job_id = feedback_shipment_job_id
      AND shipment_feedback.submitter_email = normalized_submitter_email
      AND shipment_feedback.admin_operator_staff_role = normalized_staff_role
  ) THEN
    RAISE EXCEPTION 'Feedback has already been submitted for this shipment and staff role';
  END IF;

  SELECT admin_user.email
  INTO assigned_operator_email
  FROM app_user_admin_assignments assignment
  JOIN app_users admin_user
    ON admin_user.id = assignment.admin_user_id
  LEFT JOIN shipment_jobs
    ON shipment_jobs.id = feedback_shipment_job_id
  WHERE assignment.normal_user_id = submitter_user_id
    AND (admin_user.role = 'admin' OR (admin_user.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]))))
    AND admin_user.deleted_at IS NULL
    AND normalized_staff_role = ANY(
      COALESCE(
        admin_user.staff_roles,
        ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]
      )
    )
    AND (
      shipment_jobs.assigned_admin_user_ids IS NULL
      OR cardinality(shipment_jobs.assigned_admin_user_ids) = 0
      OR admin_user.id = ANY(shipment_jobs.assigned_admin_user_ids)
    )
  ORDER BY admin_user.email
  LIMIT 1;

  primary_operator_email := COALESCE(assigned_operator_email, primary_operator_email);
  total_rating := round((
    feedback_attitude_rating
    + feedback_professionalism_rating
    + feedback_speed_rating
    + feedback_accuracy_rating
    + feedback_price_rating
  ) / 5.0)::integer;

  RETURN QUERY
  INSERT INTO shipment_feedback (
    shipment_job_id,
    submitter_email,
    admin_operator_email,
    admin_operator_staff_role,
    rating,
    attitude_rating,
    professionalism_rating,
    speed_rating,
    accuracy_rating,
    price_rating,
    reason
  )
  VALUES (
    feedback_shipment_job_id,
    normalized_submitter_email,
    primary_operator_email,
    normalized_staff_role,
    total_rating,
    feedback_attitude_rating,
    feedback_professionalism_rating,
    feedback_speed_rating,
    feedback_accuracy_rating,
    feedback_price_rating,
    NULLIF(trim(feedback_reason), '')
  )
  RETURNING
    shipment_feedback.id,
    shipment_feedback.shipment_job_id,
    shipment_feedback.submitter_email,
    shipment_feedback.admin_operator_email,
    shipment_feedback.admin_operator_staff_role,
    shipment_feedback.rating,
    shipment_feedback.attitude_rating,
    shipment_feedback.professionalism_rating,
    shipment_feedback.speed_rating,
    shipment_feedback.accuracy_rating,
    shipment_feedback.price_rating,
    shipment_feedback.reason,
    shipment_feedback.created_at,
    shipment_feedback.updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_shipper_change_request(target_user_id uuid, proposed_shipper_name text, proposed_zipcode text, proposed_shipper_address text, proposed_telephone text, proposed_budget numeric, proposed_contacts jsonb, proposed_notes text, proposed_admin_user_ids uuid[], requester_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  requester_id uuid;
  normalized_requester_email text := lower(trim(requester_email));
  target_record record;
  normalized_contacts jsonb;
  normalized_admin_ids uuid[];
  current_data jsonb;
  proposed_data jsonb;
  request_id uuid;
BEGIN
  IF NOT public.authenticated_caller_can_assume_email(
    normalized_requester_email
  ) THEN
    RAISE EXCEPTION 'The authenticated user cannot act as this administrator'
      USING ERRCODE = '42501';
  END IF;

  SELECT app_user.id
  INTO requester_id
  FROM public.app_users AS app_user
  WHERE lower(trim(app_user.email)) = normalized_requester_email
    AND app_user.role = 'admin'
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
  LIMIT 1;

  SELECT app_user.shipper_name, app_user.created_by, app_user.approval_status
  INTO target_record
  FROM public.app_users AS app_user
  WHERE app_user.id = target_user_id
    AND app_user.role = 'normal'
    AND app_user.is_active
    AND app_user.deleted_at IS NULL
  FOR UPDATE;

  IF requester_id IS NULL OR target_record.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Only an active regular administrator can request changes to an approved shipper'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(trim(proposed_shipper_name), '') IS NULL
    OR NULLIF(trim(proposed_zipcode), '') IS NULL
    OR NULLIF(trim(proposed_shipper_address), '') IS NULL
    OR NULLIF(trim(proposed_telephone), '') IS NULL
    OR proposed_budget IS NULL
    OR proposed_budget < 0 THEN
    RAISE EXCEPTION 'Required shipper fields are missing' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', NULLIF(contact->>'id', '')::uuid,
      'email', lower(trim(contact->>'email')),
      'contact_person', trim(contact->>'contact_person')
    ) ORDER BY ordinal
  )
  INTO normalized_contacts
  FROM jsonb_array_elements(COALESCE(proposed_contacts, '[]'::jsonb))
    WITH ORDINALITY AS item(contact, ordinal)
  WHERE NULLIF(trim(contact->>'email'), '') IS NOT NULL
    AND NULLIF(trim(contact->>'contact_person'), '') IS NOT NULL;

  IF jsonb_array_length(COALESCE(normalized_contacts, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one customer contact is required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT selected_id ORDER BY selected_id), ARRAY[]::uuid[])
  INTO normalized_admin_ids
  FROM unnest(COALESCE(proposed_admin_user_ids, ARRAY[]::uuid[])) AS selected(selected_id);

  IF EXISTS (
    SELECT 1
    FROM unnest(normalized_admin_ids) AS selected(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = selected.id
      AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
      AND operator.is_active
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable' USING ERRCODE = '22023';
  END IF;

  current_data := public.shipper_group_snapshot(target_user_id);
  proposed_data := jsonb_build_object(
    'shipper_name', trim(proposed_shipper_name),
    'zipcode', trim(proposed_zipcode),
    'shipper_address', trim(proposed_shipper_address),
    'telephone', trim(proposed_telephone),
    'budget', proposed_budget,
    'notes', trim(COALESCE(proposed_notes, '')),
    'contacts', normalized_contacts,
    'admin_user_ids', to_jsonb(normalized_admin_ids)
  );

  IF current_data = proposed_data THEN
    RAISE EXCEPTION 'No shipper changes were provided' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.shipper_change_requests (
    target_user_id, shipper_name, shipper_created_by, requested_by,
    requested_by_email, current_snapshot, proposed_snapshot
  ) VALUES (
    target_user_id, target_record.shipper_name, target_record.created_by,
    requester_id, normalized_requester_email, current_data, proposed_data
  )
  RETURNING id INTO request_id;

  PERFORM public.queue_shipper_registration_approval_emails(
    target_record.shipper_name,
    normalized_requester_email
  );

  RETURN request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_updated_shipment_assignees_to_shipper()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into public.app_user_admin_assignments (
    normal_user_id,
    admin_user_id,
    assigned_by
  )
  select distinct
    shipper_user.id,
    selected.admin_user_id,
    coalesce(
      nullif(public.current_app_user_email(), ''),
      'system:shipment-assignee-sync'
    )
  from unnest(
    coalesce(new.operations_admin_user_ids, array[]::uuid[])
    || coalesce(new.sales_admin_user_ids, array[]::uuid[])
  ) as selected(admin_user_id)
  join public.app_users as operator
    on operator.id = selected.admin_user_id
    and (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
    and operator.is_active = true
    and operator.deleted_at is null
  join public.app_users as shipper_user
    on shipper_user.role = 'normal'
    and shipper_user.is_active = true
    and shipper_user.deleted_at is null
    and lower(trim(shipper_user.shipper_name)) = lower(trim(new.shipper_name))
  on conflict (normal_user_id, admin_user_id) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_accessible_normal_user_admin_assignments(requester_email text, target_user_id uuid, admin_user_ids uuid[])
 RETURNS TABLE(id uuid, email text, shipper_name text, zipcode text, shipper_address text, telephone text, budget numeric, contact_person text, notes text, approval_status text, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, auth0_provisioning_status text, admin_assignments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  normalized_requester_email text := lower(trim(requester_email));
  normalized_admin_user_ids uuid[] := COALESCE(admin_user_ids, ARRAY[]::uuid[]);
  target_shipper_name text;
  target_created_by text;
  shipper_user_ids uuid[];
BEGIN
  IF public.current_app_user_role() NOT IN ('admin', 'super_admin')
    OR normalized_requester_email <> public.current_app_user_email() THEN
    RAISE EXCEPTION 'Only the authenticated operator can update assignments'
      USING ERRCODE = '42501';
  END IF;

  SELECT target.shipper_name, target.created_by
  INTO target_shipper_name, target_created_by
  FROM public.app_users AS target
  WHERE target.id = target_user_id
    AND target.role = 'normal'
    AND target.is_active = true
    AND target.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND
    OR NOT public.authenticated_caller_can_manage_normal_user(target_user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot manage this shipper user'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(normalized_admin_user_ids) AS requested_admin(id)
    LEFT JOIN public.app_users AS operator
      ON operator.id = requested_admin.id
      AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
      AND operator.is_active = true
      AND operator.deleted_at IS NULL
    WHERE operator.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable'
      USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(shipper_user.id)
  INTO shipper_user_ids
  FROM public.app_users AS shipper_user
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND shipper_user.shipper_name = target_shipper_name
    AND COALESCE(shipper_user.created_by, '') = COALESCE(target_created_by, '');

  DELETE FROM public.app_user_admin_assignments AS assignment
  WHERE assignment.normal_user_id = ANY(shipper_user_ids);

  INSERT INTO public.app_user_admin_assignments (
    normal_user_id,
    admin_user_id,
    assigned_by
  )
  SELECT
    shipper_user.id,
    operator.id,
    normalized_requester_email
  FROM public.app_users AS shipper_user
  CROSS JOIN public.app_users AS operator
  WHERE shipper_user.id = ANY(shipper_user_ids)
    AND operator.id = ANY(normalized_admin_user_ids)
    AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
    AND operator.is_active = true
    AND operator.deleted_at IS NULL
  ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
  SET
    assigned_by = EXCLUDED.assigned_by,
    updated_at = now();

  UPDATE public.app_users AS shipper_user
  SET
    approval_status = CASE
      WHEN shipper_user.approval_status = 'approved' THEN 'to_be_approved'
      ELSE shipper_user.approval_status
    END,
    updated_at = now()
  WHERE shipper_user.id = ANY(shipper_user_ids);

  RETURN QUERY
  SELECT
    target.id,
    target.email,
    target.shipper_name,
    target.zipcode,
    target.shipper_address,
    target.telephone,
    target.budget,
    target.contact_person,
    target.notes,
    target.approval_status,
    target.created_by,
    target.created_at,
    target.updated_at,
    target.auth0_provisioning_status,
    public.get_normal_user_admin_assignments(target.id)
  FROM public.app_users AS target
  WHERE target.id = target_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_accessible_shipment_job(requester_email text, target_job_id uuid, job_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      AND (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(operator.staff_roles, ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
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
$function$;

CREATE OR REPLACE FUNCTION public.update_normal_user_admin_assignments_unchecked_20260822(super_admin_email text, target_user_id uuid, admin_user_ids uuid[])
 RETURNS TABLE(id uuid, email text, shipper_name text, zipcode text, shipper_address text, telephone text, budget numeric, contact_person text, notes text, approval_status text, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, admin_assignments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
    RAISE EXCEPTION 'Only super admin can update admin assignments';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_users
    WHERE app_users.id = target_user_id
      AND app_users.role = 'normal'
      AND app_users.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Target normal user was not found';
  END IF;

  DELETE FROM app_user_admin_assignments
  WHERE normal_user_id = target_user_id;

  INSERT INTO app_user_admin_assignments (
    normal_user_id,
    admin_user_id,
    assigned_by
  )
  SELECT
    target_user_id,
    admin_user.id,
    normalized_super_admin_email
  FROM app_users admin_user
  WHERE admin_user.id = ANY(admin_user_ids)
    AND (admin_user.role = 'admin' OR (admin_user.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(admin_user.staff_roles, ARRAY[COALESCE(admin_user.staff_role, 'other')]::text[]))))
    AND admin_user.deleted_at IS NULL
  ON CONFLICT (normal_user_id, admin_user_id) DO UPDATE
  SET
    assigned_by = normalized_super_admin_email,
    updated_at = now();

  RETURN QUERY
  SELECT
    app_users.id,
    app_users.email,
    app_users.shipper_name,
    app_users.zipcode,
    app_users.shipper_address,
    app_users.telephone,
    app_users.budget,
    app_users.contact_person,
    app_users.notes,
    app_users.approval_status,
    app_users.created_by,
    app_users.created_at,
    app_users.updated_at,
    get_normal_user_admin_assignments(app_users.id)
  FROM app_users
  WHERE app_users.id = target_user_id;
END;
$function$;


-- Liang retains super-admin access; only his staff duties change.
UPDATE public.app_users
SET staff_role = 'sales',
    staff_roles = ARRAY(SELECT DISTINCT duty FROM unnest(
      array_remove(COALESCE(staff_roles, ARRAY[]::text[]), 'other') || ARRAY['sales']::text[]
    ) AS duties(duty) ORDER BY duty),
    updated_at = now()
WHERE lower(trim(email)) = 'liang_liang@cnlogistics.co.jp'
  AND role = 'super_admin' AND is_active = true AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

