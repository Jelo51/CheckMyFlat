# CheckMyFlat

Visite de logement déléguée : le client dépose une demande, négocie le prix, paie ; un visiteur se rend au rendez-vous, note 14 critères, prend photos et vidéos, et le client reçoit un rapport PDF sous 24 h.

Nuxt 4 · Supabase (auth, Postgres, Storage, RLS) · Tailwind · Stripe Checkout (capture différée) · Resend · pdfkit.
Plan, décisions et tickets ouverts : [`docs/PLAN.md`](docs/PLAN.md). Maquette de référence : [`docs/prototype.html`](docs/prototype.html).

## Prérequis

- Node 22, pnpm 10 (`corepack enable`)
- Docker (pour Supabase en local) et la [Supabase CLI](https://supabase.com/docs/guides/local-development) (fournie en dépendance : `pnpm exec supabase`)
- La [Stripe CLI](https://docs.stripe.com/stripe-cli) pour recevoir les webhooks en local

## Installation et lancement local

```bash
pnpm install
cp .env.example .env
pnpm exec supabase start          # Postgres, Auth, Storage ; applique migrations + seed
pnpm exec supabase status         # copier API URL, anon key, service_role key dans .env
stripe listen --forward-to localhost:3000/webhooks/stripe   # copier le whsec_… dans .env
pnpm dev                          # http://localhost:3000
```

Comptes de démonstration (mot de passe `motdepasse`) : `admin@checkmyflat.test`, `agent@checkmyflat.test`, `camille@exemple.test`, `hugo@exemple.test`. Le seed contient une demande dans chaque statut et un rapport livré (PDF généré à la première consultation).

Réinitialiser la base : `pnpm exec supabase db reset`. Emails d'authentification locaux : Inbucket, `http://127.0.0.1:54324`.

## Variables d'environnement

Voir [`.env.example`](.env.example). Résumé :

| Variable                                                                                     | Rôle                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_KEY`                                       | Projet Supabase (clé publique / anon)            |
| `NUXT_SUPABASE_SECRET_KEY`                                                                   | Clé service role, **serveur uniquement**         |
| `NUXT_PUBLIC_SITE_URL`                                                                       | URL publique (liens des emails, retours Stripe)  |
| `NUXT_STRIPE_SECRET_KEY`, `NUXT_STRIPE_WEBHOOK_SECRET`, `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe                                           |
| `NUXT_EMAIL_PROVIDER`                                                                        | `resend` en production, `log` (console) en local |
| `NUXT_RESEND_API_KEY`, `NUXT_EMAIL_FROM`                                                     | Resend et adresse d'expédition vérifiée          |
| `NUXT_CRON_SECRET`                                                                           | Protège `POST /api/cron/maintenance`             |

## Scripts

| Commande         | Effet                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `pnpm lint`      | ESLint + Prettier                                                                        |
| `pnpm typecheck` | `vue-tsc` via `nuxt typecheck`                                                           |
| `pnpm test`      | Vitest : machine à états, notation, tarifs et pénalités, Zod, PDF, emails, webhook       |
| `pnpm test:db`   | Policies RLS, transitions et règles métier en SQL (voir ci-dessous)                      |
| `pnpm test:e2e`  | Playwright : dépôt → négociation → paiement ; formulaire agent → rapport ; admin (+ axe) |
| `pnpm db:types`  | Régénère `app/types/database.types.ts` depuis la base locale                             |

`pnpm test:db` recrée par défaut un schéma sur un PostgreSQL nu avec une émulation minimale de Supabase (`TEST_DATABASE_URL`, par défaut `postgres://postgres:postgres@localhost:5432/cmf_test`). Contre une base Supabase locale déjà initialisée : `TEST_DB_SHIM=0 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test:db`.

Les tests E2E demandent une base Supabase fraîche (`supabase db reset`), l'application construite (`pnpm build`), et [stripe-mock](https://github.com/stripe/stripe-mock) (`NUXT_STRIPE_API_HOST=localhost NUXT_STRIPE_API_PORT=12111 NUXT_STRIPE_API_PROTOCOL=http NUXT_STRIPE_WEBHOOK_SECRET=whsec_e2e`). La CI GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) exécute l'ensemble.

## Fonctionnement

- **Machine à états** : `shared/domain/stateMachine.ts` et la table SQL `request_transitions` (identiques, vérifié par les tests). Les statuts ne changent que via `transition_request` et les RPC associées ; `payee` et `rapport_livre` sont réservés au serveur.
- **Paiement** : empreinte bancaire posée par Stripe Checkout (ouvert au plus tôt 7 jours avant la visite), capturée à la soumission du compte rendu ou avant son expiration. Annulation : empreinte libérée, pénalité de zone capturée si le client annule à moins de 24 h, ou remboursement.
- **Tâche planifiée** `payments:maintenance` (toutes les 15 min, Nitro) : offres expirées, emails d'ouverture du paiement, annulation des demandes impayées au rendez-vous, captures avant expiration, rattrapage des remboursements. Sans tâches Nitro, appeler `POST /api/cron/maintenance` avec `Authorization: Bearer $NUXT_CRON_SECRET`.
- **Médias** : bucket privé, compression des photos dans le navigateur, URL d'upload signées délivrées après contrôle du quota (paramétrable dans la grille tarifaire admin).

## Déploiement (OVH VPS ou Public Cloud)

1. Créer un projet Supabase, puis appliquer le schéma : `pnpm exec supabase link --project-ref <ref>` et `pnpm exec supabase db push` (ne pas appliquer `seed.sql` en production). Créer le premier admin : inscription normale, puis `update public.profiles set role = 'admin' where email = '…';` dans l'éditeur SQL.
2. Supabase → Authentication : URL du site et URL de redirection `https://<domaine>/**` ; SMTP personnalisé vers Resend pour les emails de confirmation et de mot de passe.
3. Stripe → Webhooks : endpoint `https://<domaine>/webhooks/stripe`, événements `checkout.session.completed`, `checkout.session.expired`, `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.canceled`, `charge.refunded`.
4. Sur le serveur (Node 22) : `pnpm install --frozen-lockfile && pnpm build`, puis lancer `node .output/server/index.mjs` avec les variables d'environnement (systemd ou PM2), derrière un reverse proxy HTTPS (Nginx/Caddy). Un seul processus : la tâche planifiée tourne dans le serveur Nitro.
