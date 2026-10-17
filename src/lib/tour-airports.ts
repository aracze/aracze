import { CZECH_AIRPORTS } from './kiwi-deals'

/**
 * Odletová letiště pro zájezdy: česká (výchozí výběr) a okolní, která Češi
 * běžně využívají (často levnější odlety — Bratislava je u Čedoku do Egypta
 * druhé nejčastější letiště vůbec). Jména jsou přesně tak, jak je píšou feedy
 * ve formátu Sdovolená (`dept_places/place`); jiná letiště (Frankfurt,
 * Varšava…) se při syncu vyřazují. Okolní letiště si návštěvník přidává
 * sám a karta je značí štítkem — výchozí zůstává Česko (rozhodnutí
 * uživatele 16. 10. 2026 nad maketou filtrů).
 */
export type AirportGroup = 'cz' | 'near'

export interface TourAirport {
  /** Jméno ve feedu. */
  name: string
  /** Hodnota v adrese (`?odlet=praha,bratislava`). */
  slug: string
  /** „z Prahy“ — tvar pro kartu. */
  from: string
  group: AirportGroup
}

/** Slugy českých letišť pro adresu — ručně, ať nezávisí na normalizaci diakritiky. */
const CZ_SLUGS: Record<string, string> = {
  Praha: 'praha',
  Brno: 'brno',
  Ostrava: 'ostrava',
  Pardubice: 'pardubice',
  'Karlovy Vary': 'karlovy-vary',
}

export const TOUR_AIRPORTS: readonly TourAirport[] = [
  ...CZECH_AIRPORTS.map((a) => ({
    name: a.name,
    slug: CZ_SLUGS[a.name] ?? a.name.toLowerCase(),
    from: a.from,
    group: 'cz' as const,
  })),
  { name: 'Bratislava', slug: 'bratislava', from: 'z Bratislavy', group: 'near' },
  { name: 'Vídeň', slug: 'viden', from: 'z Vídně', group: 'near' },
  { name: 'Budapešť', slug: 'budapest', from: 'z Budapešti', group: 'near' },
  { name: 'Krakov', slug: 'krakov', from: 'z Krakova', group: 'near' },
  { name: 'Katovice', slug: 'katovice', from: 'z Katovic', group: 'near' },
  { name: 'Mnichov', slug: 'mnichov', from: 'z Mnichova', group: 'near' },
  { name: 'Drážďany', slug: 'drazdany', from: 'z Drážďan', group: 'near' },
  { name: 'Linz', slug: 'linz', from: 'z Lince', group: 'near' },
]

export const CZ_AIRPORT_NAMES: readonly string[] = TOUR_AIRPORTS.filter(
  (a) => a.group === 'cz',
).map((a) => a.name)

export function airportByName(name: string): TourAirport | null {
  return TOUR_AIRPORTS.find((a) => a.name === name) ?? null
}

export function airportBySlug(slug: string): TourAirport | null {
  return TOUR_AIRPORTS.find((a) => a.slug === slug) ?? null
}

/** Pořadí pro řazení odletů: česká letiště první (Praha, Brno…), pak okolní. */
export function airportRank(name: string): number {
  const i = TOUR_AIRPORTS.findIndex((a) => a.name === name)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}
