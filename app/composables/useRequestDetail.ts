/**
 * Demande + négociation + journal + paiements, lus avec la RLS de
 * l'utilisateur courant. Rafraîchi à intervalle régulier tant que la page
 * est visible (messagerie).
 */
export function useRequestDetail(id: string) {
  const supabase = useSupabaseClient()

  const { data, refresh, status } = useAsyncData(`request-${id}`, async () => {
    const [request, offers, messages, events, payments] = await Promise.all([
      supabase
        .from('visit_requests')
        .select('*, pricing_zones(id, label, base_price_cents, late_penalty_pct)')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('price_offers').select('*').eq('request_id', id).order('created_at'),
      supabase.from('messages').select('*').eq('request_id', id).order('created_at'),
      supabase.from('visit_request_events').select('*').eq('request_id', id).order('created_at'),
      supabase.from('payments').select('*').eq('request_id', id).order('created_at'),
    ])
    return {
      request: request.data,
      offers: offers.data ?? [],
      messages: messages.data ?? [],
      events: events.data ?? [],
      payments: payments.data ?? [],
    }
  })

  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 20_000)
  })
  onBeforeUnmount(() => clearInterval(timer))

  return { data, refresh, status }
}

export type RequestDetail = NonNullable<ReturnType<typeof useRequestDetail>['data']['value']>
