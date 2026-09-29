import { describe, expect, it } from 'vitest'
import { dateToParisLocal, formatSlot, parisLocalToDate } from '#shared/utils/time'
import { formatReference, REFERENCE_PATTERN } from '#shared/domain/reference'

describe('heure de Paris', () => {
  it('heure d’été (UTC+2)', () => {
    expect(parisLocalToDate('2026-04-22', '11:00').toISOString()).toBe('2026-04-22T09:00:00.000Z')
  })
  it('heure d’hiver (UTC+1)', () => {
    expect(parisLocalToDate('2026-12-01', '09:30').toISOString()).toBe('2026-12-01T08:30:00.000Z')
  })
  it('jour du changement d’heure', () => {
    expect(parisLocalToDate('2026-10-25', '14:00').toISOString()).toBe('2026-10-25T13:00:00.000Z')
    expect(parisLocalToDate('2026-03-29', '14:00').toISOString()).toBe('2026-03-29T12:00:00.000Z')
  })
  it('aller-retour', () => {
    expect(dateToParisLocal(new Date('2026-04-22T09:00:00Z'))).toEqual({ date: '2026-04-22', time: '11:00' })
  })
  it('format du créneau', () => {
    expect(formatSlot('2026-04-22T09:00:00Z')).toBe('22 avril à 11 h 00')
  })
})

describe('référence', () => {
  it('CMF-AAAA-NNNN', () => {
    expect(formatReference(2026, 412)).toBe('CMF-2026-0412')
    expect(formatReference(2026, 12345)).toBe('CMF-2026-12345')
    expect(REFERENCE_PATTERN.test('CMF-2026-0412')).toBe(true)
    expect(REFERENCE_PATTERN.test('CMF-26-0412')).toBe(false)
  })
})
