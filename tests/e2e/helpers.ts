import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type APIRequestContext } from '@playwright/test'
import Stripe from 'stripe'

export const PASSWORD = 'motdepasse'
export const ACCOUNTS = {
  admin: 'admin@checkmyflat.test',
  agent: 'agent@checkmyflat.test',
  camille: 'camille@exemple.test',
  hugo: 'hugo@exemple.test',
} as const

export const SEED = {
  payee: '10000000-0000-4000-a000-000000000005',
  planifiee: '10000000-0000-4000-a000-000000000006',
  delivered: '10000000-0000-4000-a000-000000000008',
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/connexion')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/connexion'))
}

export async function logout(page: Page) {
  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())
}

/** Aucune violation d'accessibilité sérieuse ou critique (WCAG 2.1 AA). */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    'violations axe',
  ).toEqual([])
}

/** Date locale (AAAA-MM-JJ) dans `days` jours. */
export function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
}

/**
 * Simule le webhook Stripe « empreinte posée » (le paiement réel se fait sur
 * la page Stripe Checkout, hors de portée des tests).
 */
export async function sendAuthorizedWebhook(request: APIRequestContext, requestId: string, amount: number) {
  const secret = process.env.NUXT_STRIPE_WEBHOOK_SECRET ?? 'whsec_e2e'
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: 'event',
    type: 'payment_intent.amount_capturable_updated',
    data: {
      object: {
        id: `pi_e2e_${Date.now()}`,
        object: 'payment_intent',
        status: 'requires_capture',
        amount,
        amount_received: 0,
        metadata: { request_id: requestId },
      },
    },
  })
  const signature = new Stripe('sk_test_e2e').webhooks.generateTestHeaderString({ payload, secret })
  const response = await request.post('/webhooks/stripe', {
    data: payload,
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
  })
  expect(response.ok()).toBe(true)
}
