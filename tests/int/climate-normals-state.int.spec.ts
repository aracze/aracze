import { describe, expect, it } from 'vitest'
import {
  hasStoredMonths,
  isUnavailableMarker,
  needsRefresh,
  storedUpdatedAt,
} from '@/lib/climate-normals-state'

const staleBefore = new Date('2026-01-01T00:00:00Z')
const fresh = '2026-06-01T00:00:00Z'
const old = '2025-06-01T00:00:00Z'
const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, tmin: 1, tmax: 2, prcp: 3 }))
const marker = { unavailable: true, reason: 'x', coords: '1.0000,2.0000', updatedAt: fresh }

describe('climate-normals-state (co je data, co značka, kdy znovu dotázat)', () => {
  it('za data bere jen 12 měsíců — prázdné pole ani značka data nejsou', () => {
    expect(hasStoredMonths({ months, updatedAt: fresh })).toBe(true)
    expect(hasStoredMonths({ months: [] })).toBe(false)
    expect(hasStoredMonths(marker)).toBe(false)
    expect(hasStoredMonths(null)).toBe(false)
    expect(hasStoredMonths(undefined)).toBe(false)
  })

  it('pozná značku a čte čas zápisu i z ní', () => {
    expect(isUnavailableMarker(marker)).toBe(true)
    expect(isUnavailableMarker({ months, updatedAt: fresh })).toBe(false)
    expect(storedUpdatedAt(marker)?.toISOString()).toBe(new Date(fresh).toISOString())
    expect(storedUpdatedAt({ months, updatedAt: 'nesmysl' })).toBeNull()
    expect(storedUpdatedAt(null)).toBeNull()
  })

  it('nová stránka a stará data se dotáží, čerstvá data ne', () => {
    expect(needsRefresh(null, '1.0000,2.0000', staleBefore, false)).toBe(true)
    expect(needsRefresh({ months, updatedAt: old }, '1.0000,2.0000', staleBefore, false)).toBe(true)
    expect(needsRefresh({ months, updatedAt: fresh }, '1.0000,2.0000', staleBefore, false)).toBe(
      false,
    )
  })

  it('čerstvá značka pro stejné souřadnice se nedotazuje (nepálí kvótu)', () => {
    expect(needsRefresh(marker, '1.0000,2.0000', staleBefore, false)).toBe(false)
  })

  it('značka vyprší jako data a po změně souřadnic místa platit přestane', () => {
    expect(needsRefresh({ ...marker, updatedAt: old }, '1.0000,2.0000', staleBefore, false)).toBe(
      true,
    )
    expect(needsRefresh(marker, '1.0001,2.0000', staleBefore, false)).toBe(true)
  })

  it('force dotáže vždy, i čerstvá data a čerstvou značku', () => {
    expect(needsRefresh({ months, updatedAt: fresh }, '1.0000,2.0000', staleBefore, true)).toBe(
      true,
    )
    expect(needsRefresh(marker, '1.0000,2.0000', staleBefore, true)).toBe(true)
  })
})
