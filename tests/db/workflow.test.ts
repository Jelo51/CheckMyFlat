import { afterAll, describe, expect, it } from 'vitest'
import { closePool, IDS, tx, type Db } from './helpers'

afterAll(closePool)

const camille = { uid: IDS.camille }
const hugo = { uid: IDS.hugo }
const agent = { uid: IDS.agent }
const admin = { uid: IDS.admin }

async function createFilledDraft(db: Db, slotInterval = '10 days'): Promise<string> {
  await db.as(camille)
  const row = await db.one<{ id: string }>(
    `insert into public.visit_requests (
       address, postal_code, city, lat, lng, property_type, slot_at, agency_name, agency_phone,
       priorities, proposed_price_cents, consent_at
     ) values (
       '12 rue de Vesle', '51100', 'Reims', 49.2547, 4.0266, 't2', now() + $1::interval, 'Agence', '03 26 00 00 00',
       'Humidité', 900, now()
     ) returning id`,
    [slotInterval],
  )
  return row.id
}

async function status(db: Db, id: string): Promise<string> {
  await db.as('service')
  return (await db.one<{ status: string }>('select status from public.visit_requests where id = $1', [id]))
    .status
}

async function transition(db: Db, id: string, to: string, reason: string | null = null) {
  return db.errorCode('select public.transition_request($1, $2::public.request_status, $3)', [id, to, reason])
}

describe('parcours complet', () => {
  it('brouillon → publiée → négociation → acceptée → payée → planifiée → visitée → rapport livré', async () => {
    await tx(async (db) => {
      const id = await createFilledDraft(db)

      // Publication par le client, avec proposition initiale.
      await db.query('select public.publish_request($1)', [id])
      expect(await status(db, id)).toBe('publiee')
      await db.as(camille)
      const initial = await db.one<{ id: string; author_side: string; amount_cents: number }>(
        `select id, author_side, amount_cents from public.price_offers where request_id = $1 and status = 'pending'`,
        [id],
      )
      expect(initial).toMatchObject({ author_side: 'client', amount_cents: 900 })
      // Le client ne peut pas accepter sa propre offre.
      expect(await db.errorCode('select public.respond_offer($1, true)', [initial.id])).toBe('CMF02')

      // Contre-proposition de l'admin.
      await db.as(admin)
      const counter = await db.one<{ id: string }>(`select (public.create_offer($1, 1000, 'Zone 1')).id`, [
        id,
      ])
      expect(await status(db, id)).toBe('en_negociation')
      await db.as('service')
      const superseded = await db.one<{ status: string }>(
        'select status from public.price_offers where id = $1',
        [initial.id],
      )
      expect(superseded.status).toBe('superseded')

      // Hugo ne peut pas répondre à la place de Camille.
      await db.as(hugo)
      expect(await db.errorCode('select public.respond_offer($1, true)', [counter.id])).toBe('CMF05')

      // Camille accepte.
      await db.as(camille)
      await db.query('select public.respond_offer($1, true)', [counter.id])
      await db.as('service')
      const accepted = await db.one<{ status: string; agreed_price_cents: number }>(
        'select status, agreed_price_cents from public.visit_requests where id = $1',
        [id],
      )
      expect(accepted).toEqual({ status: 'acceptee', agreed_price_cents: 1000 })

      // Le paiement n'est validé que par le système (webhook).
      await db.as(camille)
      expect(await transition(db, id, 'payee')).toBe('CMF02')
      await db.as(admin)
      expect(await transition(db, id, 'payee')).toBe('CMF02')
      await db.as('service')
      expect(await transition(db, id, 'payee')).toBeNull()

      // Assignation.
      await db.as(admin)
      expect(await db.errorCode('select public.assign_agent($1, $2)', [id, IDS.hugo])).toBe('CMF06')
      await db.query('select public.assign_agent($1, $2)', [id, IDS.agent])
      expect(await status(db, id)).toBe('planifiee')

      // Compte rendu : l'agent remplit.
      await db.as(agent)
      const report = await db.one<{ id: string; agent_id: string }>(
        `insert into public.visit_reports (request_id, filming_refused, global_score, conclusion, recommendation)
         values ($1, true, 2.5, 'Logement correct mais sombre.', 'option') returning id, agent_id`,
        [id],
      )
      expect(report.agent_id).toBe(IDS.agent)
      expect(await db.errorCode('select public.submit_report($1)', [id])).toBe('CMF06') // critères manquants
      await db.query(
        `insert into public.report_scores (report_id, criterion_id, score) select $1, id, 4 from public.criteria`,
        [report.id],
      )
      // Moyenne 4, note 2,5 : écart > 1 sans justification.
      expect(await db.errorCode('select public.submit_report($1)', [id])).toBe('CMF06')
      await db.query(
        `update public.visit_reports set justification = 'Humidité importante dans la chambre.' where id = $1`,
        [report.id],
      )
      await db.query('select public.submit_report($1)', [id])
      expect(await status(db, id)).toBe('realisee')
      await db.as('service')
      const submitted = await db.one<{ status: string; weighted_score: string }>(
        'select status, weighted_score from public.visit_reports where id = $1',
        [report.id],
      )
      expect(submitted).toEqual({ status: 'submitted', weighted_score: '4.00' })

      // Le rapport n'est livré qu'une fois le PDF produit, par le système.
      expect(await transition(db, id, 'rapport_livre')).toBe('CMF06')
      await db.query(`update public.visit_reports set pdf_path = $2, delivered_at = now() where id = $1`, [
        report.id,
        `${id}/rapport.pdf`,
      ])
      await db.as(admin)
      expect(await transition(db, id, 'rapport_livre')).toBe('CMF02')
      await db.as('service')
      expect(await transition(db, id, 'rapport_livre')).toBeNull()

      // Journal complet.
      const events = await db.query<{ from_status: string | null; to_status: string; actor_kind: string }>(
        'select from_status, to_status, actor_kind from public.visit_request_events where request_id = $1 order by id',
        [id],
      )
      expect(events.map((e) => `${e.from_status ?? '∅'}>${e.to_status}:${e.actor_kind}`)).toEqual([
        '∅>brouillon:owner',
        'brouillon>publiee:owner',
        'publiee>en_negociation:admin',
        'en_negociation>acceptee:owner',
        'acceptee>payee:system',
        'payee>planifiee:admin',
        'planifiee>realisee:assigned_agent',
        'realisee>rapport_livre:system',
      ])
    })
  })

  it('l’admin peut accepter directement le prix proposé', async () => {
    await tx(async (db) => {
      const id = await createFilledDraft(db)
      await db.query('select public.publish_request($1)', [id])
      await db.as(admin)
      const offer = await db.one<{ id: string }>(
        `select id from public.price_offers where request_id = $1 and status = 'pending'`,
        [id],
      )
      await db.query('select public.respond_offer($1, true)', [offer.id])
      expect(await status(db, id)).toBe('acceptee')
    })
  })

  it('supplément 48 h appliqué à la publication', async () => {
    await tx(async (db) => {
      const soon = await createFilledDraft(db, '30 hours')
      const later = await createFilledDraft(db, '3 days')
      await db.query('select public.publish_request($1)', [soon])
      await db.query('select public.publish_request($1)', [later])
      await db.as('service')
      const fees = await db.query<{ id: string; urgent_fee_cents: number }>(
        'select id, urgent_fee_cents from public.visit_requests where id = any($1)',
        [[soon, later]],
      )
      expect(Object.fromEntries(fees.map((f) => [f.id, f.urgent_fee_cents]))).toEqual({
        [soon]: 500,
        [later]: 0,
      })
    })
  })

  it('publication refusée si le brouillon est incomplet ou sans attestation', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await db.errorCode('select public.publish_request($1)', [IDS.req(1)])).not.toBeNull()
      const id = await createFilledDraft(db)
      await db.query('update public.visit_requests set consent_at = null where id = $1', [id])
      expect(await db.errorCode('select public.publish_request($1)', [id])).toBe('CMF06')
    })
  })

  it('offre expirée : impossible de l’accepter', async () => {
    await tx(async (db) => {
      await db.as('service')
      await db.query(
        `update public.price_offers set expires_at = now() - interval '1 minute' where request_id = $1`,
        [IDS.req(3)],
      )
      await db.as(camille)
      const offer = await db.one<{ id: string }>(
        `select id from public.price_offers where request_id = $1 and status = 'pending'`,
        [IDS.req(3)],
      )
      expect(await db.errorCode('select public.respond_offer($1, true)', [offer.id])).toBe('CMF02')
      await db.as('service')
      expect((await db.one<{ n: number }>('select public.expire_offers() as n')).n).toBe(1)
    })
  })

  it('une négociation close n’accepte plus d’offre', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await db.errorCode('select public.create_offer($1, 1500)', [IDS.req(6)])).toBe('CMF02')
    })
  })
})

describe('transitions refusées', () => {
  it('le client ne saute pas d’étape', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await transition(db, IDS.req(2), 'acceptee')).toBe('CMF02')
      expect(await transition(db, IDS.req(2), 'rapport_livre')).toBe('CMF02')
      expect(await transition(db, IDS.req(6), 'realisee')).toBe('CMF02')
    })
  })

  it('un client n’agit pas sur la demande d’un autre', async () => {
    await tx(async (db) => {
      await db.as(hugo)
      expect(await transition(db, IDS.req(2), 'annulee', 'test')).toBe('CMF05')
    })
  })

  it('annulation : motif obligatoire, impossible après la visite', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await transition(db, IDS.req(2), 'annulee')).toBe('CMF06')
      expect(await transition(db, IDS.req(2), 'annulee', 'Logement loué')).toBeNull()
      expect(await transition(db, IDS.req(8), 'annulee', 'Trop tard')).toBe('CMF02')
    })
  })

  it('l’agent assigné signale une visite non réalisée', async () => {
    await tx(async (db) => {
      await db.as(agent)
      expect(await transition(db, IDS.req(6), 'annulee', 'Agence absente')).toBeNull()
      const event = await db.one<{ actor_kind: string }>(
        `select actor_kind from public.visit_request_events where request_id = $1 and to_status = 'annulee'`,
        [IDS.req(6)],
      )
      expect(event.actor_kind).toBe('assigned_agent')
    })
  })

  it('litige depuis un rapport livré', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await transition(db, IDS.req(8), 'litige', 'Critère mal évalué')).toBeNull()
    })
  })

  it('un compte suspendu ne peut plus agir', async () => {
    await tx(async (db) => {
      await db.as('service')
      await db.query('update public.profiles set suspended_at = now() where id = $1', [IDS.camille])
      await db.as(camille)
      expect(await transition(db, IDS.req(2), 'annulee', 'test')).toBe('CMF05')
      expect(await db.query('select id from public.visit_requests where id = $1', [IDS.req(2)])).toHaveLength(
        1,
      )
    })
  })
})

describe('suppression', () => {
  it('hard delete avant paiement', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect((await db.one<{ r: string }>('select public.delete_request($1) as r', [IDS.req(1)])).r).toBe(
        'hard',
      )
      await db.as('service')
      expect(await db.query('select id from public.visit_requests where id = $1', [IDS.req(1)])).toEqual([])
    })
  })

  it('soft delete après paiement, rapport supprimé, paiement conservé', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect((await db.one<{ r: string }>('select public.delete_request($1) as r', [IDS.req(8)])).r).toBe(
        'soft',
      )
      expect(await db.query('select id from public.visit_requests where id = $1', [IDS.req(8)])).toEqual([])
      await db.as('service')
      const row = await db.one<{ deleted: boolean }>(
        'select deleted_at is not null as deleted from public.visit_requests where id = $1',
        [IDS.req(8)],
      )
      expect(row.deleted).toBe(true)
      expect(
        await db.query('select id from public.visit_reports where request_id = $1', [IDS.req(8)]),
      ).toEqual([])
      expect(
        (await db.query('select id from public.payments where request_id = $1', [IDS.req(8)])).length,
      ).toBe(1)
    })
  })

  it('refusée pendant une visite en cours', async () => {
    await tx(async (db) => {
      await db.as(camille)
      expect(await db.errorCode('select public.delete_request($1)', [IDS.req(6)])).toBe('CMF02')
    })
  })

  it('refusée pour la demande d’un autre', async () => {
    await tx(async (db) => {
      await db.as(hugo)
      expect(await db.errorCode('select public.delete_request($1)', [IDS.req(1)])).toBe('CMF05')
    })
  })
})
