import { describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { settlementAction, type PaymentState } from '#shared/domain/pricing'

const slotAt = new Date('2026-10-20T09:00:00Z')
const early = new Date('2026-10-18T09:00:00Z')
const late = new Date('2026-10-20T07:00:00Z')

const authorized: PaymentState = {
  status: 'authorized',
  amountCents: 1900,
  capturedCents: 0,
  refundedCents: 0,
}
const captured: PaymentState = {
  status: 'captured',
  amountCents: 1900,
  capturedCents: 1900,
  refundedCents: 0,
}

describe('règlement après annulation', () => {
  it('empreinte + annulation client anticipée → libération', () => {
    const { action } = settlementAction(authorized, {
      cancelledBy: 'owner',
      slotAt,
      now: early,
      latePenaltyPct: 35,
    })
    expect(action).toEqual({ kind: 'release' })
  })

  it('empreinte + annulation client tardive → capture de la seule pénalité', () => {
    const { action, outcome } = settlementAction(authorized, {
      cancelledBy: 'owner',
      slotAt,
      now: late,
      latePenaltyPct: 35,
    })
    expect(action).toEqual({ kind: 'capture', amountCents: 665 })
    expect(outcome.refundCents).toBe(1235)
  })

  it('empreinte + zone sans pénalité → libération même tardive', () => {
    const { action } = settlementAction(authorized, {
      cancelledBy: 'owner',
      slotAt,
      now: late,
      latePenaltyPct: 0,
    })
    expect(action).toEqual({ kind: 'release' })
  })

  it('empreinte + visite non réalisée (agent) → libération', () => {
    const { action } = settlementAction(authorized, {
      cancelledBy: 'assigned_agent',
      slotAt,
      now: late,
      latePenaltyPct: 35,
    })
    expect(action).toEqual({ kind: 'release' })
  })

  it('débité + annulation admin → remboursement intégral', () => {
    const { action } = settlementAction(captured, {
      cancelledBy: 'admin',
      slotAt,
      now: late,
      latePenaltyPct: 35,
    })
    expect(action).toEqual({ kind: 'refund', amountCents: 1900 })
  })

  it('débité + annulation client tardive → remboursement partiel', () => {
    const { action } = settlementAction(captured, {
      cancelledBy: 'owner',
      slotAt,
      now: late,
      latePenaltyPct: 20,
    })
    expect(action).toEqual({ kind: 'refund', amountCents: 1520 })
  })

  it('déjà réglé : rien à refaire (idempotence)', () => {
    const input = { cancelledBy: 'owner' as const, slotAt, now: late, latePenaltyPct: 35 }
    expect(settlementAction({ ...captured, capturedCents: 665 }, input).action).toEqual({ kind: 'none' })
    expect(settlementAction({ ...captured, refundedCents: 1235 }, input).action).toEqual({ kind: 'none' })
    expect(settlementAction({ ...authorized, status: 'canceled' }, input).action).toEqual({ kind: 'none' })
    expect(settlementAction({ ...authorized, status: 'pending' }, input).action).toEqual({ kind: 'none' })
  })
})

describe('webhook Stripe', () => {
  const stripe = new Stripe('sk_test_offline')
  const secret = 'whsec_test_secret'
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: {} },
  })

  it('accepte une signature valide', async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
    const event = await stripe.webhooks.constructEventAsync(payload, header, secret)
    expect(event.id).toBe('evt_1')
  })

  it('rejette une signature invalide ou un corps modifié', async () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
    await expect(
      stripe.webhooks.constructEventAsync(payload.replace('evt_1', 'evt_2'), header, secret),
    ).rejects.toThrow()
    await expect(stripe.webhooks.constructEventAsync(payload, header, 'whsec_autre')).rejects.toThrow()
  })
})
