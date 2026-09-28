-- CheckMyFlat — droits et Row Level Security
-- Principe : tout est fermé, puis ouvert table par table et colonne par
-- colonne. Les changements d'état passent par les fonctions de la migration
-- précédente ; la clé service role (serveur uniquement) contourne la RLS.

-- ------------------------------------------------------------- droits --

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Fonctions utilisées par les policies.
grant execute on function
  public.is_system(),
  public.is_admin(),
  public.is_active_account(),
  public.is_request_owner(uuid),
  public.is_assigned_agent(uuid),
  public.can_read_request(uuid),
  public.can_read_report(uuid),
  public.can_write_report(uuid)
to anon, authenticated;

-- RPC appelables par un utilisateur connecté (chacune vérifie l'appelant).
grant execute on function
  public.transition_request(uuid, public.request_status, text),
  public.publish_request(uuid),
  public.create_offer(uuid, integer, text),
  public.respond_offer(uuid, boolean),
  public.assign_agent(uuid, uuid),
  public.set_request_zone(uuid, uuid),
  public.submit_report(uuid),
  public.delete_request(uuid),
  public.report_weighted_score(uuid)
to authenticated;

grant execute on function public.expire_offers() to service_role;

-- Données de référence : lisibles par tous, modifiables par les admins.
grant select on public.pricing_zones, public.pricing_zone_rules, public.criteria_blocks, public.criteria
  to anon, authenticated;
grant insert, update, delete on public.pricing_zones, public.pricing_zone_rules to authenticated;
grant update (label, subtitle, icon, weight, position) on public.criteria_blocks to authenticated;
grant update (label, short_label, position, active) on public.criteria to authenticated;
grant select on public.app_settings to authenticated;
grant update (value) on public.app_settings to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

alter table public.visit_requests alter column user_id set default auth.uid();
grant select on public.visit_requests to authenticated;
grant insert (
  listing_url, address, postal_code, city, lat, lng, property_type, slot_at,
  agency_name, agency_phone, agency_email, priorities, proposed_price_cents, consent_at
) on public.visit_requests to authenticated;
grant update (
  listing_url, address, postal_code, city, lat, lng, property_type, slot_at,
  agency_name, agency_phone, agency_email, priorities, proposed_price_cents, consent_at
) on public.visit_requests to authenticated;

grant select on public.visit_request_events to authenticated;
grant select on public.price_offers to authenticated;
grant select on public.messages to authenticated;
grant insert (request_id, body) on public.messages to authenticated;
grant select on public.payments to authenticated;

grant select on public.visit_reports to authenticated;
grant insert (
  request_id, filming_refused, global_score, justification, negotiation_points, conclusion, recommendation
) on public.visit_reports to authenticated;
grant update (
  filming_refused, global_score, justification, negotiation_points, conclusion, recommendation
) on public.visit_reports to authenticated;
grant select, insert, update, delete on public.report_scores to authenticated;
grant select on public.report_media to authenticated;
grant select, insert, update, delete on public.report_reserves to authenticated;

-- ----------------------------------------------------------------- RLS --

alter table public.profiles enable row level security;
alter table public.pricing_zones enable row level security;
alter table public.pricing_zone_rules enable row level security;
alter table public.criteria_blocks enable row level security;
alter table public.criteria enable row level security;
alter table public.app_settings enable row level security;
alter table public.reference_counters enable row level security;
alter table public.visit_requests enable row level security;
alter table public.visit_request_events enable row level security;
alter table public.request_transitions enable row level security;
alter table public.price_offers enable row level security;
alter table public.messages enable row level security;
alter table public.payments enable row level security;
alter table public.stripe_events enable row level security;
alter table public.visit_reports enable row level security;
alter table public.report_scores enable row level security;
alter table public.report_media enable row level security;
alter table public.report_reserves enable row level security;

-- reference_counters, request_transitions, stripe_events : aucune policy,
-- donc inaccessibles hors fonctions SECURITY DEFINER et service role.

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- données de référence
create policy pricing_zones_read on public.pricing_zones for select to anon, authenticated using (true);
create policy pricing_zones_admin_insert on public.pricing_zones for insert to authenticated
  with check ((select public.is_admin()));
create policy pricing_zones_admin_update on public.pricing_zones for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy pricing_zones_admin_delete on public.pricing_zones for delete to authenticated
  using ((select public.is_admin()));

create policy pricing_zone_rules_read on public.pricing_zone_rules for select to anon, authenticated using (true);
create policy pricing_zone_rules_admin_insert on public.pricing_zone_rules for insert to authenticated
  with check ((select public.is_admin()));
create policy pricing_zone_rules_admin_update on public.pricing_zone_rules for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy pricing_zone_rules_admin_delete on public.pricing_zone_rules for delete to authenticated
  using ((select public.is_admin()));

create policy criteria_blocks_read on public.criteria_blocks for select to anon, authenticated using (true);
create policy criteria_blocks_admin_update on public.criteria_blocks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy criteria_read on public.criteria for select to anon, authenticated using (true);
create policy criteria_admin_update on public.criteria for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy app_settings_read on public.app_settings for select to authenticated using (true);
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- visit_requests
create policy visit_requests_select on public.visit_requests for select to authenticated
  using (
    (select public.is_admin())
    or (user_id = (select auth.uid()) and deleted_at is null)
    or (
      status in ('planifiee', 'realisee', 'rapport_livre', 'litige')
      and public.is_assigned_agent(id)
    )
  );
create policy visit_requests_insert_own on public.visit_requests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'brouillon'
    and (select public.is_active_account())
  );
create policy visit_requests_update_own on public.visit_requests for update to authenticated
  using (
    user_id = (select auth.uid())
    and deleted_at is null
    and status in ('brouillon', 'publiee', 'en_negociation')
    and (select public.is_active_account())
  )
  with check (user_id = (select auth.uid()) and status in ('brouillon', 'publiee', 'en_negociation'));

create policy visit_request_events_select on public.visit_request_events for select to authenticated
  using (public.can_read_request(request_id));

-- négociation : client et admins ; jamais l'agent
create policy price_offers_select on public.price_offers for select to authenticated
  using ((select public.is_admin()) or public.is_request_owner(request_id));
create policy messages_select on public.messages for select to authenticated
  using ((select public.is_admin()) or public.is_request_owner(request_id));
create policy messages_insert on public.messages for insert to authenticated
  with check ((select public.is_admin()) or public.is_request_owner(request_id));

create policy payments_select on public.payments for select to authenticated
  using ((select public.is_admin()) or public.is_request_owner(request_id));

-- rapport
create policy visit_reports_select on public.visit_reports for select to authenticated
  using (public.can_read_report(request_id));
create policy visit_reports_insert on public.visit_reports for insert to authenticated
  with check (
    public.is_assigned_agent(request_id)
    and exists (select 1 from public.visit_requests r where r.id = request_id and r.status = 'planifiee')
  );
create policy visit_reports_update on public.visit_reports for update to authenticated
  using (public.can_write_report(id)) with check (public.can_write_report(id));

create policy report_scores_select on public.report_scores for select to authenticated
  using (exists (
    select 1 from public.visit_reports rep where rep.id = report_id and public.can_read_report(rep.request_id)
  ));
create policy report_scores_insert on public.report_scores for insert to authenticated
  with check (public.can_write_report(report_id));
create policy report_scores_update on public.report_scores for update to authenticated
  using (public.can_write_report(report_id)) with check (public.can_write_report(report_id));
create policy report_scores_delete on public.report_scores for delete to authenticated
  using (public.can_write_report(report_id));

create policy report_media_select on public.report_media for select to authenticated
  using (exists (
    select 1 from public.visit_reports rep where rep.id = report_id and public.can_read_report(rep.request_id)
  ));

create policy report_reserves_select on public.report_reserves for select to authenticated
  using (exists (
    select 1 from public.visit_reports rep where rep.id = report_id and public.can_read_report(rep.request_id)
  ));
create policy report_reserves_insert on public.report_reserves for insert to authenticated
  with check (public.can_write_report(report_id));
create policy report_reserves_update on public.report_reserves for update to authenticated
  using (public.can_write_report(report_id)) with check (public.can_write_report(report_id));
create policy report_reserves_delete on public.report_reserves for delete to authenticated
  using (public.can_write_report(report_id));
