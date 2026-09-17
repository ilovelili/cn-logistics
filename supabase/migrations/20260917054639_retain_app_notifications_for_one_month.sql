create index if not exists app_notifications_created_at_idx
  on public.app_notifications (created_at);

create or replace function public.cleanup_expired_app_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.app_notifications
  where created_at < now() - interval '1 month';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_app_notifications() from public;
revoke all on function public.cleanup_expired_app_notifications() from anon;
revoke all on function public.cleanup_expired_app_notifications() from authenticated;
grant execute on function public.cleanup_expired_app_notifications() to service_role;

select public.cleanup_expired_app_notifications();

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'cleanup-expired-app-notifications';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'cleanup-expired-app-notifications',
  '15 18 * * *',
  'select public.cleanup_expired_app_notifications()'
);
