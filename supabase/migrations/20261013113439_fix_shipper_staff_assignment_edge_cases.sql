/* Correct shipment creator propagation and company identity after request review.
   Shipment creator exemptions remain unchanged. Customer sync copies qualified
   duties only, and skips names shared by multiple creator-defined companies. */
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.sync_updated_shipment_assignees_to_shipper()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into public.app_user_admin_assignments (
    normal_user_id,
    admin_user_id,
    assigned_by,
    assignment_roles
  )
  select distinct
    shipper_user.id,
    selected.admin_user_id,
    coalesce(
      nullif(public.current_app_user_email(), ''),
      'system:shipment-assignee-sync'
    ), ARRAY(SELECT duty FROM (VALUES
      ('operations',selected.admin_user_id=ANY(COALESCE(new.operations_admin_user_ids,ARRAY[]::uuid[]))),
      ('sales',selected.admin_user_id=ANY(COALESCE(new.sales_admin_user_ids,ARRAY[]::uuid[])))) duties(duty,chosen) WHERE chosen AND duty=ANY(COALESCE(NULLIF(operator.staff_roles,ARRAY[]::text[]),ARRAY[operator.staff_role])) ORDER BY duty)
  from unnest(
    coalesce(new.operations_admin_user_ids, array[]::uuid[])
    || coalesce(new.sales_admin_user_ids, array[]::uuid[])
  ) as selected(admin_user_id)
  join public.app_users as operator
    on operator.id = selected.admin_user_id
    and (operator.role = 'admin' OR (operator.role = 'super_admin'
        AND 'sales' = ANY(COALESCE(NULLIF(operator.staff_roles, ARRAY[]::text[]), ARRAY[COALESCE(operator.staff_role, 'other')]::text[]))))
    and operator.is_active = true
    and operator.deleted_at is null
  join public.app_users as shipper_user
    on shipper_user.role = 'normal'
    and shipper_user.is_active = true
    and shipper_user.deleted_at is null
    and lower(trim(shipper_user.shipper_name)) = lower(trim(new.shipper_name))
    and (select count(distinct coalesce(candidate.created_by,'')) from public.app_users candidate
      where candidate.role='normal' and candidate.is_active and candidate.deleted_at is null
        and lower(trim(candidate.shipper_name))=lower(trim(new.shipper_name)))=1
  -- The creator exemption belongs to the shipment, not to customer duties.
  where (selected.admin_user_id=ANY(COALESCE(new.operations_admin_user_ids,ARRAY[]::uuid[]))
      AND 'operations'=ANY(COALESCE(NULLIF(operator.staff_roles,ARRAY[]::text[]),ARRAY[operator.staff_role])))
    OR (selected.admin_user_id=ANY(COALESCE(new.sales_admin_user_ids,ARRAY[]::uuid[]))
      AND 'sales'=ANY(COALESCE(NULLIF(operator.staff_roles,ARRAY[]::text[]),ARRAY[operator.staff_role])))
  on conflict (normal_user_id, admin_user_id) do update set assignment_roles=ARRAY(
    select distinct duty from unnest(public.app_user_admin_assignments.assignment_roles || excluded.assignment_roles) duties(duty)
    where exists (select 1 from public.app_users staff where staff.id=excluded.admin_user_id
      and duty=ANY(COALESCE(NULLIF(staff.staff_roles,ARRAY[]::text[]),ARRAY[staff.staff_role]))) order by duty
  ) where not excluded.assignment_roles <@ public.app_user_admin_assignments.assignment_roles;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_shipper_change_request(request_id uuid, next_status text)
 RETURNS TABLE(id uuid, email text, shipper_name text, zipcode text, shipper_address text, telephone text, budget numeric, contact_person text, notes text, approval_status text, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, auth0_provisioning_status text, admin_assignments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  reviewer_id uuid;
  reviewer_email text := public.current_app_user_email();
  pending_request public.shipper_change_requests%rowtype;
  updated_user_ids uuid[];
  proposed_admin_ids uuid[];
  target_job public.shipment_jobs%rowtype;
  proposed_ops_ids uuid[];
  proposed_sales_ids uuid[];
begin
  select app_user.id into reviewer_id
  from public.app_users app_user
  where lower(trim(app_user.email)) = reviewer_email
    and app_user.role = 'super_admin'
    and app_user.is_active and app_user.deleted_at is null
  limit 1;

  if reviewer_id is null or next_status not in ('approved', 'rejected') then
    raise exception 'Only the authenticated super admin can review shipper changes'
      using errcode = '42501';
  end if;

  select * into pending_request
  from public.shipper_change_requests request
  where request.id = request_id and request.status = 'pending'
  for update;

  if not found then
    raise exception 'Pending shipper change request was not found' using errcode = 'P0002';
  end if;

  if next_status = 'approved' and pending_request.proposed_snapshot ? 'shipment_job_id' then
    select * into target_job
    from public.shipment_jobs job
    where job.id = (pending_request.proposed_snapshot->>'shipment_job_id')::uuid
      and job.deleted_at is null
    for update;

    if target_job.id is null
      or to_jsonb(target_job.operations_admin_user_ids) is distinct from pending_request.current_snapshot->'operations_admin_user_ids'
      or to_jsonb(target_job.sales_admin_user_ids) is distinct from pending_request.current_snapshot->'sales_admin_user_ids' then
      raise exception 'Shipment assignments changed after this request was submitted; reject it and submit a new request'
        using errcode = '40001';
    end if;

    select coalesce(array_agg(value::uuid), array[]::uuid[]) into proposed_ops_ids
    from jsonb_array_elements_text(coalesce(pending_request.proposed_snapshot->'operations_admin_user_ids', '[]'::jsonb)) item(value);
    select coalesce(array_agg(value::uuid), array[]::uuid[]) into proposed_sales_ids
    from jsonb_array_elements_text(coalesce(pending_request.proposed_snapshot->'sales_admin_user_ids', '[]'::jsonb)) item(value);

    update public.shipment_jobs job
    set operations_admin_user_ids = proposed_ops_ids,
        sales_admin_user_ids = proposed_sales_ids,
        assigned_admin_user_ids = array(select distinct unnest(proposed_ops_ids || proposed_sales_ids)),
        updated_at = now()
    where job.id = target_job.id;
  elsif next_status = 'approved' then
    -- Use the same lock order as direct staff saves before checking the snapshot.
    perform contact.id from public.app_users contact
    where contact.role='normal' and contact.is_active and contact.deleted_at is null
      and contact.shipper_name=pending_request.shipper_name
      and coalesce(contact.created_by,'')=coalesce(pending_request.shipper_created_by,'')
    order by contact.id for update;
    if pending_request.current_snapshot ? 'operations_admin_user_ids' then
      if public.shipper_group_snapshot(pending_request.target_user_id) is distinct from pending_request.current_snapshot then
        raise exception 'Shipper data changed after this request; reject it and submit a new request' using errcode='40001';
      end if;
    else
      -- Existing pending requests must be resubmitted rather than guessing their role intent.
      raise exception 'This request predates separate customer duties; reject it and submit a new request' using errcode='40001';
    end if;
    proposed_ops_ids:=ARRAY(select value::uuid from jsonb_array_elements_text(pending_request.proposed_snapshot->'operations_admin_user_ids') items(value));
    proposed_sales_ids:=ARRAY(select value::uuid from jsonb_array_elements_text(pending_request.proposed_snapshot->'sales_admin_user_ids') items(value));
    perform public.validate_shipper_staff_selection(proposed_ops_ids,proposed_sales_ids);

    select array_agg(updated_user.id) into updated_user_ids
    from public.update_registered_shipper_contacts_unchecked_20260822(
      pending_request.target_user_id,
      pending_request.proposed_snapshot->>'shipper_name',
      pending_request.proposed_snapshot->>'zipcode',
      pending_request.proposed_snapshot->>'shipper_address',
      pending_request.proposed_snapshot->>'telephone',
      (pending_request.proposed_snapshot->>'budget')::numeric,
      pending_request.proposed_snapshot->'contacts',
      pending_request.proposed_snapshot->>'notes'
    ) updated_user;

    select coalesce(array_agg(value::uuid), array[]::uuid[]) into proposed_admin_ids
    from jsonb_array_elements_text(coalesce(pending_request.proposed_snapshot->'admin_user_ids', '[]'::jsonb)) item(value);

    delete from public.app_user_admin_assignments assignment
    where assignment.normal_user_id = any(coalesce(updated_user_ids, array[]::uuid[]));
    insert into public.app_user_admin_assignments(normal_user_id, admin_user_id, assigned_by, assignment_roles)
    select shipper_user_id, admin_user_id, reviewer_email, ARRAY(
      select duty from (values ('operations',admin_user_id=ANY(proposed_ops_ids)),
        ('sales',admin_user_id=ANY(proposed_sales_ids))) duties(duty,chosen) where chosen order by duty)
    from unnest(coalesce(updated_user_ids, array[]::uuid[])) shipper(shipper_user_id)
    cross join unnest(proposed_admin_ids) admin(admin_user_id)
    on conflict (normal_user_id, admin_user_id) do update
    set assigned_by = excluded.assigned_by, assignment_roles=excluded.assignment_roles, updated_at = now();
    update public.app_users shipper_user
    set approval_status = 'approved', updated_at = now()
    where shipper_user.id = any(coalesce(updated_user_ids, array[]::uuid[]));
  end if;

  update public.shipper_change_requests change_request
  set status = next_status, reviewed_by = reviewer_id,
      reviewed_by_email = reviewer_email, reviewed_at = now(), updated_at = now()
  where change_request.id = request_id;

  return query
  select app_user.id, app_user.email, app_user.shipper_name, app_user.zipcode,
    app_user.shipper_address, app_user.telephone, app_user.budget,
    app_user.contact_person, app_user.notes, app_user.approval_status,
    app_user.created_by, app_user.created_at, app_user.updated_at,
    app_user.auth0_provisioning_status,
    public.get_normal_user_admin_assignments(app_user.id)
  from public.app_users app_user
  where app_user.role = 'normal' and app_user.is_active and app_user.deleted_at is null
    and app_user.shipper_name = case
      when next_status='approved' and not pending_request.proposed_snapshot ? 'shipment_job_id'
        then pending_request.proposed_snapshot->>'shipper_name'
      else pending_request.shipper_name end
    and coalesce(app_user.created_by,'')=coalesce(pending_request.shipper_created_by,'')
  order by app_user.created_at, app_user.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_accessible_normal_user_admin_assignments(requester_email text, target_user_id uuid, admin_user_ids uuid[])
 RETURNS TABLE(id uuid, email text, shipper_name text, zipcode text, shipper_address text, telephone text, budget numeric, contact_person text, notes text, approval_status text, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, auth0_provisioning_status text, admin_assignments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE choices jsonb; ops_ids uuid[]; sales_ids uuid[];
BEGIN
  IF EXISTS(SELECT 1 FROM unnest(COALESCE(admin_user_ids,ARRAY[]::uuid[])) selected(id)
    LEFT JOIN public.app_users operator ON operator.id=selected.id AND operator.is_active AND operator.deleted_at IS NULL
      AND (operator.role='admin' OR (operator.role='super_admin' AND 'sales'=ANY(COALESCE(NULLIF(operator.staff_roles,ARRAY[]::text[]),ARRAY[operator.staff_role]))))
    WHERE operator.id IS NULL) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable' USING ERRCODE='22023';
  END IF;
  choices:=public.shipper_staff_selection_from_membership(target_user_id,admin_user_ids);
  ops_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(choices->'operations_admin_user_ids') items(value));
  sales_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(choices->'sales_admin_user_ids') items(value));
  RETURN QUERY SELECT * FROM public.update_accessible_shipper_staff_assignments(requester_email,target_user_id,ops_ids,sales_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_shipper_change_request(target_user_id uuid, proposed_shipper_name text, proposed_zipcode text, proposed_shipper_address text, proposed_telephone text, proposed_budget numeric, proposed_contacts jsonb, proposed_notes text, proposed_admin_user_ids uuid[], requester_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE choices jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM unnest(COALESCE(proposed_admin_user_ids,ARRAY[]::uuid[])) selected(id)
    LEFT JOIN public.app_users operator ON operator.id=selected.id AND operator.is_active AND operator.deleted_at IS NULL
      AND (operator.role='admin' OR (operator.role='super_admin' AND 'sales'=ANY(COALESCE(NULLIF(operator.staff_roles,ARRAY[]::text[]),ARRAY[operator.staff_role]))))
    WHERE operator.id IS NULL) THEN
    RAISE EXCEPTION 'One or more selected admins are not assignable' USING ERRCODE='22023';
  END IF;
  choices:=public.shipper_staff_selection_from_membership(target_user_id,proposed_admin_user_ids);
  RETURN public.submit_shipper_staff_change_request(target_user_id,proposed_shipper_name,proposed_zipcode,
    proposed_shipper_address,proposed_telephone,proposed_budget,proposed_contacts,proposed_notes,
    ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(choices->'operations_admin_user_ids') items(value)),
    ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(choices->'sales_admin_user_ids') items(value)),requester_email);
END;
$function$;

-- Preserve historical membership-only links with no Ops/Sales duty during duty edits.
CREATE OR REPLACE FUNCTION public.update_accessible_shipper_staff_assignments(requester_email text, target_user_id uuid, operations_admin_user_ids uuid[], sales_admin_user_ids uuid[])
 RETURNS TABLE(id uuid, email text, shipper_name text, zipcode text, shipper_address text, telephone text, budget numeric, contact_person text, notes text, approval_status text, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, auth0_provisioning_status text, admin_assignments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  normalized_requester_email text := lower(trim(requester_email));
  normalized_admin_user_ids uuid[] := ARRAY(SELECT DISTINCT ids.id FROM unnest(COALESCE(operations_admin_user_ids, ARRAY[]::uuid[]) || COALESCE(sales_admin_user_ids, ARRAY[]::uuid[])) ids(id) ORDER BY ids.id);
  target_shipper_name text;
  target_created_by text;
  shipper_user_ids uuid[];
  assignments_changed boolean;
BEGIN
  IF public.current_app_user_role() IS NULL OR public.current_app_user_role() NOT IN ('admin','super_admin')
    OR normalized_requester_email IS NULL OR normalized_requester_email IS DISTINCT FROM public.current_app_user_email() THEN
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
  ;

  IF NOT FOUND
    OR NOT public.authenticated_caller_can_manage_normal_user(target_user_id) THEN
    RAISE EXCEPTION 'The authenticated operator cannot manage this shipper user'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.validate_shipper_staff_selection(operations_admin_user_ids, sales_admin_user_ids);

  SELECT array_agg(shipper_user.id)
  INTO shipper_user_ids
  FROM public.app_users AS shipper_user
  WHERE shipper_user.role = 'normal'
    AND shipper_user.is_active = true
    AND shipper_user.deleted_at IS NULL
    AND shipper_user.shipper_name = target_shipper_name
    AND COALESCE(shipper_user.created_by, '') = COALESCE(target_created_by, '');

  -- Lock the entire company in a deterministic order, not the clicked contact first.
  PERFORM contact.id FROM public.app_users contact
  WHERE contact.id = ANY(shipper_user_ids) ORDER BY contact.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.app_users contact WHERE contact.id=target_user_id
    AND contact.is_active AND contact.deleted_at IS NULL AND contact.shipper_name=target_shipper_name
    AND COALESCE(contact.created_by,'')=COALESCE(target_created_by,'')) THEN
    RAISE EXCEPTION 'Shipper data changed; reload and retry' USING ERRCODE='40001';
  END IF;
  IF public.current_app_user_role()='admin' AND EXISTS (
    SELECT 1 FROM public.app_users contact WHERE contact.id=ANY(shipper_user_ids) AND contact.approval_status='approved'
  ) THEN
    RAISE EXCEPTION 'Approved shipper assignments require a change request' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.app_user_admin_assignments assignment
    WHERE assignment.normal_user_id=ANY(shipper_user_ids)
      AND (cardinality(assignment.assignment_roles)>0 OR assignment.admin_user_id=ANY(normalized_admin_user_ids))
      AND (NOT assignment.admin_user_id=ANY(normalized_admin_user_ids)
        OR assignment.assignment_roles IS DISTINCT FROM ARRAY(
          SELECT duty FROM (VALUES
            ('operations',assignment.admin_user_id=ANY(COALESCE(operations_admin_user_ids,ARRAY[]::uuid[]))),
            ('sales',assignment.admin_user_id=ANY(COALESCE(sales_admin_user_ids,ARRAY[]::uuid[])))
          ) duties(duty,chosen) WHERE chosen ORDER BY duty))
  ) OR EXISTS (
    SELECT 1 FROM unnest(shipper_user_ids) contacts(id) CROSS JOIN unnest(normalized_admin_user_ids) operators(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.app_user_admin_assignments assignment
      WHERE assignment.normal_user_id=contacts.id AND assignment.admin_user_id=operators.id)
  ) INTO assignments_changed;

  IF assignments_changed THEN
    DELETE FROM public.app_user_admin_assignments assignment
    WHERE assignment.normal_user_id=ANY(shipper_user_ids) AND cardinality(assignment.assignment_roles)>0
      AND NOT assignment.admin_user_id=ANY(normalized_admin_user_ids);
    INSERT INTO public.app_user_admin_assignments(normal_user_id,admin_user_id,assigned_by,assignment_roles)
    SELECT contact_id,operator_id,normalized_requester_email,ARRAY(
      SELECT duty FROM (VALUES
        ('operations',operator_id=ANY(COALESCE(operations_admin_user_ids,ARRAY[]::uuid[]))),
        ('sales',operator_id=ANY(COALESCE(sales_admin_user_ids,ARRAY[]::uuid[])))
      ) duties(duty,chosen) WHERE chosen ORDER BY duty)
    FROM unnest(shipper_user_ids) contacts(contact_id) CROSS JOIN unnest(normalized_admin_user_ids) operators(operator_id)
    ON CONFLICT(normal_user_id,admin_user_id) DO UPDATE
    SET assignment_roles=EXCLUDED.assignment_roles,assigned_by=EXCLUDED.assigned_by,updated_at=now()
    WHERE app_user_admin_assignments.assignment_roles IS DISTINCT FROM EXCLUDED.assignment_roles;

    UPDATE public.app_users contact SET approval_status=CASE WHEN contact.approval_status='approved' THEN 'to_be_approved' ELSE contact.approval_status END,updated_at=now()
    WHERE contact.id=ANY(shipper_user_ids);
  END IF;

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

NOTIFY pgrst, 'reload schema';
