/**
 * Dates : tout est stocké en UTC, tout est saisi et affiché à l'heure de Paris.
 */

export const APP_TIME_ZONE = 'Europe/Paris'

/** Décalage (en minutes) du fuseau `timeZone` par rapport à UTC à l'instant `date`. */
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - date.getTime()) / 60000)
}

/** « 2026-04-22 » + « 11:00 » (heure de Paris) → instant UTC. */
export function parisLocalToDate(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  const naive = Date.UTC(y, m - 1, d, hh, mm)
  // Deux passes pour gérer correctement les changements d'heure.
  const first = naive - zoneOffsetMinutes(new Date(naive), APP_TIME_ZONE) * 60000
  return new Date(naive - zoneOffsetMinutes(new Date(first), APP_TIME_ZONE) * 60000)
}

/** Instant → { date: « 2026-04-22 », time: « 11:00 » } à l'heure de Paris. */
export function dateToParisLocal(value: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(value)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

const slotFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})
const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const shortFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** « 22 avril à 11 h 00 » */
export function formatSlot(value: string | Date): string {
  const parts = slotFormatter.formatToParts(new Date(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month')} à ${get('hour')} h ${get('minute')}`
}

/** « 22 avril 2026 » */
export function formatDay(value: string | Date): string {
  return dayFormatter.format(new Date(value))
}

/** « 22 avr., 11:00 » */
export function formatDateTimeShort(value: string | Date): string {
  return shortFormatter.format(new Date(value))
}
