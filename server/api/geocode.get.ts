/** Autocomplétion d'adresse (proxy de la Géoplateforme, sans clé exposée). */
export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q ?? '').slice(0, 200)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return geocode(q, { autocomplete: true, limit: 5 })
})
