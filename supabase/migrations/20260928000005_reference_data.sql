-- CheckMyFlat — données de référence (nécessaires en production)
-- Transitions, critères de visite, zones tarifaires de Reims, paramètres.

-- -------------------------------------------------------- transitions --
-- Miroir exact de shared/domain/stateMachine.ts (vérifié par tests/db).

insert into public.request_transitions (from_status, to_status, actors) values
  ('brouillon', 'publiee', '{owner}'),
  ('publiee', 'en_negociation', '{owner,admin}'),
  ('publiee', 'acceptee', '{admin}'),
  ('en_negociation', 'acceptee', '{owner,admin}'),
  ('acceptee', 'payee', '{system}'),
  ('payee', 'planifiee', '{admin}'),
  ('planifiee', 'realisee', '{assigned_agent}'),
  ('realisee', 'rapport_livre', '{system}'),
  ('brouillon', 'annulee', '{owner,admin}'),
  ('publiee', 'annulee', '{owner,admin}'),
  ('en_negociation', 'annulee', '{owner,admin}'),
  ('acceptee', 'annulee', '{owner,admin,system}'),
  ('payee', 'annulee', '{owner,admin}'),
  ('planifiee', 'annulee', '{owner,admin,assigned_agent}'),
  ('realisee', 'litige', '{owner,admin}'),
  ('rapport_livre', 'litige', '{owner,admin}');

-- ---------------------------------------------------------- paramètres --

insert into public.app_settings (key, value, description) values
  ('max_media_bytes_per_visit', '524288000', 'Volume maximal de médias par visite (octets)'),
  ('max_video_seconds', '120', 'Durée maximale d''une vidéo (secondes)'),
  ('image_max_dimension', '2560', 'Plus grand côté des photos après compression (pixels)'),
  ('urgent_fee_cents', '500', 'Supplément visite sous 48 h (centimes)'),
  ('urgent_window_hours', '48', 'Délai en deçà duquel le supplément s''applique (heures)'),
  ('offer_validity_hours', '48', 'Validité d''une proposition de prix (heures)'),
  ('payment_window_days', '7', 'Ouverture du paiement avant le créneau (jours)'),
  ('late_cancel_window_hours', '24', 'Annulation tardive par le client (heures avant le créneau)');

-- ------------------------------------------------------------ critères --

with blocks as (
  insert into public.criteria_blocks (code, label, subtitle, icon, weight, position) values
    ('localisation', 'Localisation et environnement', 'Transports, bruit, stationnement', 'map-pin', 0.25, 1),
    ('qualite', 'Qualité globale du logement', 'Luminosité, surfaces, isolation', 'sun', 0.30, 2),
    ('agencement', 'Agencement et vie au quotidien', 'Cuisine, salle de bains, rangements', 'layout-panel-left', 0.25, 3),
    ('immeuble', 'Immeuble et annexes', 'Parties communes, accès, cave', 'building-2', 0.20, 4)
  returning id, code
)
insert into public.criteria (block_id, code, label, short_label, position)
select b.id, c.code, c.label, c.short_label, c.position
from blocks b
join (values
  ('localisation', 'proximite_services', 'Proximité des transports, commerces et services', 'Proximité des transports, commerces et services', 1),
  ('localisation', 'bruit_securite', 'Niveau sonore extérieur et sécurité du quartier', 'Niveau sonore extérieur et sécurité du quartier', 2),
  ('localisation', 'stationnement', 'Facilité de stationnement ou accès aux transports doux', 'Stationnement et accès aux transports doux', 3),
  ('qualite', 'luminosite', 'Luminosité et exposition', 'Luminosité et exposition', 4),
  ('qualite', 'etat_surfaces', 'État général des surfaces (peintures, sols, propreté, moisissures)', 'État général des surfaces', 5),
  ('qualite', 'isolation', 'Isolation thermique et phonique (fenêtres, vitrage)', 'Isolation thermique et phonique', 6),
  ('qualite', 'surface_conforme', 'Surface réelle conforme à l''annonce', 'Surface réelle conforme à l''annonce', 7),
  ('agencement', 'cuisine', 'Équipements de la cuisine (meubles, électroménager)', 'Équipements de la cuisine', 8),
  ('agencement', 'salle_de_bains', 'État et fonctionnalité de la salle de bains / WC', 'Salle de bains et WC', 9),
  ('agencement', 'rangements', 'Capacité de rangement (placards, penderies)', 'Capacité de rangement', 10),
  ('agencement', 'electricite_fibre', 'Prises électriques et connexion fibre', 'Prises électriques et connexion fibre', 11),
  ('immeuble', 'parties_communes', 'État et propreté des parties communes', 'Parties communes', 12),
  ('immeuble', 'securite_acces', 'Sécurité de l''accès (interphone, badge, digicode)', 'Sécurité de l''accès', 13),
  ('immeuble', 'annexes', 'Cave, balcon, local vélo ou poubelles', 'Cave, balcon, local vélo ou poubelles', 14)
) as c (block_code, code, label, short_label, position) on c.block_code = b.code;

-- -------------------------------------------------------- zones (Reims) --
-- Centre de Reims : entre la cathédrale et l'hôtel de ville. Règles évaluées
-- par priorité croissante ; modifiables dans la grille tarifaire admin.

with zones as (
  insert into public.pricing_zones (code, label, description, base_price_cents, late_penalty_pct, position) values
    ('z1', 'Zone 1 — Centre-ville', 'Reims centre, dans un rayon de 1 km', 700, 0, 1),
    ('z2', 'Zone 2 — Reims proche', 'Reims, dans un rayon de 2 km du centre', 1000, 10, 2),
    ('z3', 'Zone 3 — Croix-Rouge, Cormontreuil', 'Croix-Rouge, Cormontreuil et le reste de Reims', 1400, 20, 3),
    ('z4', 'Zone 4 — Thillois, Bétheny, hors Reims', 'Thillois, Bétheny et toute autre commune', 1900, 35, 4)
  returning id, code
)
insert into public.pricing_zone_rules (zone_id, priority, rule)
select z.id, r.priority, r.rule::jsonb
from zones z
join (values
  ('z1', 10, '{"kind":"radius","center":{"lat":49.2560,"lng":4.0325},"radiusKm":1,"communes":["Reims"]}'),
  ('z3', 15, '{"kind":"polygon","polygon":[{"lat":49.2465,"lng":3.9980},{"lat":49.2465,"lng":4.0200},{"lat":49.2330,"lng":4.0260},{"lat":49.2270,"lng":4.0120},{"lat":49.2300,"lng":3.9950}]}'),
  ('z2', 20, '{"kind":"radius","center":{"lat":49.2560,"lng":4.0325},"radiusKm":2,"communes":["Reims"]}'),
  ('z3', 30, '{"kind":"commune","communes":["Cormontreuil"]}'),
  ('z4', 40, '{"kind":"commune","communes":["Thillois","Bétheny"]}'),
  ('z3', 50, '{"kind":"commune","communes":["Reims"]}'),
  ('z4', 100, '{"kind":"default"}')
) as r (zone_code, priority, rule) on r.zone_code = z.code;
