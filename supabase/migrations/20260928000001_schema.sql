-- CheckMyFlat — schéma de base
-- Enums, tables, index. Les fonctions, les policies RLS et les données de
-- référence sont dans les migrations suivantes.

-- ---------------------------------------------------------------- enums --

create type public.role as enum ('visitor', 'user', 'agent', 'admin');

create type public.request_status as enum (
  'brouillon',
  'publiee',
  'en_negociation',
  'acceptee',
  'payee',
  'planifiee',
  'realisee',
  'rapport_livre',
  'annulee',
  'litige'
);

create type public.transition_actor as enum ('owner', 'assigned_agent', 'admin', 'system');

create type public.property_type as enum ('studio', 't1', 't2', 't3', 't4', 't5_plus', 'maison', 'autre');

create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'superseded', 'expired');

create type public.party_side as enum ('client', 'checkmyflat', 'system');

create type public.payment_status as enum (
  'pending',
  'authorized',
  'captured',
  'partially_refunded',
  'refunded',
  'canceled',
  'failed'
);

create type public.report_status as enum ('draft', 'submitted');

create type public.media_kind as enum ('photo', 'video');

create type public.recommendation as enum ('deposer', 'option', 'refuser');

-- ------------------------------------------------------------- comptes --

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role public.role not null default 'user',
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- `visitor` désigne un non-connecté : jamais attribué à un compte.
  constraint profiles_role_not_visitor check (role <> 'visitor')
);

create index profiles_role_idx on public.profiles (role);

-- ------------------------------------------------ données de référence --

create table public.pricing_zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text,
  base_price_cents integer not null check (base_price_cents between 100 and 100000),
  late_penalty_pct integer not null default 0 check (late_penalty_pct between 0 and 100),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Règles de rattachement d'une adresse à une zone, évaluées par priorité
-- croissante (voir shared/domain/pricing.ts#resolveZone).
create table public.pricing_zone_rules (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.pricing_zones (id) on delete cascade,
  priority integer not null default 100,
  rule jsonb not null check (rule ->> 'kind' in ('radius', 'polygon', 'commune', 'default')),
  created_at timestamptz not null default now()
);

create index pricing_zone_rules_zone_idx on public.pricing_zone_rules (zone_id);

create table public.criteria_blocks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  subtitle text,
  icon text not null,
  weight numeric(4, 3) not null check (weight > 0 and weight <= 1),
  position integer not null
);

create table public.criteria (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.criteria_blocks (id) on delete restrict,
  code text not null unique,
  label text not null,
  short_label text not null,
  position integer not null,
  active boolean not null default true
);

create index criteria_block_idx on public.criteria (block_id);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------- demandes --

create table public.reference_counters (
  year integer primary key,
  last_value integer not null default 0
);

create table public.visit_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references public.profiles (id) on delete restrict,
  assigned_agent_id uuid references public.profiles (id) on delete set null,
  status public.request_status not null default 'brouillon',

  listing_url text,
  address text,
  postal_code text,
  city text,
  lat double precision,
  lng double precision,
  property_type public.property_type,
  slot_at timestamptz,
  agency_name text,
  agency_phone text,
  agency_email text,
  priorities text,
  proposed_price_cents integer check (proposed_price_cents between 100 and 100000),
  consent_at timestamptz,

  zone_id uuid references public.pricing_zones (id) on delete set null,
  agreed_price_cents integer check (agreed_price_cents between 100 and 100000),
  urgent_fee_cents integer not null default 0 check (urgent_fee_cents >= 0),
  published_at timestamptz,
  payment_open_notified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint visit_requests_listing_url_http check (listing_url is null or listing_url ~* '^https?://'),
  -- Hors brouillon, une demande est complète.
  constraint visit_requests_complete_when_published check (
    status = 'brouillon'
    or (
      address is not null
      and postal_code is not null
      and city is not null
      and property_type is not null
      and slot_at is not null
      and agency_name is not null
      and agency_phone is not null
      and proposed_price_cents is not null
      and consent_at is not null
      and published_at is not null
    )
  ),
  constraint visit_requests_agreed_price_when_accepted check (
    status in ('brouillon', 'publiee', 'en_negociation', 'annulee') or agreed_price_cents is not null
  ),
  constraint visit_requests_agent_when_planned check (
    status not in ('planifiee', 'realisee', 'rapport_livre') or assigned_agent_id is not null
  )
);

create index visit_requests_user_idx on public.visit_requests (user_id);
create index visit_requests_agent_idx on public.visit_requests (assigned_agent_id);
create index visit_requests_status_idx on public.visit_requests (status);
create index visit_requests_slot_idx on public.visit_requests (slot_at);

create table public.visit_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.visit_requests (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_kind public.transition_actor not null,
  from_status public.request_status,
  to_status public.request_status not null,
  reason text,
  created_at timestamptz not null default now()
);

create index visit_request_events_request_idx on public.visit_request_events (request_id, created_at);

-- Table de transitions : miroir exact de shared/domain/stateMachine.ts.
create table public.request_transitions (
  from_status public.request_status not null,
  to_status public.request_status not null,
  actors public.transition_actor[] not null,
  primary key (from_status, to_status)
);

-- ------------------------------------------------------- négociation --

create table public.price_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.visit_requests (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_side public.party_side not null check (author_side <> 'system'),
  amount_cents integer not null check (amount_cents between 100 and 100000),
  note text check (char_length(note) <= 300),
  status public.offer_status not null default 'pending',
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index price_offers_request_idx on public.price_offers (request_id, created_at);
-- Une seule proposition en attente par demande.
create unique index price_offers_one_pending_idx on public.price_offers (request_id) where status = 'pending';

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.visit_requests (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_side public.party_side not null,
  body text not null check (char_length(body) between 1 and 2000),
  offer_id uuid references public.price_offers (id) on delete set null,
  created_at timestamptz not null default now()
);

create index messages_request_idx on public.messages (request_id, created_at);

-- ------------------------------------------------------------ paiement --

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.visit_requests (id) on delete restrict,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  status public.payment_status not null default 'pending',
  captured_cents integer not null default 0 check (captured_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  capture_before timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_request_idx on public.payments (request_id);

-- Idempotence des webhooks Stripe.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- -------------------------------------------------------------- rapport --

create table public.visit_reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.visit_requests (id) on delete restrict,
  agent_id uuid references public.profiles (id) on delete set null,
  status public.report_status not null default 'draft',
  filming_refused boolean not null default false,
  weighted_score numeric(3, 2) check (weighted_score between 1 and 5),
  global_score numeric(2, 1) check (global_score between 1 and 5),
  justification text check (char_length(justification) <= 2000),
  negotiation_points jsonb not null default '[]' check (jsonb_typeof(negotiation_points) = 'array'),
  conclusion text check (char_length(conclusion) <= 1000),
  recommendation public.recommendation,
  pdf_path text,
  pdf_size_bytes bigint,
  submitted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Notation hybride : au-delà d'un point d'écart, justification obligatoire.
  constraint visit_reports_submitted_complete check (
    status = 'draft'
    or (
      weighted_score is not null
      and global_score is not null
      and conclusion is not null
      and recommendation is not null
      and submitted_at is not null
      and (
        abs(global_score - weighted_score) <= 1
        or char_length(btrim(coalesce(justification, ''))) >= 10
      )
    )
  )
);

create table public.report_scores (
  report_id uuid not null references public.visit_reports (id) on delete cascade,
  criterion_id uuid not null references public.criteria (id) on delete restrict,
  score smallint check (score between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  primary key (report_id, criterion_id)
);

create table public.report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.visit_reports (id) on delete cascade,
  kind public.media_kind not null,
  storage_path text not null unique,
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width integer,
  height integer,
  duration_seconds numeric(6, 1),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index report_media_report_idx on public.report_media (report_id, position);

create table public.report_reserves (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.visit_reports (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  media_id uuid references public.report_media (id) on delete set null,
  position integer not null default 0
);

create index report_reserves_report_idx on public.report_reserves (report_id, position);
