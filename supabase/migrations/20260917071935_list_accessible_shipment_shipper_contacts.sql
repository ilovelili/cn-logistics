create function public.list_accessible_shipment_shipper_contacts(
  requester_email text
)
returns table(
  shipper_name text,
  email text,
  contact_person text,
  admin_assignments jsonb
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  requester_record record;
begin
  select requester.id, requester.role
  into requester_record
  from public.app_users requester
  where lower(trim(requester.email)) = lower(trim(requester_email))
    and requester.role in ('admin', 'super_admin')
    and requester.is_active = true
    and requester.deleted_at is null
    and public.authenticated_caller_can_assume_email(requester.email)
  limit 1;

  if requester_record.id is null then
    raise exception 'Only the authenticated operator can list shipment shipper contacts'
      using errcode = '42501';
  end if;

  return query
  select
    shipper_user.shipper_name,
    shipper_user.email,
    shipper_user.contact_person,
    public.get_normal_user_admin_assignments(shipper_user.id)
  from public.app_users shipper_user
  where shipper_user.role = 'normal'
    and shipper_user.is_active = true
    and shipper_user.deleted_at is null
    and shipper_user.approval_status = 'approved'
    and (
      requester_record.role = 'super_admin'
      or exists (
        select 1
        from public.shipment_jobs job
        where job.deleted_at is null
          and lower(trim(job.shipper_name)) = lower(trim(shipper_user.shipper_name))
          and (
            requester_record.id = any(coalesce(job.operations_admin_user_ids, array[]::uuid[]))
            or requester_record.id = any(coalesce(job.sales_admin_user_ids, array[]::uuid[]))
          )
      )
    )
  order by shipper_user.shipper_name, shipper_user.email;
end;
$$;

revoke all on function public.list_accessible_shipment_shipper_contacts(text)
  from public, anon;
grant execute on function public.list_accessible_shipment_shipper_contacts(text)
  to authenticated, service_role;

notify pgrst, 'reload schema';
