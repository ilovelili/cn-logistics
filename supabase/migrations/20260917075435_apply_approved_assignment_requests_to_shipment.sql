create function public.submit_shipment_assignment_change_request(
  target_user_id uuid,
  shipment_job_id uuid,
  proposed_operations_admin_user_ids uuid[],
  proposed_sales_admin_user_ids uuid[],
  requester_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
      and operator.role = 'admin' and operator.is_active and operator.deleted_at is null
      and 'operations' = any(coalesce(operator.staff_roles, array[operator.staff_role]))
    where operator.id is null
  ) or exists (
    select 1 from unnest(normalized_sales_ids) selected(id)
    left join public.app_users operator on operator.id = selected.id
      and operator.role = 'admin' and operator.is_active and operator.deleted_at is null
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
$$;

revoke all on function public.submit_shipment_assignment_change_request(uuid, uuid, uuid[], uuid[], text)
  from public, anon;
grant execute on function public.submit_shipment_assignment_change_request(uuid, uuid, uuid[], uuid[], text)
  to authenticated, service_role;

create or replace function public.review_shipper_change_request(
  request_id uuid,
  next_status text
)
returns table(
  id uuid, email text, shipper_name text, zipcode text, shipper_address text,
  telephone text, budget numeric, contact_person text, notes text,
  approval_status text, created_by text, created_at timestamptz,
  updated_at timestamptz, auth0_provisioning_status text,
  admin_assignments jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
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
    if public.shipper_group_snapshot(pending_request.target_user_id)
      is distinct from pending_request.current_snapshot then
      raise exception 'Shipper data changed after this request was submitted; reject it and submit a new request'
        using errcode = '40001';
    end if;

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
    insert into public.app_user_admin_assignments(normal_user_id, admin_user_id, assigned_by)
    select shipper_user_id, admin_user_id, reviewer_email
    from unnest(coalesce(updated_user_ids, array[]::uuid[])) shipper(shipper_user_id)
    cross join unnest(proposed_admin_ids) admin(admin_user_id)
    on conflict (normal_user_id, admin_user_id) do update
    set assigned_by = excluded.assigned_by, updated_at = now();
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
    and lower(trim(app_user.shipper_name)) = lower(trim(pending_request.shipper_name))
  order by app_user.created_at, app_user.id;
end;
$$;

notify pgrst, 'reload schema';
