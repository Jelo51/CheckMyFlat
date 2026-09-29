import { expect, test } from '@playwright/test'
import { ACCOUNTS, expectAccessible, inDays, login, sendAuthorizedWebhook } from './helpers'

test('dépôt sans compte → inscription → négociation → paiement', async ({ page, browser, request }) => {
  // Vitrine
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Quelqu’un y va pour vous.')
  await expectAccessible(page)

  // Formulaire rempli par un visiteur non connecté
  await page.getByRole('link', { name: 'Déposer une demande de visite' }).first().click()
  await expect(page).toHaveURL(/\/demandes\/nouvelle/)
  await expectAccessible(page)
  await page.getByLabel('Lien de l’annonce').fill('https://www.leboncoin.fr/ad/locations/123456')
  await page.getByRole('combobox', { name: /Adresse/ }).fill('12 rue de Vesle')
  await page.getByLabel('Code postal').fill('51100')
  await page.getByLabel('Ville').fill('Reims')
  await page.getByLabel('Type de bien').selectOption('t2')
  await page.getByLabel('Date').fill(inDays(3))
  await page.getByLabel('Heure').fill('10:00')
  await page.getByLabel('Contact sur place').fill('Agence du Parvis — Mme Leroy')
  await page.getByLabel('Téléphone du contact').fill('03 26 00 00 00')
  await page
    .getByLabel('Ce que vous voulez qu’on vérifie en priorité')
    .fill('Bruit de la rue, état de la salle de bains.')
  await page.getByLabel('Prix proposé (€)').fill('9')
  await page.getByLabel(/J’atteste avoir prévenu l’agence/).check()
  await page.getByRole('button', { name: 'Proposer ce prix et publier' }).click()

  // Le compte n'est demandé qu'au moment de valider ; le brouillon est conservé.
  await expect(page).toHaveURL(/\/inscription/)
  await expect(page.getByText('Votre demande en cours est conservée')).toBeVisible()
  const email = `e2e+${Date.now()}@exemple.test`
  await page.getByLabel('Nom et prénom').fill('Test Parcours')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill('motdepasse-e2e')
  await page.getByLabel(/J’accepte les/).check()
  await page.getByRole('button', { name: 'Créer mon compte' }).click()

  await expect(page).toHaveURL(/\/demandes\/[0-9a-f-]{36}\/modifier\?rattache=1/)
  await expect(page.getByRole('combobox', { name: /Adresse/ })).toHaveValue('12 rue de Vesle')
  await page.getByLabel(/J’atteste avoir prévenu l’agence/).check()
  await page.getByRole('button', { name: 'Proposer ce prix et publier' }).click()
  await expect(page).toHaveURL(/\/demandes\/[0-9a-f-]{36}$/)
  const requestId = page.url().split('/').pop()!
  await expect(page.getByText('Publiée').first()).toBeVisible()

  // L'admin contre-propose
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await login(admin, ACCOUNTS.admin)
  await admin.goto(`/admin/demandes/${requestId}`)
  await admin.getByRole('tab', { name: 'Proposer un prix' }).click()
  await admin.getByLabel('Montant (€)').fill('12')
  await admin.getByLabel('Justification (facultatif)').fill('Tarif de la zone.')
  await admin.getByRole('button', { name: 'Proposer', exact: true }).click()
  await expect(admin.getByText('En attente de réponse')).toBeVisible()
  await adminContext.close()

  // Le client accepte et paie
  await page.reload()
  await expect(page.getByText('En négociation').first()).toBeVisible()
  await page.getByRole('button', { name: /Accepter 12,00/ }).click()
  await expect(page.getByText('Prix accepté').first()).toBeVisible()
  await page.getByRole('link', { name: /Payer 12,00/ }).click()
  await expect(page).toHaveURL(/\/paiement$/)
  await expect(page.getByText('Paiement traité par Stripe')).toBeVisible()

  // La page Stripe Checkout n'est pas jouée : on intercepte la redirection.
  await page.route(/checkout\.stripe\.com/, (route) =>
    route.fulfill({ status: 200, body: 'Stripe Checkout' }),
  )
  await page.getByRole('button', { name: /Payer 12,00/ }).click()
  await page.waitForURL(/checkout\.stripe\.com/)

  await sendAuthorizedWebhook(request, requestId, 1200)
  await page.goto(`/demandes/${requestId}/paiement?retour=succes`)
  await expect(page.getByText('Paiement confirmé')).toBeVisible()
  await page.goto(`/demandes/${requestId}`)
  await expect(page.getByText('Payée').first()).toBeVisible()
})
