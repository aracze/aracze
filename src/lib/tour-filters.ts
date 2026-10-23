import type { TourOffer } from '@/types/payload'
import {
  TOUR_AIRPORTS,
  CZ_AIRPORT_NAMES,
  airportBySlug,
  airportByName,
  airportRank,
} from './tour-airports'
import { TOUR_SOURCES, isTourSourceId, type TourSourceId } from './tour-sources'

/**
 * Filtry a skládání karet pro podstránku „Zájezdy“ — čistá logika bez React,
 * ať jde testovat. Filtry žijí v adrese (`?odlet=praha,brno&mesice=2026-11`):
 * stránka je serverová, každá změna je obyčejný odkaz, funguje bez
 * JavaScriptu a dá se poslat dál. Hodnoty mimo číselník se tiše berou jako
 * výchozí; výchozí hodnoty se do adresy nepíšou (kanonická adresa bez
 * parametrů zůstává hlavní).
 *
 * Model (po zpětné vazbě 16. 10. 2026 nad maketami D/E):
 *  · odlet = více letišť, výchozí všechna česká; okolní (Bratislava, Vídeň…)
 *    na vyžádání, karta je značí;
 *  · termín = měsíce (jedno klepnutí = celý měsíc) nebo přesný rozsah dnů;
 *  · délka = rozsah nocí, výchozí týden (6–8) — třídenní víkend by jinak
 *    „vyhrával“ cenou nad týdnem;
 *  · strava seskupená do 4 skupin, hvězdy, letovisko, cestovka, jen se slevou;
 *  · typ zájezdu je filtr s výchozím „vše“ (ne přepínač).
 * Cena karty = nejlevnější TERMÍN řádku, který projde filtrem data a délky
 * (řádek nese všechny budoucí termíny, viz TourOffer.terms).
 */

export type TourKindFilter = 'vse' | 'pobyt' | 'poznavaci'
export type SortFilter = 'doporucene' | 'cena' | 'sleva' | 'odlet'
export type BoardGroupId = 'ai' | 'polo' | 'snidane' | 'program'
/** Hvězdy jako skupiny: 5, 4, 3 = tři a méně nebo neuvedeno. */
/** Skupiny hvězd ve filtru Hotel; 0 = kategorie neuvedena (poznávací zájezdy, hotely bez třídy). */
export type StarsGroup = 5 | 4 | 3 | 0

export interface TourFilters {
  typ: TourKindFilter
  /** Slugy letišť; prázdné = všechna česká. */
  odlet: string[]
  /** Měsíce odletu YYYY-MM; prázdné = kdykoliv (když není od/do). */
  mesice: string[]
  /** Přesný rozsah odletu YYYY-MM-DD (má přednost před měsíci). */
  od: string | null
  do: string | null
  /** Rozsah nocí včetně; null = libovolná. */
  noci: [number, number] | null
  strava: BoardGroupId[]
  hvezdy: StarsGroup[]
  /** Slugy letovisek (area, jinak place). */
  letovisko: string[]
  ck: TourSourceId[]
  sleva: boolean
  razeni: SortFilter
  /** Kolik karet vykreslit (odkaz „Načíst další“). */
  pocet: number
}

export const TOURS_PAGE_SIZE = 12
const TOURS_MAX_COUNT = 240
export const DEFAULT_NIGHTS: [number, number] = [6, 8]

export const BOARD_GROUPS: { id: BoardGroupId; label: string; codes: string[] }[] = [
  { id: 'ai', label: 'All inclusive', codes: ['6', '8'] },
  { id: 'polo', label: 'Polopenze a plná penze', codes: ['4', '5'] },
  { id: 'snidane', label: 'Snídaně nebo bez stravy', codes: ['1', '2', '3'] },
  { id: 'program', label: 'Dle programu', codes: ['7'] },
]

export function boardGroupOf(code: string): BoardGroupId | null {
  return BOARD_GROUPS.find((g) => g.codes.includes(code))?.id ?? null
}

export const STARS_GROUPS: { id: StarsGroup; label: string }[] = [
  { id: 5, label: '5 hvězd' },
  { id: 4, label: '4 hvězdy' },
  { id: 3, label: '3 hvězdy a méně' },
  // Vlastní volba (23. 10. 2026): dřív se schovávala do „3 a méně“, ale tvořila
  // většinu skupiny (poznávací zájezdy Čedoku, hotely bez třídy).
  { id: 0, label: 'bez kategorie' },
]

export function starsGroupOf(stars: number | null): StarsGroup {
  if (stars === null || stars < 1) return 0
  if (stars >= 5) return 5
  if (stars >= 4) return 4
  return 3
}

/** Předvolby délky (vzor Jet2/TUI: 8–13 nocí dělá čtvrtinu rezervací). */
export const NIGHTS_PRESETS: { value: [number, number] | null; label: string; sub: string }[] = [
  { value: [3, 5], label: '3–5', sub: 'víkend' },
  { value: [6, 8], label: '6–8', sub: 'týden' },
  { value: [9, 11], label: '9–11', sub: '10 dní' },
  { value: [12, 15], label: '12–15', sub: 'dva týdny' },
  { value: [16, 60], label: '16+', sub: 'déle' },
  { value: null, label: 'vše', sub: 'libovolná' },
]

export const SORT_OPTIONS: { value: SortFilter; label: string }[] = [
  { value: 'doporucene', label: 'doporučené' },
  { value: 'cena', label: 'nejlevnější' },
  { value: 'sleva', label: 'největší sleva' },
  { value: 'odlet', label: 'nejbližší odlet' },
]

export const KIND_OPTIONS: { value: TourKindFilter; label: string }[] = [
  { value: 'vse', label: 'vše' },
  { value: 'pobyt', label: 'pobyt u moře' },
  { value: 'poznavaci', label: 'poznávací' },
]

/** Slug letoviska pro adresu (bez diakritiky, mezery → pomlčky). */
export function resortSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function resortName(offer: TourOffer): string | null {
  return offer.area || offer.place || null
}

type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v
const list = (v: string | string[] | undefined): string[] =>
  (first(v) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const isoDay = (v: string | undefined): string | null =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
const isMonth = (v: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

export function parseNights(v: string | undefined): [number, number] | null | undefined {
  if (v === undefined) return undefined
  if (v === 'vse') return null
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(v)
  if (!m) return undefined
  const a = Number(m[1])
  const b = Number(m[2])
  if (a < 1 || b < a || b > 60) return undefined
  return [a, b]
}

export function parseTourFilters(params: SearchParams | undefined): TourFilters {
  const p = params ?? {}
  const typ = first(p.typ)
  const razeni = first(p.razeni)
  const pocet = Number(first(p.pocet))
  const noci = parseNights(first(p.noci))
  const od = isoDay(first(p.od))
  const doDate = isoDay(first(p.do))
  return {
    typ: typ === 'pobyt' || typ === 'poznavaci' ? typ : 'vse',
    odlet: [...new Set(list(p.odlet).filter((s) => airportBySlug(s) !== null))],
    mesice: [...new Set(list(p.mesice).filter(isMonth))].sort(),
    od,
    do: doDate && (!od || doDate >= od) ? doDate : null,
    noci: noci === undefined ? DEFAULT_NIGHTS : noci,
    strava: [
      ...new Set(
        list(p.strava).filter((s): s is BoardGroupId => BOARD_GROUPS.some((g) => g.id === s)),
      ),
    ],
    hvezdy: [
      ...new Set(
        list(p.hvezdy)
          .map(Number)
          .filter((n): n is StarsGroup => n === 5 || n === 4 || n === 3 || n === 0),
      ),
    ],
    letovisko: [...new Set(list(p.letovisko).filter((s) => /^[a-z0-9-]{1,60}$/.test(s)))],
    ck: [...new Set(list(p.ck).filter(isTourSourceId))],
    sleva: first(p.sleva) === '1',
    razeni: SORT_OPTIONS.some((o) => o.value === razeni) ? (razeni as SortFilter) : 'doporucene',
    pocet:
      Number.isInteger(pocet) && pocet > TOURS_PAGE_SIZE
        ? Math.min(pocet, TOURS_MAX_COUNT)
        : TOURS_PAGE_SIZE,
  }
}

export const DEFAULT_TOUR_FILTERS: TourFilters = parseTourFilters(undefined)

export function nightsEqual(a: [number, number] | null, b: [number, number] | null): boolean {
  return a === null || b === null ? a === b : a[0] === b[0] && a[1] === b[1]
}

/**
 * Adresa stránky s upravenými filtry; výchozí hodnoty se nepíšou. Změna
 * filtru vrací počet karet na začátek.
 */
export function tourFiltersHref(
  basePath: string,
  filters: TourFilters,
  patch: Partial<TourFilters>,
): string {
  const f: TourFilters = { ...filters, pocet: TOURS_PAGE_SIZE, ...patch }
  const q = new URLSearchParams()
  if (f.typ !== 'vse') q.set('typ', f.typ)
  if (f.odlet.length) q.set('odlet', f.odlet.join(','))
  if (f.od) {
    q.set('od', f.od)
    if (f.do) q.set('do', f.do)
  } else if (f.mesice.length) q.set('mesice', f.mesice.join(','))
  if (!nightsEqual(f.noci, DEFAULT_NIGHTS)) {
    q.set('noci', f.noci ? `${f.noci[0]}-${f.noci[1]}` : 'vse')
  }
  if (f.strava.length) q.set('strava', f.strava.join(','))
  if (f.hvezdy.length) q.set('hvezdy', f.hvezdy.join(','))
  if (f.letovisko.length) q.set('letovisko', f.letovisko.join(','))
  if (f.ck.length) q.set('ck', f.ck.join(','))
  if (f.sleva) q.set('sleva', '1')
  if (f.razeni !== 'doporucene') q.set('razeni', f.razeni)
  if (f.pocet !== TOURS_PAGE_SIZE) q.set('pocet', String(f.pocet))
  const qs = q.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Zapnout/vypnout hodnotu v seznamu (zaškrtávátka jako odkazy). */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

/** Je nastaveno něco mimo výchozí stav (pro „Zrušit vše“)? */
export function hasActiveFilters(f: TourFilters): boolean {
  return (
    f.typ !== 'vse' ||
    f.odlet.length > 0 ||
    f.mesice.length > 0 ||
    f.od !== null ||
    !nightsEqual(f.noci, DEFAULT_NIGHTS) ||
    f.strava.length > 0 ||
    f.hvezdy.length > 0 ||
    f.letovisko.length > 0 ||
    f.ck.length > 0 ||
    f.sleva
  )
}

export const CLEARED_FILTERS: Partial<TourFilters> = {
  typ: 'vse',
  odlet: [],
  mesice: [],
  od: null,
  do: null,
  noci: DEFAULT_NIGHTS,
  strava: [],
  hvezdy: [],
  letovisko: [],
  ck: [],
  sleva: false,
}

// ─── Vyhodnocení ─────────────────────────────────────────────────────────────

/** Karta: řádek + jeho nejlevnější termín, který prošel filtrem data a délky. */
export interface TourCard {
  offer: TourOffer
  date: string
  nights: number
  price: number
  originalPrice: number | null
}

/** Jména vybraných letišť; prázdný výběr = česká. */
export function selectedAirportNames(f: TourFilters): string[] {
  if (f.odlet.length === 0) return [...CZ_AIRPORT_NAMES]
  return f.odlet.map((s) => airportBySlug(s)?.name).filter((n): n is string => !!n)
}

export function termMatches(term: TourOffer['terms'][number], f: TourFilters): boolean {
  const [date, nights, price, orig] = term
  if (f.noci && (nights < f.noci[0] || nights > f.noci[1])) return false
  // „Jen se slevou“ se vyhodnocuje po termínech: hotel může mít nezlevněný
  // nejlevnější termín a vedle něj zlevněný dražší — ten se pak má ukázat.
  if (f.sleva && orig <= price) return false
  if (f.od) {
    if (date < f.od) return false
    if (f.do && date > f.do) return false
    return true
  }
  if (f.mesice.length > 0 && !f.mesice.includes(date.slice(0, 7))) return false
  return true
}

/** Nejlevnější termín řádku po filtru data/délky; null = nic neprošlo. */
export function bestTerm(offer: TourOffer, f: TourFilters): TourCard | null {
  let best: TourOffer['terms'][number] | null = null
  for (const t of offer.terms) {
    if (!termMatches(t, f)) continue
    if (!best || t[2] < best[2]) best = t
  }
  if (!best) return null
  return {
    offer,
    date: best[0],
    nights: best[1],
    price: best[2],
    originalPrice: best[3] > best[2] ? best[3] : null,
  }
}

/** Filtry řádku bez ohledu na termíny (typ, odlet, strava, hvězdy, letovisko, cestovka). */
export function rowMatches(offer: TourOffer, f: TourFilters): boolean {
  if (f.typ !== 'vse' && offer.kind !== (f.typ === 'poznavaci' ? 'tour' : 'stay')) return false
  const airports = selectedAirportNames(f)
  if (!offer.departures.some((d) => airports.includes(d))) return false
  if (f.strava.length > 0) {
    const g = boardGroupOf(offer.board)
    if (!g || !f.strava.includes(g)) return false
  }
  if (f.hvezdy.length > 0 && !f.hvezdy.includes(starsGroupOf(offer.stars))) return false
  if (f.letovisko.length > 0) {
    const name = resortName(offer)
    if (!name || !f.letovisko.includes(resortSlug(name))) return false
  }
  if (f.ck.length > 0 && !f.ck.includes(offer.source as TourSourceId)) return false
  return true
}

export function discountPercent(card: { price: number; originalPrice: number | null }): number {
  if (!card.originalPrice || card.originalPrice <= card.price) return 0
  return Math.round(((card.originalPrice - card.price) / card.originalPrice) * 100)
}

const hotelKey = (o: TourOffer) => `${o.source}:${o.title}:${resortName(o) ?? ''}`

/**
 * Doporučené řazení: cena snížená o polovinu procenta slevy (−40 % sleva
 * posune nabídku, jako by byla o 20 % levnější). Sleva sama o sobě nemá
 * být víc než cena, ale má se projevit — čistě podle ceny by zlevněné
 * čtyřhvězdy prohrávaly s nezlevněnými tříhvězdami o pár set korun.
 */
export function recommendedScore(card: TourCard): number {
  return card.price * (1 - discountPercent(card) / 200)
}

/**
 * Karty: každý hotel JEDNOU — nejlevnější termín z jeho řádků, které projdou
 * filtry — seřazené podle zvoleného řazení.
 */
export function buildTourCards(offers: TourOffer[], f: TourFilters): TourCard[] {
  const byHotel = new Map<string, TourCard>()
  for (const offer of offers) {
    if (!rowMatches(offer, f)) continue
    const card = bestTerm(offer, f)
    if (!card) continue
    const key = hotelKey(offer)
    const current = byHotel.get(key)
    if (!current || card.price < current.price) byHotel.set(key, card)
  }
  const cards = [...byHotel.values()]
  switch (f.razeni) {
    case 'cena':
      cards.sort((a, b) => a.price - b.price)
      break
    case 'sleva':
      cards.sort((a, b) => discountPercent(b) - discountPercent(a) || a.price - b.price)
      break
    case 'odlet':
      cards.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.price - b.price))
      break
    default:
      cards.sort((a, b) => recommendedScore(a) - recommendedScore(b))
  }
  return cards
}

/**
 * Odlet pro kartu: z letišť řádku to nejbližší vybranému (česká první);
 * okolní letiště dostane štítek, ať je z karty jasné, odkud se letí.
 */
export function cardDeparture(card: TourCard, f: TourFilters): { label: string; near: boolean } {
  const selected = selectedAirportNames(f)
  const name = card.offer.departures.find((d) => selected.includes(d)) ?? card.offer.departures[0]
  const airport = airportByName(name)
  return { label: airport?.from ?? `z ${name}`, near: airport?.group === 'near' }
}

/** Jeden termín hotelu pro rozbalení v kartě (sloučeno přes řádky = skupiny letišť). */
export interface HotelTerm {
  date: string
  nights: number
  price: number
  /** Původní cena, jen když je vyšší; jinak null. */
  originalPrice: number | null
  /** Letiště skupiny (česká první), názvy jako v TOUR_AIRPORTS. */
  airports: string[]
}

/**
 * Všechny termíny hotelu z karty (rozbalení „nejlevnější z N termínů“,
 * rozhodnutí uživatele 23. 10. 2026): `filtered` = termíny, které prošly
 * aktuálním filtrem (odlet, datum, délka, sleva), `all` = všechny budoucí
 * termíny hotelu u téže cestovky bez ohledu na filtr. Řádky téhož hotelu
 * (různé skupiny letišť) se slučují; stejný odlet a délka ve více skupinách
 * je jeden řádek s nejnižší cenou a všemi letišti. Řazeno podle data.
 */
export function hotelTerms(
  offers: TourOffer[],
  card: TourCard,
  f: TourFilters,
): { all: HotelTerm[]; filtered: HotelTerm[] } {
  const key = hotelKey(card.offer)
  const rows = offers.filter((o) => hotelKey(o) === key)
  const merge = (pick: (o: TourOffer, t: TourOffer['terms'][number]) => boolean): HotelTerm[] => {
    const byTerm = new Map<string, HotelTerm>()
    for (const o of rows) {
      for (const t of o.terms) {
        if (!pick(o, t)) continue
        // Klíč = odlet + délka: tentýž termín z více letišť (různé ceny, Blue
        // Style má na jedno datum i 5 skupin) je jeden řádek s nejnižší cenou
        // a všemi letišti — jinak by hotel měl „938 termínů“.
        const k = `${t[0]}|${t[1]}`
        const cur = byTerm.get(k)
        if (cur) {
          for (const a of o.departures) if (!cur.airports.includes(a)) cur.airports.push(a)
          if (t[2] < cur.price) {
            cur.price = t[2]
            cur.originalPrice = t[3] > t[2] ? t[3] : null
          }
        } else {
          byTerm.set(k, {
            date: t[0],
            nights: t[1],
            price: t[2],
            originalPrice: t[3] > t[2] ? t[3] : null,
            airports: [...o.departures],
          })
        }
      }
    }
    for (const t of byTerm.values()) t.airports.sort((a, b) => airportRank(a) - airportRank(b))
    return [...byTerm.values()].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.price - b.price,
    )
  }
  const selected = selectedAirportNames(f)
  return {
    all: merge(() => true),
    filtered: merge(
      (o, t) =>
        rowMatches(o, f) && termMatches(t, f) && o.departures.some((d) => selected.includes(d)),
    ),
  }
}

// ─── Počty u voleb (facety) ──────────────────────────────────────────────────

/** Počet hotelů, které by filtr dal — pro počty u voleb a tlačítko „Zobrazit N“. */
export function countHotels(offers: TourOffer[], f: TourFilters): number {
  return buildTourCards(offers, f).length
}

export interface FacetOption<T> {
  value: T
  label: string
  count: number
  selected: boolean
}

/** Počty pro volby jednoho filtru: ostatní filtry platí, tenhle se zkouší hodnota po hodnotě. */
function facet<T>(
  offers: TourOffer[],
  f: TourFilters,
  values: { value: T; label: string }[],
  patch: (value: T) => Partial<TourFilters>,
  selected: (value: T) => boolean,
): FacetOption<T>[] {
  return values.map(({ value, label }) => ({
    value,
    label,
    count: countHotels(offers, { ...f, ...patch(value) }),
    selected: selected(value),
  }))
}

export function airportFacet(offers: TourOffer[], f: TourFilters): FacetOption<string>[] {
  return facet(
    offers,
    f,
    TOUR_AIRPORTS.map((a) => ({ value: a.slug, label: a.name })),
    (slug) => ({ odlet: [slug] }),
    (slug) => f.odlet.includes(slug),
  ).filter((o) => o.count > 0 || o.selected)
}

export function boardFacet(offers: TourOffer[], f: TourFilters): FacetOption<BoardGroupId>[] {
  return facet(
    offers,
    f,
    BOARD_GROUPS.map((g) => ({ value: g.id, label: g.label })),
    (id) => ({ strava: [id] }),
    (id) => f.strava.includes(id),
  ).filter((o) => o.count > 0 || o.selected)
}

export function starsFacet(offers: TourOffer[], f: TourFilters): FacetOption<StarsGroup>[] {
  return facet(
    offers,
    f,
    STARS_GROUPS.map((g) => ({ value: g.id, label: g.label })),
    (id) => ({ hvezdy: [id] }),
    (id) => f.hvezdy.includes(id),
  ).filter((o) => o.count > 0 || o.selected)
}

export function kindFacet(offers: TourOffer[], f: TourFilters): FacetOption<TourKindFilter>[] {
  return facet(
    offers,
    f,
    KIND_OPTIONS.filter((k) => k.value !== 'vse'),
    (value) => ({ typ: value }),
    (value) => f.typ === value,
  ).filter((o) => o.count > 0 || o.selected)
}

export function sourceFacet(offers: TourOffer[], f: TourFilters): FacetOption<TourSourceId>[] {
  const present = new Set(offers.map((o) => o.source))
  return facet(
    offers,
    f,
    TOUR_SOURCES.filter((s) => present.has(s.id)).map((s) => ({ value: s.id, label: s.label })),
    (id) => ({ ck: [id] }),
    (id) => f.ck.includes(id),
  )
}

/** Letoviska podle názvu (area, jinak place), seřazená podle počtu. */
export function resortFacet(offers: TourOffer[], f: TourFilters): FacetOption<string>[] {
  const names = new Map<string, string>()
  for (const o of offers) {
    const n = resortName(o)
    if (n) names.set(resortSlug(n), n)
  }
  return facet(
    offers,
    f,
    [...names.entries()].map(([slug, label]) => ({ value: slug, label })),
    (slug) => ({ letovisko: [slug] }),
    (slug) => f.letovisko.includes(slug),
  )
    .filter((o) => o.count > 0 || o.selected)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'cs'))
}

/** Měsíce (dnes + 12) a počet hotelů v každém při ostatních filtrech. */
export function monthFacet(
  offers: TourOffer[],
  f: TourFilters,
  today: string,
): FacetOption<string>[] {
  const months: string[] = []
  const [y, m] = today.split('-').map(Number)
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return facet(
    offers,
    f,
    months.map((value) => ({ value, label: value })),
    (value) => ({ mesice: [value], od: null, do: null }),
    (value) => f.mesice.includes(value),
  )
}

/** Dny s odletem (pro tečky v kalendáři) při ostatních filtrech, bez filtru data. */
export function departureDays(offers: TourOffer[], f: TourFilters): string[] {
  const days = new Set<string>()
  const noDate: TourFilters = { ...f, mesice: [], od: null, do: null }
  for (const o of offers) {
    if (!rowMatches(o, noDate)) continue
    for (const t of o.terms) if (termMatches(t, noDate)) days.add(t[0])
  }
  return [...days].sort()
}

// ─── Letoviska („Kam do Egypta“) ──────────────────────────────────────────────

export interface ResortSummary {
  name: string
  slug: string
  minPrice: number
  photoUrl: string | null
  hotels: number
}

/** Letoviska s nejnižší cenou z karet (po filtrech), fotka = nejlevnější hotel. */
export function buildResorts(cards: TourCard[], limit = 6): ResortSummary[] {
  // Klíč = slug, ne název: cestovky píšou totéž letovisko různě („Sharm el
  // Sheikh“ vs „Sharm El Sheikh“) a jedno letovisko by bylo v pásu dvakrát.
  const byArea = new Map<string, ResortSummary>()
  for (const c of cards) {
    if (c.offer.kind !== 'stay') continue
    const name = resortName(c.offer)
    if (!name) continue
    const slug = resortSlug(name)
    const entry = byArea.get(slug)
    if (!entry) {
      byArea.set(slug, {
        name,
        slug,
        minPrice: c.price,
        photoUrl: c.offer.photoUrl,
        hotels: 1,
      })
      continue
    }
    entry.hotels++
    if (c.price < entry.minPrice) {
      entry.minPrice = c.price
      entry.photoUrl = c.offer.photoUrl ?? entry.photoUrl
    }
  }
  return [...byArea.values()].sort((a, b) => a.minPrice - b.minPrice).slice(0, limit)
}

/** Popisky použitých filtrů pro řádek s křížky: text + patch, který filtr zruší. */
export function appliedFilterTags(
  f: TourFilters,
  resortLabel: (slug: string) => string,
): { label: string; patch: Partial<TourFilters> }[] {
  const tags: { label: string; patch: Partial<TourFilters> }[] = []
  if (f.typ !== 'vse') {
    tags.push({ label: KIND_OPTIONS.find((k) => k.value === f.typ)!.label, patch: { typ: 'vse' } })
  }
  for (const slug of f.odlet) {
    const a = airportBySlug(slug)
    if (a) tags.push({ label: a.name, patch: { odlet: f.odlet.filter((s) => s !== slug) } })
  }
  if (f.od) {
    tags.push({
      label: f.do && f.do !== f.od ? `${formatDay(f.od)} – ${formatDay(f.do)}` : formatDay(f.od),
      patch: { od: null, do: null },
    })
  } else {
    for (const m of f.mesice) {
      tags.push({ label: formatMonth(m), patch: { mesice: f.mesice.filter((x) => x !== m) } })
    }
  }
  if (!nightsEqual(f.noci, DEFAULT_NIGHTS)) {
    tags.push({
      label: f.noci ? `${f.noci[0]}–${f.noci[1]} nocí` : 'libovolná délka',
      patch: { noci: DEFAULT_NIGHTS },
    })
  }
  for (const g of f.strava) {
    tags.push({
      label: BOARD_GROUPS.find((b) => b.id === g)!.label.toLowerCase(),
      patch: { strava: f.strava.filter((x) => x !== g) },
    })
  }
  for (const s of f.hvezdy) {
    tags.push({
      label: STARS_GROUPS.find((g) => g.id === s)!.label,
      patch: { hvezdy: f.hvezdy.filter((x) => x !== s) },
    })
  }
  for (const slug of f.letovisko) {
    tags.push({
      label: resortLabel(slug),
      patch: { letovisko: f.letovisko.filter((x) => x !== slug) },
    })
  }
  for (const id of f.ck) {
    tags.push({
      label: TOUR_SOURCES.find((s) => s.id === id)?.label ?? id,
      patch: { ck: f.ck.filter((x) => x !== id) },
    })
  }
  if (f.sleva) tags.push({ label: 'jen se slevou', patch: { sleva: false } })
  return tags
}

/** „2026-11-22“ → „22. 11. 2026“. */
export function formatDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : iso
}

const MONTH_NAMES = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec',
]
const MONTH_SHORT = [
  'led',
  'úno',
  'bře',
  'dub',
  'kvě',
  'čvn',
  'čvc',
  'srp',
  'zář',
  'říj',
  'lis',
  'pro',
]

/** „2026-11“ → „listopad 2026“ (short: „lis“). */
export function formatMonth(ym: string, short = false): string {
  const m = Number(ym.slice(5, 7))
  const name = (short ? MONTH_SHORT : MONTH_NAMES)[m - 1] ?? ym
  return short ? name : `${name} ${ym.slice(0, 4)}`
}

function monthDiff(a: string, b: string): number {
  return (
    (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5))
  )
}

/** Shrnutí termínu pro horní pole: „listopad – prosinec 2026“, „22. 11. – 6. 12. 2026“, „kdykoliv“. */
export function dateSummary(f: TourFilters): string {
  if (f.od) {
    return f.do && f.do !== f.od ? `${formatDay(f.od)} – ${formatDay(f.do)}` : formatDay(f.od)
  }
  if (f.mesice.length === 0) return 'kdykoliv'
  const sorted = [...f.mesice].sort()
  if (sorted.length === 1) return formatMonth(sorted[0])
  const firstMonth = sorted[0]
  const last = sorted[sorted.length - 1]
  const sameYear = firstMonth.slice(0, 4) === last.slice(0, 4)
  // Souvislá řada měsíců → „listopad – prosinec 2026“, jinak výčet.
  const contiguous = sorted.every((m, i) => i === 0 || monthDiff(sorted[i - 1], m) === 1)
  if (contiguous && sameYear) {
    return `${MONTH_NAMES[Number(firstMonth.slice(5)) - 1]} – ${formatMonth(last)}`
  }
  return sorted.map((m) => formatMonth(m, true)).join(', ')
}

export function nightsSummary(noci: [number, number] | null): string {
  if (!noci) return 'libovolná délka'
  const preset = NIGHTS_PRESETS.find(
    (p) => p.value && p.value[0] === noci[0] && p.value[1] === noci[1],
  )
  if (preset) return `${preset.sub} (${preset.label} nocí)`
  return noci[0] === noci[1] ? `${noci[0]} nocí` : `${noci[0]}–${noci[1]} nocí`
}
