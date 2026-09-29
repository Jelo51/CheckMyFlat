/** Téléchargement du PDF d'un rapport via une URL signée de courte durée. */
export function usePdfDownload() {
  const pending = ref<string | null>(null)
  const error = ref<string | null>(null)

  async function download(requestId: string) {
    pending.value = requestId
    error.value = null
    try {
      const { url } = await api<{ url: string }>(`/api/reports/${requestId}/pdf`)
      window.location.assign(url)
    } catch (e) {
      error.value = errorMessage(e, 'Le PDF est momentanément indisponible.')
    } finally {
      pending.value = null
    }
  }

  return { download, pending, error }
}
