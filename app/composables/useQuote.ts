import type { RequestForm } from '~/utils/requestForm'
import { parisLocalToDate } from '#shared/utils/time'

export interface Quote {
  zone: { id: string; label: string; basePriceCents: number; latePenaltyPct: number } | null
  urgentFeeCents: number
}

/** Estimation (zone, plancher, supplément 48 h) recalculée pendant la saisie. */
export function useQuote(form: RequestForm) {
  const quote = ref<Quote | null>(null)
  const loading = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  const key = computed(() =>
    [form.address, form.postalCode, form.city, form.lat, form.lng, form.slotDate, form.slotTime].join('|'),
  )

  async function load() {
    if (!form.city || !/^\d{5}$/.test(form.postalCode)) {
      quote.value = null
      return
    }
    loading.value = true
    try {
      quote.value = await api<Quote>('/api/pricing/quote', {
        method: 'POST',
        body: {
          address: form.address,
          postalCode: form.postalCode,
          city: form.city,
          lat: form.lat,
          lng: form.lng,
          slotAt:
            form.slotDate && form.slotTime
              ? parisLocalToDate(form.slotDate, form.slotTime).toISOString()
              : null,
        },
      })
    } catch {
      quote.value = null
    } finally {
      loading.value = false
    }
  }

  watch(
    key,
    () => {
      if (import.meta.server) return
      clearTimeout(timer)
      timer = setTimeout(load, 500)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => clearTimeout(timer))

  return { quote, loading }
}
