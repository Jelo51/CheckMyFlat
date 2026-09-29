import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { ACCOUNTS, SEED, expectAccessible, login } from './helpers'

test('formulaire de visite sur mobile → rapport livré', async ({ page }) => {
  await login(page, ACCOUNTS.agent)
  await expect(page).toHaveURL(/\/agent\/visites/)
  await page.getByRole('link', { name: 'Remplir le compte rendu' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/agent/visites/${SEED.planifiee}`))
  await expect(page.getByRole('heading', { name: 'Compte rendu de visite' })).toBeVisible()
  await expectAccessible(page)

  // Photo (compressée dans le navigateur, envoyée par URL signée)
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles(join(import.meta.dirname, 'fixtures/photo.jpg'))
  await expect(page.getByText('Photo 1').first()).toBeVisible({ timeout: 20_000 })

  // 14 critères : 4 partout
  const fours = page.getByRole('radio', { name: '4 sur 5' })
  await expect(fours).toHaveCount(14)
  for (let i = 0; i < 14; i++) await fours.nth(i).click()
  await expect(page.getByText('(14/14 critères notés)')).toBeVisible()

  // Note globale très éloignée : justification exigée
  await page.getByLabel('Note globale sur 5').fill('2')
  await page.getByLabel('Note globale sur 5').blur()
  await expect(page.getByText('une justification est obligatoire')).toBeVisible()
  await page.getByRole('button', { name: 'Reprendre la moyenne' }).click()
  await expect(page.getByText('une justification est obligatoire')).toBeHidden()

  await page.getByRole('button', { name: 'Ajouter un point' }).click()
  await page.getByLabel('Point à négocier 1').fill('Reprise des joints de la douche')
  await page.getByRole('button', { name: 'Ajouter une réserve' }).click()
  await page.getByLabel('Réserve 1', { exact: true }).fill('Rayure sur le parquet de l’entrée')
  await page.getByLabel('Photo associée à la réserve 1').selectOption({ label: 'Photo 1' })
  await page.getByLabel('Conclusion du visiteur').fill('Maison saine, jardin entretenu, chauffage récent.')
  await page.getByRole('button', { name: 'Conserver en option' }).click()

  await page.getByRole('button', { name: 'Générer le rapport et le remettre au client' }).click()
  await expect(page.getByText('Compte rendu envoyé')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('link', { name: 'Voir le rapport' }).click()
  await expect(page.getByRole('heading', { name: 'Rapport de visite' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Note globale 4,0 sur 5/ })).toBeVisible()
  await expect(page.getByText('Rayure sur le parquet de l’entrée')).toBeVisible()
  await expectAccessible(page)
})
