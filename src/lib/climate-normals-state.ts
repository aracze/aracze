import type { ClimateNormalsUnavailable } from '@/types/payload'

/**
 * Čisté rozhodování nad uloženým obsahem pole `climateNormals` — co je
 * skutečná data, co značka „bez stanice" a kdy se má stránka znovu zařadit
 * do fronty syncu. Odděleno od endpointu (syncClimateNormals.ts), aby se dalo
 * testovat bez Meteostatu a databáze (tests/int/climate-normals-state.int.spec.ts).
 */

/** Uložená skutečná data: 12 měsíců (ne prázdné pole, ne značka, ne prázdno). */
export function hasStoredMonths(stored: unknown): boolean {
  const months = (stored as { months?: unknown } | null | undefined)?.months
  return Array.isArray(months) && months.length === 12
}

/** Je uložený obsah značka „bez stanice"? */
export function isUnavailableMarker(stored: unknown): stored is ClimateNormalsUnavailable {
  return (
    typeof stored === 'object' &&
    stored !== null &&
    (stored as { unavailable?: unknown }).unavailable === true
  )
}

/** Čas posledního zápisu (data i značka), nebo null u prázdné/neznámé hodnoty. */
export function storedUpdatedAt(stored: unknown): Date | null {
  const raw = (stored as { updatedAt?: unknown } | null | undefined)?.updatedAt
  if (typeof raw !== 'string') return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Má se stránka v tomto běhu znovu dotázat?
 *
 * - `force` → vždy (po změně metodiky nebo při ručním opakování).
 * - bez data zápisu → ano (nová stránka nebo neznámý tvar).
 * - starší než `staleBefore` → ano (okno se posunulo, nebo značka vypršela).
 * - značka „bez stanice" pro JINÉ souřadnice než má místo teď → ano: editor
 *   opravil překlep v souřadnicích a nemá čekat 330 dní, než se to projeví.
 */
export function needsRefresh(
  stored: unknown,
  currentCoords: string | null,
  staleBefore: Date,
  force: boolean,
): boolean {
  if (force) return true
  const updatedAt = storedUpdatedAt(stored)
  if (!updatedAt || updatedAt < staleBefore) return true
  if (isUnavailableMarker(stored) && stored.coords !== currentCoords) return true
  return false
}
