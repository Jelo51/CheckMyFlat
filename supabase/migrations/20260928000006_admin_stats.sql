-- CheckMyFlat — indicateurs du back-office

alter table public.payments add column captured_at timestamptz;

-- Date de capture renseignée automatiquement au passage en `captured`.
create or replace function public.set_payment_captured_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'captured' and (old.status is distinct from 'captured') and new.captured_at is null then
    new.captured_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger payments_captured_at
  before update on public.payments
  for each row execute function public.set_payment_captured_at();

update public.payments set captured_at = updated_at where status = 'captured' and captured_at is null;

-- KPIs de la file des demandes (admins uniquement).
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'CMF05';
  end if;
  return jsonb_build_object(
    'byStatus', coalesce((
      select jsonb_object_agg(status, n)
      from (
        select status, count(*) as n from public.visit_requests where deleted_at is null group by status
      ) s
    ), '{}'::jsonb),
    'revenueMonthCents', (
      select coalesce(sum(captured_cents - refunded_cents), 0)
      from public.payments where captured_at >= v_month_start
    ),
    'avgDeliveryHours', (
      select round((extract(epoch from avg(rep.delivered_at - r.slot_at)) / 3600)::numeric, 1)
      from public.visit_reports rep
      join public.visit_requests r on r.id = rep.request_id
      where rep.delivered_at >= now() - interval '30 days' and r.slot_at is not null
    ),
    'avgGlobalScore', (
      select round(avg(global_score), 1)
      from public.visit_reports
      where status = 'submitted' and delivered_at >= now() - interval '30 days'
    ),
    'deliveredLast30Days', (
      select count(*) from public.visit_reports where delivered_at >= now() - interval '30 days'
    )
  );
end;
$$;

revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
revoke execute on function public.set_payment_captured_at() from public, anon, authenticated;
