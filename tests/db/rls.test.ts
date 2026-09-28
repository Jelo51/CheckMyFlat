import { afterAll, describe, expect, it } from 'vitest'
import { closePool, IDS, PERMISSION_DENIED, tx } from './helpers'

afterAll(closePool)

const camille = { uid: IDS.camille }
const hugo = { uid: IDS.hugo }
const agent = { uid: IDS.agent }
const admin = { uid: IDS.admin }

const CAMILLE_REQUESTS = [1, 2, 3, 6, 8, 10].map(IDS.req)
const HUGO_REQUESTS = [4, 5, 7, 9].map(IDS.req)

async function ids(db: Parameters<Parameters<typeof tx>[0]>[0], sql: string, params: unknown[] = []) {
  return (await db.query<{ id: string }>(sql, params)).map((r) => r.id).sort()
}

describe('RLS — demandes', () => {
  it('un client ne lit que ses propres demandes', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await ids(db, 'select id from public.visit_requests')).toEqual([...CAMILLE_REQUESTS].sort())
      await db.as(hugo)
      expect(await ids(db, 'select id from public.visit_requests')).toEqual([...HUGO_REQUESTS].sort())
    })
  })

  it('un client ne lit jamais la demande d’un autre, même par identifiant', async () => {
    await tx(async (db) => {
      await db.as(hugo)
      expect(await db.query('select * from public.visit_requests where id = $1', [IDS.req(8)])).toEqual([])
    })
  })

  it('un agent ne lit que ses visites assignées, à partir de la planification', async () => {
    await tx(async (db) => {
      await db.as(agent)
      expect(await ids(db, 'select id from public.visit_requests')).toEqual([6, 7, 8, 10].map(IDS.req).sort())
    })
  })

  it('un agent non assigné ne voit rien', async () => {
    await tx(async (db) => {
      await db.as('service')
      await db.query(`update public.profiles set role = 'agent' where id = $1`, [IDS.hugo])
      await db.as(hugo)
      const seen = await ids(db, 'select id from public.visit_requests')
      expect(seen).toEqual([...HUGO_REQUESTS].sort())
    })
  })

  it('un admin lit tout', async () => {
    await tx(async (db) => {
      await db.as(admin)
      expect((await db.query('select id from public.visit_requests')).length).toBe(10)
    })
  })

  it('un visiteur non connecté ne lit aucune demande mais voit les tarifs', async () => {
    await tx(async (db) => {
      await db.as('anon')
      expect(await db.errorCode('select * from public.visit_requests')).toBe(PERMISSION_DENIED)
      expect((await db.query('select * from public.pricing_zones')).length).toBe(4)
      expect((await db.query('select * from public.criteria')).length).toBe(14)
    })
  })

  it('un client ne peut pas créer une demande au nom d’un autre', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(
        await db.errorCode(`insert into public.visit_requests (user_id, city) values ($1, 'Reims')`, [
          IDS.hugo,
        ]),
      ).toBe(PERMISSION_DENIED)
      const own = await db.one<{ user_id: string; status: string }>(
        `insert into public.visit_requests (city) values ('Reims') returning user_id, status`,
      )
      expect(own).toEqual({ user_id: IDS.camille, status: 'brouillon' })
    })
  })

  it('un client modifie sa demande en brouillon, publiée ou en négociation, plus après', async () => {
    await tx(async (db) => {
      await db.as(camille)
      for (const n of [1, 2, 3]) {
        const rows = await db.query(
          `update public.visit_requests set priorities = 'x' where id = $1 returning id`,
          [IDS.req(n)],
        )
        expect(rows.length).toBe(1)
      }
      for (const n of [6, 8]) {
        const rows = await db.query(
          `update public.visit_requests set priorities = 'x' where id = $1 returning id`,
          [IDS.req(n)],
        )
        expect(rows.length).toBe(0)
      }
    })
  })

  it('un client ne peut changer ni le statut, ni le prix convenu, ni l’agent', async () => {
    await tx(async (db) => {
      await db.as(camille)
      for (const col of [
        `status = 'payee'`,
        'agreed_price_cents = 100',
        `assigned_agent_id = '${IDS.camille}'`,
        'deleted_at = now()',
      ]) {
        expect(
          await db.errorCode(`update public.visit_requests set ${col} where id = $1`, [IDS.req(2)]),
        ).toBe(PERMISSION_DENIED)
      }
    })
  })

  it('même un admin ne change pas le statut hors transition_request', async () => {
    await tx(async (db) => {
      await db.as('service')
      expect(
        await db.errorCode(`update public.visit_requests set status = 'payee' where id = $1`, [IDS.req(4)]),
      ).toBe('CMF01')
    })
  })

  it('un client ne supprime pas directement une demande', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await db.errorCode(`delete from public.visit_requests where id = $1`, [IDS.req(1)])).toBe(
        PERMISSION_DENIED,
      )
    })
  })
})

describe('RLS — négociation et paiement', () => {
  it('messages et offres : le client voit les siens, jamais ceux des autres', async () => {
    await tx(async (db) => {
      await db.as(hugo)
      expect(await db.query('select * from public.messages where request_id = $1', [IDS.req(3)])).toEqual([])
      expect(await db.query('select * from public.price_offers where request_id = $1', [IDS.req(3)])).toEqual(
        [],
      )
      await db.as(camille)
      expect(
        (await db.query('select * from public.messages where request_id = $1', [IDS.req(3)])).length,
      ).toBe(3)
    })
  })

  it('l’agent n’a pas accès à la négociation ni aux paiements', async () => {
    await tx(async (db) => {
      await db.as(agent)
      expect(await db.query('select * from public.messages')).toEqual([])
      expect(await db.query('select * from public.price_offers')).toEqual([])
      expect(await db.query('select * from public.payments')).toEqual([])
    })
  })

  it('le camp de l’auteur est imposé par le serveur', async () => {
    await tx(async (db) => {
      await db.as(camille)
      const m = await db.one<{ author_side: string; author_id: string }>(
        `insert into public.messages (request_id, body) values ($1, 'Bonjour') returning author_side, author_id`,
        [IDS.req(3)],
      )
      expect(m).toEqual({ author_side: 'client', author_id: IDS.camille })
      expect(
        await db.errorCode(
          `insert into public.messages (request_id, body, author_side) values ($1, 'x', 'checkmyflat')`,
          [IDS.req(3)],
        ),
      ).toBe(PERMISSION_DENIED)
      await db.as(admin)
      const a = await db.one<{ author_side: string }>(
        `insert into public.messages (request_id, body) values ($1, 'Bonjour') returning author_side`,
        [IDS.req(3)],
      )
      expect(a.author_side).toBe('checkmyflat')
    })
  })

  it('un client n’écrit pas dans la demande d’un autre', async () => {
    await tx(async (db) => {
      await db.as(hugo)
      expect(
        await db.errorCode(`insert into public.messages (request_id, body) values ($1, 'x')`, [IDS.req(3)]),
      ).not.toBeNull()
    })
  })

  it('les paiements ne sont jamais écrits par un utilisateur', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(
        await db.errorCode(`insert into public.payments (request_id, amount_cents) values ($1, 100)`, [
          IDS.req(2),
        ]),
      ).toBe(PERMISSION_DENIED)
      expect(await db.errorCode(`select * from public.stripe_events`)).toBe(PERMISSION_DENIED)
    })
  })
})

describe('RLS — rapports', () => {
  it('le client ne voit pas le rapport avant la livraison', async () => {
    await tx(async (db) => {
      await db.as(hugo)
      expect(
        await db.query('select * from public.visit_reports where request_id = $1', [IDS.req(7)]),
      ).toEqual([])
      expect(
        await db.query('select * from public.report_scores where report_id = $1', [IDS.report(7)]),
      ).toEqual([])
    })
  })

  it('le client voit son rapport livré, pas celui des autres', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(
        (await db.query('select * from public.visit_reports where request_id = $1', [IDS.req(8)])).length,
      ).toBe(1)
      expect(
        (await db.query('select * from public.report_scores where report_id = $1', [IDS.report(8)])).length,
      ).toBe(14)
      await db.as(hugo)
      expect(
        await db.query('select * from public.visit_reports where request_id = $1', [IDS.req(8)]),
      ).toEqual([])
    })
  })

  it('l’agent assigné écrit le brouillon de la visite planifiée, pas un rapport soumis', async () => {
    await tx(async (db) => {
      await db.as(agent)
      const updated = await db.query(
        `update public.visit_reports set conclusion = 'En cours' where id = $1 returning id`,
        [IDS.report(6)],
      )
      expect(updated.length).toBe(1)
      const frozen = await db.query(
        `update public.visit_reports set conclusion = 'Modifié' where id = $1 returning id`,
        [IDS.report(8)],
      )
      expect(frozen.length).toBe(0)
      expect(
        await db.errorCode(`update public.visit_reports set status = 'submitted' where id = $1`, [
          IDS.report(6),
        ]),
      ).toBe(PERMISSION_DENIED)
      expect(
        await db.errorCode(`update public.visit_reports set weighted_score = 5 where id = $1`, [
          IDS.report(6),
        ]),
      ).toBe(PERMISSION_DENIED)
    })
  })

  it('un autre agent ne touche pas au rapport', async () => {
    await tx(async (db) => {
      await db.as('service')
      await db.query(`update public.profiles set role = 'agent' where id = $1`, [IDS.hugo])
      await db.as(hugo)
      expect(await db.query('select * from public.visit_reports where id = $1', [IDS.report(6)])).toEqual([])
      const updated = await db.query(
        `update public.visit_reports set conclusion = 'x' where id = $1 returning id`,
        [IDS.report(6)],
      )
      expect(updated).toEqual([])
      expect(
        await db.errorCode(
          `insert into public.report_scores (report_id, criterion_id, score) select $1, id, 1 from public.criteria limit 1`,
          [IDS.report(6)],
        ),
      ).toBe(PERMISSION_DENIED)
    })
  })

  it('l’agent n’insère pas de média directement (quota contrôlé par le serveur)', async () => {
    await tx(async (db) => {
      await db.as(agent)
      expect(
        await db.errorCode(
          `insert into public.report_media (report_id, kind, storage_path, mime, size_bytes) values ($1, 'photo', 'x', 'image/jpeg', 1)`,
          [IDS.report(6)],
        ),
      ).toBe(PERMISSION_DENIED)
    })
  })

  it('stockage : fichiers lisibles seulement par les parties autorisées', async () => {
    await tx(async (db) => {
      await db.as('service')
      await db.query(
        `insert into storage.objects (bucket_id, name) values ('report-pdf', $1), ('report-pdf', $2)`,
        [`${IDS.req(8)}/rapport.pdf`, `${IDS.req(7)}/rapport.pdf`],
      )
      await db.as(camille)
      expect((await db.query(`select name from storage.objects`)).map((r) => r.name)).toEqual([
        `${IDS.req(8)}/rapport.pdf`,
      ])
      await db.as(hugo)
      expect(await db.query(`select name from storage.objects`)).toEqual([])
      await db.as(agent)
      expect((await db.query(`select name from storage.objects`)).length).toBe(2)
    })
  })
})

describe('RLS — comptes', () => {
  it('un utilisateur ne lit que son profil ; l’admin lit tout', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await ids(db, 'select id from public.profiles')).toEqual([IDS.camille])
      await db.as(agent)
      expect(await ids(db, 'select id from public.profiles')).toEqual([IDS.agent])
      await db.as(admin)
      expect((await db.query('select id from public.profiles')).length).toBe(4)
    })
  })

  it('un utilisateur ne peut pas changer son rôle', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(
        await db.errorCode(`update public.profiles set role = 'admin' where id = $1`, [IDS.camille]),
      ).toBe(PERMISSION_DENIED)
      const ok = await db.query(
        `update public.profiles set full_name = 'Camille M.' where id = $1 returning id`,
        [IDS.camille],
      )
      expect(ok.length).toBe(1)
    })
  })

  it('seul un admin modifie la grille tarifaire', async () => {
    await tx(async (db) => {
      await db.as(camille)
      const none = await db.query(`update public.pricing_zones set base_price_cents = 100 returning id`)
      expect(none).toEqual([])
      await db.as(admin)
      const all = await db.query(
        `update public.pricing_zones set base_price_cents = base_price_cents returning id`,
      )
      expect(all.length).toBe(4)
    })
  })
})
