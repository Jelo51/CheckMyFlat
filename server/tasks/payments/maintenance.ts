/** Tâche planifiée (toutes les 15 min, voir nuxt.config.ts) : rapprochement des paiements. */
export default defineTask({
  meta: {
    name: 'payments:maintenance',
    description: 'Offres expirées, ouverture des paiements, captures, annulations à régler',
  },
  async run() {
    const result = await runPaymentsMaintenance()
    return { result }
  },
})
