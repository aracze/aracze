import type { TourOffer } from '@/types/payload'
import { CZECH_AIRPORTS } from './kiwi-deals'
import { BOARD_LABELS } from './sdovolena'
import { TOUR_SOURCES, isTourSourceId, type TourSourceId } from './tour-sources'

/**
 * Filtry a skládání karet pro podstránku „Zájezdy“ — čistá logika bez React,
 * ať jde testovat. Filtry žijí v adrese (`?typ=…&strava=…`): stránka je
 * serverová, každá změna je obyčejný odkaz, funguje bez JavaScriptu a dá se
 * poslat dál. Hodnoty mimo číselník se tiše berou jako výchozí.
 */

export type TourKindFilter = 'pobyt' | 'poznavaci'
export type NightsFilter = 'vse' | '7' | 'kratke' | 'dlouhe'
export type SortFilter = 'cena' | 'sleva' | 'hvezdy'

export interface TourFilters {
  typ: TourKindFilter
  /** Kód stravy 1–8, nebo 'vse'. */
  strava: string
  noci: NightsFilter
  /** Slug odletového města (praha, brno…), nebo 'vse'. */
  odlet: string
  /** Minimální počet hvězd 3–5, nebo 0 = vše. */
  hvezdy: number
  /** Id cestovky, nebo 'vse'. */
  ck: TourSourceId | 'vse'
  razeni: SortFilter
  /** Kolik karet vykreslit (stránkování odkazem „Načíst další“). */
  pocet: number
}

export const TOURS_PAGE_SIZE = 12
const TOURS_MAX_COUNT = 240

/** Odletová města: slug v adrese ↔ jméno ve feedu ↔ „z Prahy“. */
export const DEPARTURE_OPTIONS = CZECH_AIRPORTS.map((a) => ({
  slug: a.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'),
  name: a.name,
  from: a.from,
}))

export const NIGHTS_OPTIONS: { value: NightsFilter; label: string }[] = [
  { value: 'vse', label: 'libovolná' },
  { value: 'kratke', label: 'do 5 nocí' },
  { value: '7', label: '6–8 nocí' },
  { value: 'dlouhe', label: '9 a více nocí' },
]

export const SORT_OPTIONS: { value: SortFilter; label: string }[] = [
  { value: 'cena', label: 'nejlevnější' },
  { value: 'sleva', label: 'největší sleva' },
  { value: 'hvezdy', label: 'nejvíc hvězd' },
]

/** Strava v pořadí, v jakém dává smysl číst (od ničeho po ultra all inclusive). */
export const BOARD_OPTIONS = ['1', '2', '3', '4', '5', '6', '8', '7'].map((code) => ({
  code,
  label: BOARD_LABELS[code],
}))

type SearchParams = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v

/**
 * Výchozí délka: pobyty u moře se srovnávají na TÝDEN (6–8 nocí) — jinak by
 * seznam „nejlevnějších“ začínal třídenními pobyty a týden za dvojnásobek by
 * vypadal jako horší nabídka (stejně to dělá Cestujlevně). Poznávací zájezdy
 * mají délky různé, tam se nefiltruje.
 */
export function defaultNights(typ: TourKindFilter): NightsFilter {
  return typ === 'pobyt' ? '7' : 'vse'
}

export function parseTourFilters(params: SearchParams | undefined): TourFilters {
  const p = params ?? {}
  const typ: TourKindFilter = first(p.typ) === 'poznavaci' ? 'poznavaci' : 'pobyt'
  const strava = first(p.strava)
  const noci = first(p.noci)
  const odlet = first(p.odlet)
  const hvezdy = Number(first(p.hvezdy))
  const ck = first(p.ck)
  const razeni = first(p.razeni)
  const pocet = Number(first(p.pocet))
  return {
    typ,
    strava: strava && BOARD_LABELS[strava] ? strava : 'vse',
    noci: NIGHTS_OPTIONS.some((o) => o.value === noci)
      ? (noci as NightsFilter)
      : defaultNights(typ),
    odlet: DEPARTURE_OPTIONS.some((o) => o.slug === odlet) ? (odlet as string) : 'vse',
    hvezdy: [3, 4, 5].includes(hvezdy) ? hvezdy : 0,
    ck: ck && isTourSourceId(ck) ? ck : 'vse',
    razeni: SORT_OPTIONS.some((o) => o.value === razeni) ? (razeni as SortFilter) : 'cena',
    pocet:
      Number.isInteger(pocet) && pocet > TOURS_PAGE_SIZE
        ? Math.min(pocet, TOURS_MAX_COUNT)
        : TOURS_PAGE_SIZE,
  }
}

export const DEFAULT_TOUR_FILTERS: TourFilters = parseTourFilters(undefined)

/**
 * Adresa stránky s upravenými filtry; výchozí hodnoty se do adresy nepíšou
 * (kanonická adresa bez parametrů zůstává tou hlavní). Změna filtru vrací
 * počet karet na začátek.
 */
export function tourFiltersHref(
  basePath: string,
  filters: TourFilters,
  patch: Partial<TourFilters>,
): string {
  const f = { ...filters, pocet: TOURS_PAGE_SIZE, ...patch }
  // Přepnutí typu bere svou výchozí délku (týden u pobytů, vše u poznávacích),
  // pokud ji patch nenastavuje sám.
  if (patch.typ && patch.typ !== filters.typ && patch.noci === undefined) {
    f.noci = defaultNights(patch.typ)
  }
  const q = new URLSearchParams()
  if (f.typ !== 'pobyt') q.set('typ', f.typ)
  if (f.strava !== 'vse') q.set('strava', f.strava)
  if (f.noci !== defaultNights(f.typ)) q.set('noci', f.noci)
  if (f.odlet !== 'vse') q.set('odlet', f.odlet)
  if (f.hvezdy) q.set('hvezdy', String(f.hvezdy))
  if (f.ck !== 'vse') q.set('ck', f.ck)
  if (f.razeni !== 'cena') q.set('razeni', f.razeni)
  if (f.pocet !== TOURS_PAGE_SIZE) q.set('pocet', String(f.pocet))
  const qs = q.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

function nightsMatch(nights: number, filter: NightsFilter): boolean {
  switch (filter) {
    case 'vse':
      return true
    case 'kratke':
      return nights <= 5
    case '7':
      return nights >= 6 && nights <= 8
    case 'dlouhe':
      return nights >= 9
  }
}

export function offerMatches(offer: TourOffer, f: TourFilters): boolean {
  if (offer.kind !== (f.typ === 'poznavaci' ? 'tour' : 'stay')) return false
  if (f.strava !== 'vse' && offer.board !== f.strava) return false
  if (!nightsMatch(offer.nights, f.noci)) return false
  if (f.odlet !== 'vse') {
    const city = DEPARTURE_OPTIONS.find((o) => o.slug === f.odlet)?.name
    if (!city || !offer.departures.includes(city)) return false
  }
  if (f.hvezdy && (offer.stars ?? 0) < f.hvezdy) return false
  if (f.ck !== 'vse' && offer.source !== f.ck) return false
  return true
}

export function discountPercent(offer: TourOffer): number {
  if (!offer.originalPrice || offer.originalPrice <= offer.price) return 0
  return Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100)
}

/**
 * Karty: každý hotel (cestovka + id zájezdu) JEDNOU — nejlevnější z jeho
 * řádků, které projdou filtrem — a seřazené podle zvoleného řazení. Vstup je
 * seřazený od nejlevnějšího (fetchTourOffers), takže první výskyt hotelu je
 * jeho nejlevnější varianta.
 */
export function buildTourCards(offers: TourOffer[], f: TourFilters): TourOffer[] {
  const byHotel = new Map<string, TourOffer>()
  for (const offer of offers) {
    if (!offerMatches(offer, f)) continue
    const key = `${offer.source}:${offer.title}:${offer.place ?? offer.area ?? ''}`
    const current = byHotel.get(key)
    if (!current || offer.price < current.price) byHotel.set(key, offer)
  }
  const cards = [...byHotel.values()]
  switch (f.razeni) {
    case 'sleva':
      cards.sort((a, b) => discountPercent(b) - discountPercent(a) || a.price - b.price)
      break
    case 'hvezdy':
      cards.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || a.price - b.price)
      break
    default:
      cards.sort((a, b) => a.price - b.price)
  }
  return cards
}

export interface ResortSummary {
  name: string
  minPrice: number
  photoUrl: string | null
  hotels: number
}

/**
 * Letoviska („Kam do Egypta“): pobytové nabídky seskupené podle oblasti
 * (feed `area_title`, jinak `place_title`) s nejnižší cenou na 6–8 nocí —
 * ať se nesrovnává víkend s týdnem. Fotka = nejlevnější hotel oblasti.
 * Zájezdy bez oblasti (poznávací okruhy) se do letovisek nepočítají.
 */
export function buildResorts(offers: TourOffer[], limit = 6): ResortSummary[] {
  const byArea = new Map<string, Omit<ResortSummary, 'hotels'> & { hotels: Set<string> }>()
  for (const offer of offers) {
    if (offer.kind !== 'stay' || !nightsMatch(offer.nights, '7')) continue
    const name = offer.area || offer.place
    if (!name) continue
    const entry = byArea.get(name)
    if (!entry) {
      byArea.set(name, {
        name,
        minPrice: offer.price,
        photoUrl: offer.photoUrl,
        hotels: new Set([offer.title]),
      })
      continue
    }
    entry.hotels.add(offer.title)
    if (offer.price < entry.minPrice) {
      entry.minPrice = offer.price
      entry.photoUrl = offer.photoUrl ?? entry.photoUrl
    }
  }
  return [...byArea.values()]
    .map((e) => ({
      name: e.name,
      minPrice: e.minPrice,
      photoUrl: e.photoUrl,
      hotels: e.hotels.size,
    }))
    .sort((a, b) => a.minPrice - b.minPrice)
    .slice(0, limit)
}

/** Cestovky zastoupené v nabídkách (pro řádek „S kým …“), v pořadí TOUR_SOURCES. */
export function sourcesPresent(
  offers: TourOffer[],
): { id: TourSourceId; label: string; count: number }[] {
  const counts = new Map<string, Set<string>>()
  for (const o of offers) {
    const set = counts.get(o.source) ?? new Set<string>()
    set.add(o.title)
    counts.set(o.source, set)
  }
  return TOUR_SOURCES.filter((s) => counts.has(s.id)).map((s) => ({
    id: s.id,
    label: s.label,
    count: counts.get(s.id)!.size,
  }))
}

/** Počet hotelů (karet) pro přepínač Pobyt / Poznávací — bez ostatních filtrů. */
export function countByKind(offers: TourOffer[]): { stay: number; tour: number } {
  const stay = new Set<string>()
  const tour = new Set<string>()
  for (const o of offers) (o.kind === 'tour' ? tour : stay).add(`${o.source}:${o.title}`)
  return { stay: stay.size, tour: tour.size }
}
