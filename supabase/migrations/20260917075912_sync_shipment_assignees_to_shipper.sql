/*
  Add shipment assignees to the matching shipper staff list when an existing
  shipment assignment changes. Existing shipper assignments are never removed.

  This trigger is intentionally SECURITY INVOKER and only runs on assignment
  updates, which remain restricted to super-admin review/direct edit.
*/

set lock_timeout = '5s';

create or replace function public.sync_updated_shipment_assignees_to_shipper()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
    and operator.role = 'admin'
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
$$;

revoke all on function public.sync_updated_shipment_assignees_to_shipper()
  from public, anon, authenticated;

drop trigger if exists sync_updated_shipment_assignees_to_shipper
  on public.shipment_jobs;

create trigger sync_updated_shipment_assignees_to_shipper
after update of operations_admin_user_ids, sales_admin_user_ids
on public.shipment_jobs
for each row
when (
  old.operations_admin_user_ids is distinct from new.operations_admin_user_ids
  or old.sales_admin_user_ids is distinct from new.sales_admin_user_ids
)
execute function public.sync_updated_shipment_assignees_to_shipper();

notify pgrst, 'reload schema';
