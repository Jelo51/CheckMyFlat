-- CheckMyFlat — données de démonstration (développement uniquement)
-- Comptes (mot de passe commun : motdepasse) :
--   admin@checkmyflat.test   admin
--   agent@checkmyflat.test   agent
--   camille@exemple.test     user
--   hugo@exemple.test        user
-- Une demande dans chaque statut, et un rapport livré (le PDF est généré à
-- la première consultation).

-- ------------------------------------------------------------- comptes --

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id::uuid,
  'authenticated',
  'authenticated',
  u.email,
  extensions.crypt('motdepasse', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', u.full_name),
  '', '', '', '',
  now() - interval '30 days',
  now()
from (values
  ('00000000-0000-4000-a000-000000000001', 'admin@checkmyflat.test', 'Claire Admin'),
  ('00000000-0000-4000-a000-000000000002', 'agent@checkmyflat.test', 'Julien Visiteur'),
  ('00000000-0000-4000-a000-000000000003', 'camille@exemple.test', 'Camille Martin'),
  ('00000000-0000-4000-a000-000000000004', 'hugo@exemple.test', 'Hugo Bernard')
) as u (id, email, full_name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email like '%.test';

update public.profiles set role = 'admin', phone = '06 00 00 00 01' where id = '00000000-0000-4000-a000-000000000001';
update public.profiles set role = 'agent', phone = '06 00 00 00 02' where id = '00000000-0000-4000-a000-000000000002';
update public.profiles set phone = '06 00 00 00 03' where id = '00000000-0000-4000-a000-000000000003';

-- ------------------------------------------------------------ demandes --

-- Fait avancer une demande le long d'un chemin, en journalisant chaque étape.
create function pg_temp.walk(p_request uuid, p_path public.request_status[], p_actors public.transition_actor[], p_reason text default null)
returns void
language plpgsql
as $$
declare
  i integer;
  v_from public.request_status;
begin
  perform set_config('cmf.in_transition', 'on', true);
  for i in 1 .. array_length(p_path, 1) loop
    select status into v_from from public.visit_requests where id = p_request;
    update public.visit_requests set status = p_path[i] where id = p_request;
    insert into public.visit_request_events (request_id, actor_id, actor_kind, from_status, to_status, reason, created_at)
    values (
      p_request,
      case p_actors[i]
        when 'admin' then '00000000-0000-4000-a000-000000000001'::uuid
        when 'assigned_agent' then '00000000-0000-4000-a000-000000000002'::uuid
        when 'owner' then (select user_id from public.visit_requests where id = p_request)
      end,
      p_actors[i],
      v_from,
      p_path[i],
      case when i = array_length(p_path, 1) then p_reason end,
      now() - make_interval(mins => (array_length(p_path, 1) - i) * 30)
    );
  end loop;
  perform set_config('cmf.in_transition', 'off', true);
end;
$$;

insert into public.visit_requests (
  id, user_id, listing_url, address, postal_code, city, lat, lng, property_type, slot_at,
  agency_name, agency_phone, agency_email, priorities, proposed_price_cents, consent_at,
  zone_id, agreed_price_cents, urgent_fee_cents, published_at, assigned_agent_id
)
select
  r.id::uuid, r.user_id::uuid, r.listing_url, r.address, r.postal_code, r.city, r.lat, r.lng,
  r.property_type::public.property_type, now() + r.slot_offset, r.agency_name, r.agency_phone, null, r.priorities,
  r.proposed, case when r.proposed is null then null else now() - interval '3 days' end,
  (select id from public.pricing_zones where code = r.zone), r.agreed, r.urgent,
  case when r.proposed is null then null else now() - interval '3 days' end,
  r.agent::uuid
from (values
  -- brouillon
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', null,
   '5 rue Chanzy', '51100', 'Reims', null::float8, null::float8, 't1', interval '20 days',
   null, null, null, null::int, null, null::int, 0, null),
  -- publiée
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003', 'https://www.leboncoin.fr/ad/locations/2000000002',
   '12 rue de Vesle', '51100', 'Reims', 49.2547, 4.0266, 'studio', interval '10 days',
   'Agence du Parvis — Mme Leroy', '03 26 00 00 02', 'Bruit de la rue, état des fenêtres.', 700, 'z1', null, 0, null),
  -- en négociation
  ('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000003', 'https://www.seloger.com/annonces/locations/2000000003',
   '40 avenue de Laon', '51100', 'Reims', 49.2672, 4.0290, 't3', interval '5 days',
   'Foncia Reims — M. Diallo', '03 26 00 00 03', 'État de la salle de bains, débit fibre, local vélo.', 800, 'z2', null, 0, null),
  -- prix accepté (paiement ouvert à J-7)
  ('10000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000004', 'https://www.pap.fr/annonces/2000000004',
   '3 rue du Docteur Schweitzer', '51100', 'Reims', 49.2395, 4.0070, 't2', interval '12 days',
   'Propriétaire — M. Petit', '06 12 00 00 04', 'Sécurité de l''accès, parking.', 1400, 'z3', 1400, 0, null),
  -- payée
  ('10000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000004', 'https://www.leboncoin.fr/ad/locations/2000000005',
   '18 rue Gambetta', '51100', 'Reims', 49.2500, 4.0370, 't2', interval '3 days',
   'Agence Gambetta — Mme Moreau', '03 26 00 00 05', 'Humidité dans la chambre.', 700, 'z1', 700, 0, null),
  -- planifiée
  ('10000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000003', 'https://www.seloger.com/annonces/locations/2000000006',
   '9 rue Pasteur', '51450', 'Bétheny', 49.2790, 4.0540, 'maison', interval '1 day 2 hours',
   'Orpi Bétheny — M. Garnier', '03 26 00 00 06', 'Jardin, état de la toiture, chauffage.', 1900, 'z4', 1900, 500, '00000000-0000-4000-a000-000000000002'),
  -- visitée (compte rendu soumis, PDF en attente)
  ('10000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000004', 'https://www.leboncoin.fr/ad/locations/2000000007',
   '27 boulevard de la Paix', '51100', 'Reims', 49.2555, 4.0420, 't4', interval '-1 day',
   'Agence de la Paix — Mme Roux', '03 26 00 00 07', 'Isolation phonique.', 700, 'z1', 700, 0, '00000000-0000-4000-a000-000000000002'),
  -- rapport livré
  ('10000000-0000-4000-a000-000000000008', '00000000-0000-4000-a000-000000000003', 'https://www.seloger.com/annonces/locations/2000000008',
   '34 rue Chanzy', '51100', 'Reims', 49.2530, 4.0320, 't2', interval '-5 days',
   'Agence Chanzy — M. Lambert', '03 26 00 00 08', 'Bruit du boulevard depuis la chambre, état de la salle de bains, local vélo.', 700, 'z1', 700, 0, '00000000-0000-4000-a000-000000000002'),
  -- annulée après paiement, remboursée
  ('10000000-0000-4000-a000-000000000009', '00000000-0000-4000-a000-000000000004', 'https://www.pap.fr/annonces/2000000009',
   '6 rue des Capucins', '51100', 'Reims', 49.2510, 4.0300, 'studio', interval '4 days',
   'Propriétaire — Mme Faure', '06 12 00 00 09', null, 700, 'z1', 700, 0, null),
  -- litige
  ('10000000-0000-4000-a000-000000000010', '00000000-0000-4000-a000-000000000003', 'https://www.leboncoin.fr/ad/locations/2000000010',
   '2 place Aristide Briand', '51490', 'Cormontreuil', 49.2200, 4.0500, 't3', interval '-10 days',
   'Agence Cormontreuil — M. Blanc', '03 26 00 00 10', 'Cave, parties communes.', 1400, 'z3', 1400, 0, '00000000-0000-4000-a000-000000000002')
) as r (id, user_id, listing_url, address, postal_code, city, lat, lng, property_type, slot_offset,
        agency_name, agency_phone, priorities, proposed, zone, agreed, urgent, agent);

select pg_temp.walk('10000000-0000-4000-a000-000000000002', '{publiee}', '{owner}');
select pg_temp.walk('10000000-0000-4000-a000-000000000003', '{publiee,en_negociation}', '{owner,admin}', 'Nouvelle proposition de prix');
select pg_temp.walk('10000000-0000-4000-a000-000000000004', '{publiee,acceptee}', '{owner,admin}', 'Proposition acceptée');
select pg_temp.walk('10000000-0000-4000-a000-000000000005', '{publiee,acceptee,payee}', '{owner,admin,system}');
select pg_temp.walk('10000000-0000-4000-a000-000000000006', '{publiee,en_negociation,acceptee,payee,planifiee}', '{owner,admin,owner,system,admin}', 'Agent assigné');
select pg_temp.walk('10000000-0000-4000-a000-000000000007', '{publiee,acceptee,payee,planifiee,realisee}', '{owner,admin,system,admin,assigned_agent}', 'Compte rendu soumis');
select pg_temp.walk('10000000-0000-4000-a000-000000000008', '{publiee,acceptee,payee,planifiee,realisee,rapport_livre}', '{owner,admin,system,admin,assigned_agent,system}');
select pg_temp.walk('10000000-0000-4000-a000-000000000009', '{publiee,acceptee,payee,annulee}', '{owner,admin,system,admin}', 'Logement déjà loué, annulation par l''agence');
select pg_temp.walk('10000000-0000-4000-a000-000000000010', '{publiee,acceptee,payee,planifiee,realisee,rapport_livre,litige}', '{owner,admin,system,admin,assigned_agent,system,owner}', 'La cave annoncée n''a pas été visitée.');

-- --------------------------------------------------------- négociation --

insert into public.price_offers (request_id, author_id, author_side, amount_cents, note, status, expires_at, responded_at, created_at)
values
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003', 'client', 700, null, 'pending', now() + interval '1 day', null, now() - interval '1 day'),
  ('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000003', 'client', 800, null, 'superseded', now() - interval '1 day', now() - interval '2 hours', now() - interval '3 days'),
  ('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', 'checkmyflat', 1000,
   'L''avenue de Laon est en zone 2 : les visites y partent de 10 €.', 'pending', now() + interval '46 hours', null, now() - interval '2 hours');

insert into public.messages (request_id, author_id, author_side, body, offer_id, created_at)
select o.request_id, o.author_id, o.author_side, coalesce(o.note, 'Demande publiée avec ce prix.'), o.id, o.created_at
from public.price_offers o;

insert into public.messages (request_id, author_id, author_side, body, created_at) values
  ('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000003', 'client',
   'Bonjour, l''agence est prévenue, le rendez-vous est calé. Je peux monter un peu si besoin.', now() - interval '3 hours');

-- ------------------------------------------------------------ paiements --

insert into public.payments (request_id, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, status, captured_cents, refunded_cents, capture_before)
values
  ('10000000-0000-4000-a000-000000000005', 'cs_seed_5', 'pi_seed_5', 700, 'authorized', 0, 0, now() + interval '5 days'),
  ('10000000-0000-4000-a000-000000000006', 'cs_seed_6', 'pi_seed_6', 2400, 'authorized', 0, 0, now() + interval '4 days'),
  ('10000000-0000-4000-a000-000000000007', 'cs_seed_7', 'pi_seed_7', 700, 'captured', 700, 0, null),
  ('10000000-0000-4000-a000-000000000008', 'cs_seed_8', 'pi_seed_8', 700, 'captured', 700, 0, null),
  ('10000000-0000-4000-a000-000000000009', 'cs_seed_9', 'pi_seed_9', 700, 'canceled', 0, 0, null),
  ('10000000-0000-4000-a000-000000000010', 'cs_seed_10', 'pi_seed_10', 1400, 'captured', 1400, 0, null);

-- ------------------------------------------------------------- rapports --

insert into public.visit_reports (
  id, request_id, agent_id, status, filming_refused, weighted_score, global_score, justification,
  negotiation_points, conclusion, recommendation, submitted_at, delivered_at
)
values
  ('20000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000002',
   'draft', false, null, null, null, '[]', null, null, null, null),
  ('20000000-0000-4000-a000-000000000007', '10000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000002',
   'submitted', true, 3.60, 3.5, null,
   '["Double vitrage à prévoir côté boulevard"]',
   'Grand appartement lumineux mais bruyant côté boulevard.', 'option', now() - interval '20 hours', null),
  ('20000000-0000-4000-a000-000000000008', '10000000-0000-4000-a000-000000000008', '00000000-0000-4000-a000-000000000002',
   'submitted', true, 3.83, 4.0, null,
   '["Reprise de la peinture du séjour (traces d''humidité sèches derrière le radiateur)", "Remplacement du joint de douche", "Pose d''une prise supplémentaire dans la chambre"]',
   'Logement conforme à l''annonce, bien situé. Le local vélo annoncé n''existe pas : les vélos sont stockés dans le hall.',
   'deposer', now() - interval '5 days' + interval '3 hours', now() - interval '5 days' + interval '4 hours'),
  ('20000000-0000-4000-a000-000000000010', '10000000-0000-4000-a000-000000000010', '00000000-0000-4000-a000-000000000002',
   'submitted', true, 3.15, 3.0, null, '[]',
   'Appartement correct, parties communes vieillissantes.', 'option', now() - interval '10 days' + interval '3 hours', now() - interval '10 days' + interval '4 hours');

-- Notes : visite 6 en cours (5 critères), 7, 8 et 10 complètes.
insert into public.report_scores (report_id, criterion_id, score, comment)
select rep.id, c.id, s.score, s.comment
from (values
  ('20000000-0000-4000-a000-000000000006', 'proximite_services', 4, null),
  ('20000000-0000-4000-a000-000000000006', 'bruit_securite', 5, 'Rue calme'),
  ('20000000-0000-4000-a000-000000000006', 'stationnement', 5, null),
  ('20000000-0000-4000-a000-000000000006', 'luminosite', 3, null),
  ('20000000-0000-4000-a000-000000000006', 'etat_surfaces', 4, null),

  ('20000000-0000-4000-a000-000000000007', 'proximite_services', 5, null),
  ('20000000-0000-4000-a000-000000000007', 'bruit_securite', 2, 'Boulevard très passant'),
  ('20000000-0000-4000-a000-000000000007', 'stationnement', 3, null),
  ('20000000-0000-4000-a000-000000000007', 'luminosite', 5, null),
  ('20000000-0000-4000-a000-000000000007', 'etat_surfaces', 4, null),
  ('20000000-0000-4000-a000-000000000007', 'isolation', 2, 'Simple vitrage côté rue'),
  ('20000000-0000-4000-a000-000000000007', 'surface_conforme', 4, null),
  ('20000000-0000-4000-a000-000000000007', 'cuisine', 4, null),
  ('20000000-0000-4000-a000-000000000007', 'salle_de_bains', 4, null),
  ('20000000-0000-4000-a000-000000000007', 'rangements', 4, null),
  ('20000000-0000-4000-a000-000000000007', 'electricite_fibre', 3, null),
  ('20000000-0000-4000-a000-000000000007', 'parties_communes', 4, null),
  ('20000000-0000-4000-a000-000000000007', 'securite_acces', 4, null),
  ('20000000-0000-4000-a000-000000000007', 'annexes', 3, null),

  ('20000000-0000-4000-a000-000000000008', 'proximite_services', 5, 'Tram à 3 minutes, halles du Boulingrin à 10 minutes'),
  ('20000000-0000-4000-a000-000000000008', 'bruit_securite', 4, null),
  ('20000000-0000-4000-a000-000000000008', 'stationnement', 5, null),
  ('20000000-0000-4000-a000-000000000008', 'luminosite', 5, 'Double exposition est-ouest'),
  ('20000000-0000-4000-a000-000000000008', 'etat_surfaces', 3, 'Traces d''humidité sèches derrière le radiateur du séjour'),
  ('20000000-0000-4000-a000-000000000008', 'isolation', 4, null),
  ('20000000-0000-4000-a000-000000000008', 'surface_conforme', 4, null),
  ('20000000-0000-4000-a000-000000000008', 'cuisine', 4, null),
  ('20000000-0000-4000-a000-000000000008', 'salle_de_bains', 3, 'Joint de douche noirci'),
  ('20000000-0000-4000-a000-000000000008', 'rangements', 4, null),
  ('20000000-0000-4000-a000-000000000008', 'electricite_fibre', 5, 'Fibre raccordée'),
  ('20000000-0000-4000-a000-000000000008', 'parties_communes', 3, null),
  ('20000000-0000-4000-a000-000000000008', 'securite_acces', 4, null),
  ('20000000-0000-4000-a000-000000000008', 'annexes', 2, 'Pas de local vélo'),

  ('20000000-0000-4000-a000-000000000010', 'proximite_services', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'bruit_securite', 4, null),
  ('20000000-0000-4000-a000-000000000010', 'stationnement', 4, null),
  ('20000000-0000-4000-a000-000000000010', 'luminosite', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'etat_surfaces', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'isolation', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'surface_conforme', 4, null),
  ('20000000-0000-4000-a000-000000000010', 'cuisine', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'salle_de_bains', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'rangements', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'electricite_fibre', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'parties_communes', 2, 'Cage d''escalier à rafraîchir'),
  ('20000000-0000-4000-a000-000000000010', 'securite_acces', 3, null),
  ('20000000-0000-4000-a000-000000000010', 'annexes', 3, null)
) as s (report_id, code, score, comment)
join public.visit_reports rep on rep.id = s.report_id::uuid
join public.criteria c on c.code = s.code;

-- Moyennes pondérées cohérentes avec les notes saisies.
update public.visit_reports
set weighted_score = public.report_weighted_score(id)
where status = 'submitted';

insert into public.report_reserves (report_id, text, position) values
  ('20000000-0000-4000-a000-000000000008', 'Rayure profonde sur le parquet à l''entrée du séjour', 1),
  ('20000000-0000-4000-a000-000000000008', 'Volet roulant de la chambre bloqué à mi-course', 2),
  ('20000000-0000-4000-a000-000000000008', 'Trace jaune au plafond de la salle de bains', 3);
