import { describe, expect, it } from 'vitest'
import {
  MAX_DAYS_PER_REQUEST,
  MAX_REQUESTS_PER_PLACE,
  climateWindow,
  requestRanges,
  ymd,
} from '@/lib/climate-window'

const daysBetween = (start: string, end: string): number =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1

describe('climateWindow + requestRanges (kvóta Meteostatu)', () => {
  // Rok s pěti přestupnými dny v okně (2008, 2012, 2016, 2020, 2024) — přesně
  // ten případ, kdy 20 let = 7 305 dní přeteklo do třetího dotazu.
  it('okno 2006–2025 se vejde do dvou dotazů, každý nejvýš 3 650 dní', () => {
    const { from, to, firstYear, lastYear } = climateWindow(new Date('2026-09-18T09:00:00Z'))
    expect(firstYear).toBe(2006)
    expect(lastYear).toBe(2025)
    expect(ymd(to)).toBe('2025-12-31')
    // Začátek posunutý o pět dní, ne o měsíc — jen tolik, kolik je nutné.
    expect(ymd(from)).toBe('2006-01-06')

    const ranges = requestRanges(from, to)
    expect(ranges).toHaveLength(MAX_REQUESTS_PER_PLACE)
    for (const r of ranges)
      expect(daysBetween(r.start, r.end)).toBeLessThanOrEqual(MAX_DAYS_PER_REQUEST)
    // Rozsahy na sebe navazují bez díry a bez překryvu a pokrývají celé okno.
    expect(ranges[0].start).toBe(ymd(from))
    expect(ranges[ranges.length - 1].end).toBe(ymd(to))
    for (let i = 1; i < ranges.length; i++) {
      expect(daysBetween(ranges[i - 1].end, ranges[i].start)).toBe(2)
    }
  })

  it('platí pro každý rok spuštění, ne jen pro ten dnešní', () => {
    for (let year = 2026; year <= 2060; year++) {
      const { from, to } = climateWindow(new Date(Date.UTC(year, 5, 1)))
      const ranges = requestRanges(from, to)
      expect(ranges.length, `rok ${year}`).toBeLessThanOrEqual(MAX_REQUESTS_PER_PLACE)
      expect(daysBetween(ymd(from), ymd(to)), `rok ${year}`).toBeGreaterThan(7290)
    }
  })

  it('okno končí posledním UKONČENÝM rokem i v lednu', () => {
    const { lastYear } = climateWindow(new Date('2027-01-01T00:00:00Z'))
    expect(lastYear).toBe(2026)
  })
})
