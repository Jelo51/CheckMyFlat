import { expect, test } from '@playwright/test'
import { ACCOUNTS, SEED, expectAccessible, login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page, ACCOUNTS.admin)
})

test('file des demandes, assignation d’un agent', async ({ page }) => {
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByText('demandes actives')).toBeVisible()
  await expectAccessible(page)

  await page.getByRole('button', { name: /^Payée/ }).click()
  await expect(page).toHaveURL(/statut=payee/)
  await page.getByRole('link', { name: 'Ouvrir' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/admin/demandes/${SEED.payee}`))

  await page.getByLabel('Agent').selectOption({ label: 'Julien Visiteur' })
  await page.getByRole('button', { name: 'Assigner', exact: true }).click()
  await expect(page.getByText('Agent assigné, notifications envoyées.')).toBeVisible()
  await expect(page.getByText('Planifiée').first()).toBeVisible()
})

test('gestion des utilisateurs', async ({ page }) => {
  await page.goto('/admin/utilisateurs')
  await expect(page.getByRole('cell', { name: /^Camille Martin/ })).toBeVisible()
  await expectAccessible(page)

  const role = page.getByLabel(`Rôle de ${ACCOUNTS.hugo}`)
  await role.selectOption('agent')
  await expect(page.getByText(`Rôle de ${ACCOUNTS.hugo} : Agent.`)).toBeVisible()
  await role.selectOption('user')
  await expect(page.getByText(`Rôle de ${ACCOUNTS.hugo} : Client.`)).toBeVisible()
})

test('grille tarifaire éditable', async ({ page }) => {
  await page.goto('/admin/tarifs')
  const zone = page.locator('section', { has: page.getByRole('heading', { name: /Zone 1/ }) })
  await zone.getByLabel('Prix plancher (€)').fill('8')
  await zone.getByRole('button', { name: 'Enregistrer la zone' }).click()
  await expect(zone.getByText('Zone enregistrée.')).toBeVisible()
  await zone.getByLabel('Prix plancher (€)').fill('7')
  await zone.getByRole('button', { name: 'Enregistrer la zone' }).click()
  await expect(zone.getByText('Zone enregistrée.')).toBeVisible()
})
