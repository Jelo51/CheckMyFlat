-- CheckMyFlat — fonctions et triggers
-- Toutes les fonctions SECURITY DEFINER fixent `search_path = ''` et
-- qualifient chaque objet.
--
-- Codes d'erreur applicatifs (SQLSTATE) :
--   CMF01 changement de statut hors transition_request
--   CMF02 transition ou opération refusée par la machine à états
--   CMF03 non authentifié ou compte suspendu
--   CMF04 introuvable
--   CMF05 accès refusé
--   CMF06 données incomplètes ou invalides

-- ------------------------------------------------------------ helpers --

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_system()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.role()), '') = 'service_role'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and suspended_at is null
  )
$$;

create or replace function public.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and suspended_at is null
  )
$$;

create or replace function public.is_request_owner(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.visit_requests r
    join public.profiles p on p.id = r.user_id
    where r.id = p_request_id
      and r.user_id = (select auth.uid())
      and r.deleted_at is null
      and p.suspended_at is null
  )
$$;

-- L'assignation ne dépend pas d'un rôle admin : en v2, un `user` promu
-- `agent` fonctionne sans changer les policies.
create or replace function public.is_assigned_agent(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.visit_requests r
    join public.profiles p on p.id = r.assigned_agent_id
    where r.id = p_request_id
      and r.assigned_agent_id = (select auth.uid())
      and r.deleted_at is null
      and p.role in ('agent', 'admin')
      and p.suspended_at is null
  )
$$;

create or replace function public.can_read_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.is_request_owner(p_request_id) or public.is_assigned_agent(p_request_id)
$$;

-- Le client ne voit le rapport qu'une fois livré (ou en litige).
create or replace function public.can_read_report(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or public.is_assigned_agent(p_request_id)
    or (
      public.is_request_owner(p_request_id)
      and exists (
        select 1 from public.visit_requests
        where id = p_request_id and status in ('rapport_livre', 'litige')
      )
    )
$$;

-- L'agent n'écrit le rapport que pendant la visite planifiée, en brouillon.
create or replace function public.can_write_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.visit_reports rep
    join public.visit_requests r on r.id = rep.request_id
    where rep.id = p_report_id
      and rep.status = 'draft'
      and r.status = 'planifiee'
      and public.is_assigned_agent(r.id)
  )
$$;

create or replace function public.setting_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::integer from public.app_settings where key = p_key
$$;

-- ------------------------------------------------------------ comptes --

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Le rôle n'est jamais lu dans les métadonnées fournies par l'utilisateur.
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------- demandes --

create or replace function public.assign_request_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from (now() at time zone 'Europe/Paris'))::integer;
  v_seq integer;
begin
  insert into public.reference_counters (year, last_value)
  values (v_year, 1)
  on conflict (year) do update set last_value = public.reference_counters.last_value + 1
  returning last_value into v_seq;
  new.reference := 'CMF-' || v_year || '-' || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end;
  return new;
end;
$$;

create trigger visit_requests_reference
  before insert on public.visit_requests
  for each row execute function public.assign_request_reference();

create or replace function public.log_request_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.visit_request_events (request_id, actor_id, actor_kind, from_status, to_status, reason)
  values (
    new.id,
    case when public.is_system() then null else (select auth.uid()) end,
    case when public.is_system() then 'system'::public.transition_actor else 'owner'::public.transition_actor end,
    null,
    new.status,
    'Création'
  );
  return new;
end;
$$;

create trigger visit_requests_log_creation
  after insert on public.visit_requests
  for each row execute function public.log_request_creation();

-- Le statut ne change jamais par un UPDATE direct.
create or replace function public.guard_request_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('cmf.in_transition', true), '') <> 'on' then
    raise exception 'Le statut d''une demande ne change que via transition_request'
      using errcode = 'CMF01';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger visit_requests_guard_status
  before update on public.visit_requests
  for each row execute function public.guard_request_status();

-- Acteurs que l'appelant incarne vis-à-vis d'une demande.
create or replace function public.request_actors(r public.visit_requests)
returns public.transition_actor[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_actors public.transition_actor[] := '{}';
begin
  if public.is_system() then
    return array['system'::public.transition_actor];
  end if;
  if v_uid is null or not public.is_active_account() then
    return v_actors;
  end if;
  if r.user_id = v_uid and r.deleted_at is null then
    v_actors := v_actors || 'owner'::public.transition_actor;
  end if;
  if public.is_assigned_agent(r.id) then
    v_actors := v_actors || 'assigned_agent'::public.transition_actor;
  end if;
  if public.is_admin() then
    v_actors := v_actors || 'admin'::public.transition_actor;
  end if;
  return v_actors;
end;
$$;

create or replace function public.transition_request(
  p_request_id uuid,
  p_to public.request_status,
  p_reason text default null
)
returns public.visit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.visit_requests;
  v_from public.request_status;
  v_actors public.transition_actor[];
  v_allowed public.transition_actor[];
  v_actor public.transition_actor;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into r from public.visit_requests where id = p_request_id for update;
  if not found then
    raise exception 'Demande introuvable' using errcode = 'CMF04';
  end if;
  v_from := r.status;

  v_actors := public.request_actors(r);
  if cardinality(v_actors) = 0 then
    raise exception 'Accès refusé' using errcode = 'CMF05';
  end if;

  select actors into v_allowed
  from public.request_transitions
  where from_status = v_from and to_status = p_to;

  if v_allowed is null or not (v_allowed && v_actors) then
    raise exception 'Transition refusée : % → %', v_from, p_to using errcode = 'CMF02';
  end if;

  select a into v_actor
  from unnest(v_actors) with ordinality as t(a, i)
  where a = any (v_allowed)
  order by i
  limit 1;

  -- Préconditions métier.
  if p_to = 'publiee' then
    if r.consent_at is null then
      raise exception 'Attestation manquante' using errcode = 'CMF06';
    end if;
    if r.slot_at is null or r.slot_at <= now() then
      raise exception 'Le rendez-vous doit être dans le futur' using errcode = 'CMF06';
    end if;
  elsif p_to = 'acceptee' and r.agreed_price_cents is null then
    raise exception 'Aucun prix accepté' using errcode = 'CMF06';
  elsif p_to = 'planifiee' and r.assigned_agent_id is null then
    raise exception 'Assignez un agent avant de planifier' using errcode = 'CMF06';
  elsif p_to = 'realisee' and not exists (
    select 1 from public.visit_reports where request_id = r.id and status = 'submitted'
  ) then
    raise exception 'Le compte rendu n''a pas été soumis' using errcode = 'CMF06';
  elsif p_to = 'rapport_livre' and not exists (
    select 1 from public.visit_reports where request_id = r.id and pdf_path is not null
  ) then
    raise exception 'Le PDF du rapport n''a pas été généré' using errcode = 'CMF06';
  elsif p_to in ('annulee', 'litige') and v_reason is null then
    raise exception 'Indiquez un motif' using errcode = 'CMF06';
  end if;

  perform set_config('cmf.in_transition', 'on', true);
  update public.visit_requests
  set
    status = p_to,
    published_at = case when p_to = 'publiee' then now() else published_at end,
    urgent_fee_cents = case
      when p_to = 'publiee' then
        case
          when slot_at - now() < make_interval(hours => public.setting_int('urgent_window_hours'))
            then public.setting_int('urgent_fee_cents')
          else 0
        end
      else urgent_fee_cents
    end
  where id = r.id
  returning * into r;
  perform set_config('cmf.in_transition', 'off', true);

  if p_to in ('acceptee', 'annulee') then
    update public.price_offers
    set status = 'superseded', responded_at = now()
    where request_id = r.id and status = 'pending';
  end if;

  insert into public.visit_request_events (request_id, actor_id, actor_kind, from_status, to_status, reason)
  values (
    r.id,
    case when v_actor = 'system' then null else (select auth.uid()) end,
    v_actor,
    v_from,
    p_to,
    v_reason
  );

  return r;
end;
$$;

-- -------------------------------------------------------- négociation --

create or replace function public.caller_side(r public.visit_requests)
returns public.party_side
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if r.user_id = (select auth.uid()) and public.is_request_owner(r.id) then
    return 'client';
  elsif public.is_admin() then
    return 'checkmyflat';
  end if;
  raise exception 'Accès refusé' using errcode = 'CMF05';
end;
$$;

create or replace function public.insert_offer(
  r public.visit_requests,
  p_side public.party_side,
  p_amount_cents integer,
  p_note text,
  p_default_body text
)
returns public.price_offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.price_offers;
begin
  update public.price_offers
  set status = 'superseded', responded_at = now()
  where request_id = r.id and status = 'pending';

  insert into public.price_offers (request_id, author_id, author_side, amount_cents, note, expires_at)
  values (
    r.id,
    (select auth.uid()),
    p_side,
    p_amount_cents,
    nullif(btrim(coalesce(p_note, '')), ''),
    least(now() + make_interval(hours => public.setting_int('offer_validity_hours')), r.slot_at)
  )
  returning * into v_offer;

  insert into public.messages (request_id, author_id, author_side, body, offer_id)
  values (r.id, (select auth.uid()), p_side, coalesce(v_offer.note, p_default_body), v_offer.id);

  return v_offer;
end;
$$;

-- Publication : transition + proposition initiale du client.
create or replace function public.publish_request(p_request_id uuid)
returns public.visit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.visit_requests;
begin
  r := public.transition_request(p_request_id, 'publiee', null);
  perform public.insert_offer(r, 'client', r.proposed_price_cents, null, 'Demande publiée avec ce prix.');
  return r;
end;
$$;

create or replace function public.create_offer(p_request_id uuid, p_amount_cents integer, p_note text default null)
returns public.price_offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.visit_requests;
  v_side public.party_side;
  v_offer public.price_offers;
begin
  select * into r from public.visit_requests where id = p_request_id for update;
  if not found then
    raise exception 'Demande introuvable' using errcode = 'CMF04';
  end if;
  v_side := public.caller_side(r);
  if r.status not in ('publiee', 'en_negociation') then
    raise exception 'La négociation est close' using errcode = 'CMF02';
  end if;
  if p_amount_cents is null or p_amount_cents not between 100 and 100000 then
    raise exception 'Montant invalide' using errcode = 'CMF06';
  end if;

  v_offer := public.insert_offer(
    r,
    v_side,
    p_amount_cents,
    p_note,
    case when v_side = 'client' then 'Nouvelle proposition.' else 'Contre-proposition.' end
  );

  if r.status = 'publiee' then
    perform public.transition_request(r.id, 'en_negociation', 'Nouvelle proposition de prix');
  end if;
  return v_offer;
end;
$$;

create or replace function public.respond_offer(p_offer_id uuid, p_accept boolean)
returns public.visit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.price_offers;
  r public.visit_requests;
  v_side public.party_side;
begin
  select * into v_offer from public.price_offers where id = p_offer_id for update;
  if not found then
    raise exception 'Proposition introuvable' using errcode = 'CMF04';
  end if;
  select * into r from public.visit_requests where id = v_offer.request_id for update;
  v_side := public.caller_side(r);

  if v_offer.status <> 'pending' then
    raise exception 'Cette proposition n''est plus valable' using errcode = 'CMF02';
  end if;
  if v_offer.expires_at <= now() then
    raise exception 'Cette proposition a expiré' using errcode = 'CMF02';
  end if;
  if v_offer.author_side = v_side then
    raise exception 'Vous ne pouvez pas répondre à votre propre proposition' using errcode = 'CMF02';
  end if;

  if p_accept then
    update public.visit_requests set agreed_price_cents = v_offer.amount_cents where id = r.id;
    update public.price_offers set status = 'accepted', responded_at = now() where id = v_offer.id;
    r := public.transition_request(r.id, 'acceptee', 'Proposition acceptée');
    insert into public.messages (request_id, author_id, author_side, body)
    values (r.id, null, 'system', 'Prix accepté : ' || to_char(v_offer.amount_cents / 100.0, 'FM999990D00') || ' €.');
  else
    update public.price_offers set status = 'rejected', responded_at = now() where id = v_offer.id;
    insert into public.messages (request_id, author_id, author_side, body)
    values (r.id, null, 'system', 'Proposition refusée.');
  end if;
  return r;
end;
$$;

create or replace function public.expire_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_system() then
    raise exception 'Accès refusé' using errcode = 'CMF05';
  end if;
  update public.price_offers set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Messages : le camp de l'auteur est déduit, jamais fourni par le client.
create or replace function public.set_message_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.visit_requests;
begin
  if new.author_side is null then
    select * into r from public.visit_requests where id = new.request_id;
    new.author_id := (select auth.uid());
    new.author_side := public.caller_side(r);
    if r.status = 'brouillon' then
      raise exception 'Publiez la demande avant d''écrire' using errcode = 'CMF02';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_set_author
  before insert on public.messages
  for each row execute function public.set_message_author();

-- ----------------------------------------------------------- assignation --

create or replace function public.assign_agent(p_request_id uuid, p_agent_id uuid)
returns public.visit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.visit_requests;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = 'CMF05';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_agent_id and role in ('agent', 'admin') and suspended_at is null
  ) then
    raise exception 'Ce compte ne peut pas réaliser de visite' using errcode = 'CMF06';
  end if;
  select * into r from public.visit_requests where id = p_request_id for update;
  if not found then
    raise exception 'Demande introuvable' using errcode = 'CMF04';
  end if;
  if r.status not in ('payee', 'planifiee') then
    raise exception 'Une visite s''assigne une fois payée' using errcode = 'CMF02';
  end if;

  update public.visit_requests set assigned_agent_id = p_agent_id where id = r.id returning * into r;
  update public.visit_reports set agent_id = p_agent_id where request_id = r.id and status = 'draft';

  if r.status = 'payee' then
    r := public.transition_request(r.id, 'planifiee', 'Agent assigné');
  else
    insert into public.visit_request_events (request_id, actor_id, actor_kind, from_status, to_status, reason)
    values (r.id, (select auth.uid()), 'admin', r.status, r.status, 'Agent réassigné');
  end if;
  return r;
end;
$$;

create or replace function public.set_request_zone(p_request_id uuid, p_zone_id uuid)
returns public.visit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.visit_requests;
begin
  if not (public.is_admin() or public.is_system()) then
    raise exception 'Accès refusé' using errcode = 'CMF05';
  end if;
  update public.visit_requests set zone_id = p_zone_id where id = p_request_id returning * into r;
  if not found then
    raise exception 'Demande introuvable' using errcode = 'CMF04';
  end if;
  return r;
end;
$$;

-- ------------------------------------------------------------- rapport --

create or replace function public.report_weighted_score(p_report_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(sum(t.avg_score * t.weight), 2)
  from (
    select b.weight, avg(s.score) as avg_score
    from public.criteria_blocks b
    join public.criteria c on c.block_id = b.id and c.active
    join public.report_scores s on s.criterion_id = c.id and s.report_id = p_report_id and s.score is not null
    group by b.id, b.weight
  ) t
$$;

create or replace function public.set_report_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Le statut n'est pas accordé en écriture aux utilisateurs (reste `draft`).
  if (select auth.role()) = 'authenticated' then
    new.agent_id := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger visit_reports_set_agent
  before insert on public.visit_reports
  for each row execute function public.set_report_agent();

create trigger visit_reports_updated_at
  before update on public.visit_reports
  for each row execute function public.set_updated_at();

create or replace function public.submit_report(p_request_id uuid)
returns public.visit_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.visit_requests;
  v_rep public.visit_reports;
  v_weighted numeric;
begin
  select * into r from public.visit_requests where id = p_request_id for update;
  if not found then
    raise exception 'Demande introuvable' using errcode = 'CMF04';
  end if;
  if not public.is_assigned_agent(r.id) then
    raise exception 'Accès refusé' using errcode = 'CMF05';
  end if;
  if r.status <> 'planifiee' then
    raise exception 'Cette visite n''est pas en cours' using errcode = 'CMF02';
  end if;

  select * into v_rep from public.visit_reports where request_id = r.id for update;
  if not found or v_rep.status <> 'draft' then
    raise exception 'Aucun compte rendu en brouillon' using errcode = 'CMF06';
  end if;

  if exists (
    select 1 from public.criteria c
    where c.active and not exists (
      select 1 from public.report_scores s
      where s.report_id = v_rep.id and s.criterion_id = c.id and s.score is not null
    )
  ) then
    raise exception 'Notez tous les critères' using errcode = 'CMF06';
  end if;

  if v_rep.global_score is null then
    raise exception 'Indiquez la note globale' using errcode = 'CMF06';
  end if;

  v_weighted := public.report_weighted_score(v_rep.id);
  if abs(v_rep.global_score - v_weighted) > 1
     and char_length(btrim(coalesce(v_rep.justification, ''))) < 10 then
    raise exception 'Justification obligatoire : écart de plus d''un point avec la moyenne pondérée'
      using errcode = 'CMF06';
  end if;

  if char_length(btrim(coalesce(v_rep.conclusion, ''))) < 10 or v_rep.recommendation is null then
    raise exception 'Rédigez la conclusion et choisissez une recommandation' using errcode = 'CMF06';
  end if;

  if not v_rep.filming_refused and not exists (select 1 from public.report_media where report_id = v_rep.id) then
    raise exception 'Ajoutez au moins une photo, ou indiquez le refus de prise de vue' using errcode = 'CMF06';
  end if;

  update public.visit_reports
  set status = 'submitted', weighted_score = v_weighted, submitted_at = now()
  where id = v_rep.id
  returning * into v_rep;

  perform public.transition_request(r.id, 'realisee', 'Compte rendu soumis');
  return v_rep;
end;
$$;

-- --------------------------------------------------------- suppression --

-- Hard delete tant qu'aucun paiement n'a abouti ; ensuite soft delete
-- (obligation comptable), avec suppression du rapport et de ses médias.
create or replace function public.delete_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.visit_requests;
  v_paid boolean;
begin
  select * into r from public.visit_requests where id = p_request_id for update;
  if not found or r.deleted_at is not null then
    raise exception 'Demande introuvable' using errcode = 'CMF04';
  end if;
  if not (public.is_request_owner(r.id) or public.is_admin()) then
    raise exception 'Accès refusé' using errcode = 'CMF05';
  end if;

  v_paid := exists (
    select 1 from public.payments
    where request_id = r.id and status not in ('pending', 'canceled', 'failed')
  );

  if not v_paid then
    if r.status not in ('brouillon', 'publiee', 'en_negociation', 'acceptee', 'annulee') then
      raise exception 'Annulez la demande avant de la supprimer' using errcode = 'CMF02';
    end if;
    delete from public.payments where request_id = r.id;
    delete from public.visit_reports where request_id = r.id;
    delete from public.visit_requests where id = r.id;
    return 'hard';
  end if;

  if r.status not in ('annulee', 'rapport_livre') then
    raise exception 'Annulez la demande avant de la supprimer' using errcode = 'CMF02';
  end if;
  insert into public.visit_request_events (request_id, actor_id, actor_kind, from_status, to_status, reason)
  values (
    r.id,
    (select auth.uid()),
    case when public.is_request_owner(r.id) then 'owner'::public.transition_actor else 'admin'::public.transition_actor end,
    r.status,
    r.status,
    'Suppression (conservation comptable)'
  );
  delete from public.visit_reports where request_id = r.id;
  update public.visit_requests set deleted_at = now() where id = r.id;
  return 'soft';
end;
$$;
