# CheckMyFlat v1 — Plan de build

Référence visuelle et fonctionnelle : [`docs/prototype.html`](./prototype.html).
Ce plan est la source de vérité pour l'avancement. Tout `TODO` dans le code doit renvoyer à une ligne de la section « Tickets ouverts ».

---

## 0. Écarts relevés entre la spec et le prototype

| # | Sujet | Spec | Prototype | Décision proposée |
|---|---|---|---|---|
| E1 | Nombre de critères | 14 | **13** (3 + 3 + 4 + 3), idem dans la vue rapport | **Bloquant, voir Q1** |
| E2 | Couleurs de base | encre `#111827`, surface `#FAFAF7`, texte 2 `#6B7280`, bordure `#E5E7EB` | `#12151A`, `#F4F5F2`, `#5C635E`, `#E2E5E1` | La spec l'emporte |
| E3 | Accent | « vert de validation », pas de hex | `#0E7A55` (hover `#0A5C40`, teinte `#E4F1EB`) | Reprendre `#0E7A55` : 5,4:1 sur blanc, texte blanc AA |
| E4 | Échelle des notes | `#DC2626 #F97316 #EAB308 #84CC16 #16A34A` | teintes plus sourdes | La spec l'emporte ; chiffres sur fond 3/4/5 en encre (le blanc n'atteint pas AA sur `#EAB308`/`#84CC16`) |
| E5 | Case prise de vue | « prise de vue refusée » (cochée = refus) | « prise de vue autorisée » (cochée par défaut) | Libellé de la spec, sémantique identique |
| E6 | KPIs admin | par statut, CA du mois, délai moyen de livraison | actives, visites semaine, encaissé, note moyenne | Spec + « note moyenne » en bonus |
| E7 | Interlocuteur de négociation | l'admin négocie | messages signés « Visiteur » | **Voir Q3** |
| E8 | Lien d'annonce | champ simple | « on récupère titre, surface, loyer automatiquement » | Hors v1 (scraping fragile et risqué juridiquement), **voir Q9** |
| E9 | Paiement | Checkout ou Payment Element | « débité maintenant, somme libérée après le rapport » | **Voir Q5** |

Polices du prototype conservées : Bricolage Grotesque (titres), Public Sans (texte), IBM Plex Mono (chiffres, références). Auto-hébergées via `@fontsource` (pas d'appel Google Fonts, RGPD).

## 1. Architecture

```
app/
  pages/            index, legal/*, auth/*, demandes/*, rapports/*, agent/*, admin/*
  layouts/          public, app (user/agent), admin
  middleware/       auth.global, role (user|agent|admin), guest
  components/       ui/ (Button, Tag, Field, RatingInput, ScoreBar, Stamp…), request/, report/, admin/
  composables/      useRequest, useDraftRequest, useMessages, useVisitForm, useScoring…
  types/            database.types.ts (généré), domain.ts
shared/             code partagé client/serveur (Nuxt 4 `shared/`)
  schemas/          Zod : request, offer, message, visitReport, pricingZone, profile
  domain/           stateMachine.ts, scoring.ts, pricing.ts, reference.ts
server/
  api/              routes Nitro (transitions, offres, paiement, rapport, admin, médias)
  routes/webhooks/  stripe.post.ts
  utils/            supabaseAdmin (service role), stripe, pdf/, notifier/
supabase/
  migrations/       SQL versionné
  seed.sql
  tests/            tests pgTAP des policies RLS
tests/
  unit/             Vitest
  e2e/              Playwright
```

Principes :
- **Machine à états unique** dans `shared/domain/stateMachine.ts` (table de transitions + rôles autorisés), miroir exact d'une fonction Postgres `transition_request(id, to, reason)` `SECURITY DEFINER` qui vérifie la transition, le rôle et journalise dans `visit_request_events`. Un test Vitest vérifie que la table TS et la table SQL sont identiques (la SQL est générée depuis la TS ou comparée au seed de la table `request_transitions`).
- **Statut `payee` uniquement posé par le webhook Stripe** (service role), jamais exposé au client : la transition `acceptee → payee` est marquée `system_only`.
- **Rôles découplés des capacités** : les policies d'agent reposent sur `visit_requests.assigned_agent_id = auth.uid()`, pas sur `role = 'admin'`. Un admin agit comme agent en s'assignant. En v2, un `user` promu `agent` fonctionne sans changement de policies.
- **Service role** : seulement dans `server/utils/supabaseAdmin.ts` ; lint rule `no-restricted-imports` pour l'interdire hors `server/`.

## 2. Modèle de données (résumé)

Enums : `role` (visitor, user, agent, admin — `visitor` n'est jamais stocké en base puisqu'il désigne un non-connecté, mais l'enum le contient comme demandé), `request_status`, `property_type`, `offer_status`, `payment_status`, `media_kind`, `recommendation`.

| Table | Points clés |
|---|---|
| `profiles` | `id = auth.users.id`, `role`, nom, téléphone, `suspended_at`, trigger `on_auth_user_created` |
| `pricing_zones` | code, libellé, prix plancher (centimes), règle de rattachement (liste de départements), `active` |
| `visit_requests` | `reference` `CMF-AAAA-NNNN` (séquence annuelle), `user_id`, `assigned_agent_id`, `status`, adresse, code postal, ville, `zone_id`, `property_type`, `listing_url`, `slot_at` (timestamptz, Europe/Paris), contact agence (nom, tel, email), `priorities`, `proposed_price_cents`, `agreed_price_cents`, `consent_at`, `deleted_at` |
| `visit_request_events` | `request_id`, `actor_id` (null = système), `from_status`, `to_status`, `reason`, `created_at` |
| `price_offers` | `request_id`, `author_id`, `amount_cents`, `note`, `status` (pending/accepted/rejected/superseded/expired), `expires_at` |
| `messages` | `request_id`, `author_id`, `body`, `offer_id` nullable (un message peut porter une offre) |
| `payments` | `request_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `amount_cents`, `status`, `refunded_cents`, `stripe_refund_id` |
| `stripe_events` | `id` (event Stripe), `processed_at` — idempotence des webhooks |
| `criteria_blocks` | code, libellé, `weight` (numeric, somme = 1, contrainte vérifiée par trigger), `position`, icône Lucide |
| `criteria` | `block_id`, code, libellé long (formulaire), libellé court (rapport), `position`, `active` |
| `visit_reports` | `request_id` unique, `agent_id`, `status` (draft/submitted), `filming_refused`, `weighted_score`, `global_score`, `justification`, `negotiation_points` jsonb[], `conclusion`, `recommendation`, `pdf_path`, `submitted_at`, `delivered_at` |
| `report_scores` | `report_id`, `criterion_id`, `score` 1–5, `comment` |
| `report_reserves` | `report_id`, `text`, `media_id` nullable (réserve avec photo) |
| `report_media` | `report_id`, `kind`, `storage_path`, `size_bytes`, `mime`, `position` |
| `app_settings` | `max_media_bytes_per_visit`, etc. |

Storage : buckets privés `report-media` et `report-pdf`, chemins `{request_id}/…`, policies Storage calquées sur celles de `visit_reports`, lecture par URL signée (durée courte).

RLS (toutes tables, `force row level security`) :
- user : ses propres demandes/messages/offres/paiements/rapports livrés, jamais ceux des autres.
- agent : uniquement les demandes où `assigned_agent_id = auth.uid()` et leur rapport ; aucune lecture de `profiles` autres que le propriétaire de la demande assignée (nom + contact limités via vue).
- admin : tout, via `is_admin()` `SECURITY DEFINER STABLE`.
- Tables de référence (`criteria*`, `pricing_zones`) : lecture publique, écriture admin.
- Écritures de statut : jamais par `UPDATE` direct, seulement via `transition_request`.
- Tests pgTAP dans `supabase/tests/` lancés par `supabase test db`.

## 3. Machine à états

```
brouillon → publiee → en_negociation → acceptee → payee → planifiee → realisee → rapport_livre
annulee  : depuis tout état avant realisee
litige   : depuis realisee ou rapport_livre
```

| De → Vers | Acteur | Effet de bord |
|---|---|---|
| brouillon → publiee | user propriétaire | calcul zone, notification admin |
| publiee → en_negociation | admin (1re contre-offre) ou automatique à la 1re offre non propriétaire | email « nouvelle proposition » |
| en_negociation → acceptee | partie qui accepte l'offre en cours | création session Stripe Checkout |
| publiee → acceptee | admin accepte le prix proposé tel quel | idem |
| acceptee → payee | **système (webhook)** | email « paiement confirmé » |
| payee → planifiee | admin (assignation agent) | email agent « visite assignée » |
| planifiee → realisee | agent assigné (soumission formulaire) | lancement génération PDF |
| realisee → rapport_livre | système (PDF généré) | email « rapport livré » |
| * → annulee | user (avant payee sans frais, après : remboursement), admin | remboursement auto si payé, email |
| realisee/rapport_livre → litige | user ou admin | notification admin |

Modification de la demande : `brouillon`, `publiee`, `en_negociation` (policy + trigger `BEFORE UPDATE`). Suppression : hard delete si aucun paiement, sinon `deleted_at`.
Tests Vitest : produit cartésien de tous les états × tous les états × tous les rôles.

## 4. Notation hybride

- `blockAverage = moyenne des critères notés du bloc`
- `weighted = Σ blockAverage × weight` (poids lus en base)
- Justification obligatoire si `|global − weighted| > 1` (strictement supérieur), validée par le même schéma Zod côté client et dans la route Nitro, plus une contrainte `CHECK` en base.
- Arrondi d'affichage à 0,1 avec virgule française ; stockage `numeric(3,2)`.
- Soumission impossible tant que les 14 critères ne sont pas notés.

## 5. Choix techniques proposés

| Besoin | Choix | Raison |
|---|---|---|
| Gestionnaire de paquets | pnpm | disponible, rapide, lockfile strict |
| PDF | `pdfkit` en route Nitro | pur JS, pas de Chromium : fonctionne sur tout hébergeur Node/serverless |
| Compression images client | `browser-image-compression` | WebWorker, EXIF orientation |
| Paiement | Stripe Checkout (hébergé) | moins de surface PCI, SCA gérée |
| Emails | interface `Notifier` + adaptateur (voir Q6) ; adaptateur `log` en dev | changement de fournisseur/SMS sans toucher le métier |
| Templates email | fonctions TS → HTML simple + texte brut | pas de dépendance lourde |
| Tests RLS | pgTAP via `supabase test db` | standard Supabase |
| Tests E2E | Playwright contre Supabase local + Stripe en mode test (webhook simulé par signature de test) | déterministe en CI |
| Date/heure | stockage UTC, affichage `Europe/Paris` via `Intl` | |

## 6. Phases

| # | Phase | Livrables | État |
|---|---|---|---|
| 1 | Setup | Nuxt 4, TS strict, Tailwind + tokens, ESLint/Prettier, Vitest, layouts public/app/admin, composants UI de base | à faire |
| 2 | BDD | migrations, RLS, fonctions `transition_request`, seed, types générés, tests pgTAP | à faire |
| 3 | Auth | inscription/connexion/mot de passe oublié, middlewares rôle, brouillon visiteur (localStorage → `brouillon` en base après inscription) | à faire |
| 4 | Public | landing complète, pages légales (structure), 404 | à faire |
| 5 | User | Mes demandes, nouvelle demande, détail + messagerie + offres structurées, édition, annulation | à faire |
| 6 | Stripe | Checkout, webhook signé idempotent, remboursements auto | à faire |
| 7 | Agent | Mes visites, formulaire mobile, autosave, médias, notation hybride | à faire |
| 8 | PDF | génération pdfkit, stockage, Mes rapports, vue rapport en ligne | à faire |
| 9 | Admin | file + KPIs + filtres, négociation, assignation, utilisateurs CRUD, grille tarifaire | à faire |
| 10 | Notifications | couche `Notifier`, 5 emails transactionnels | à faire |
| 11 | Qualité | Playwright ×3 parcours, passe a11y (axe), README | à faire |

Chaque phase se termine par : `pnpm lint && pnpm typecheck && pnpm test` au vert, puis un commit.

### Contraintes de l'environnement de build
- Le démon Docker n'est pas disponible dans le conteneur de développement actuel : la Supabase CLI locale (`supabase start`) ne peut pas y tourner. PostgreSQL 16 est en revanche installé : les migrations et tests de policies seront exécutés contre ce Postgres avec un schéma `auth` minimal simulé, et les types seront générés depuis ce schéma. Le README documentera la voie standard (`supabase start`, `supabase test db`, `supabase gen types`).
- Pas de Stripe CLI : les webhooks seront testés en signant localement des payloads avec `stripe.webhooks.generateTestHeaderString`.

## 7. Questions ouvertes

Voir la section « Questions bloquantes » envoyée dans la conversation ; les réponses seront reportées ici.

## 8. Tickets ouverts

_Aucun pour l'instant._
