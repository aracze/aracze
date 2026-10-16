import { XMLParser } from 'fast-xml-parser'
import { CZECH_AIRPORTS } from './kiwi-deals'
import type { TourSourceId } from './tour-sources'

/**
 * Parser nabídkového feedu ve formátu **Sdovolená.cz** (Čedok a na vyžádání
 * i Fischer/Exim/TUI/Blue Style). Spec: https://o-seznam.cz/napoveda/sdovolena/pro-inzerenty/specifikace-xml/
 *
 * Feed je obří (Čedok 3,4 GB: každý `<term>` nese dvě dlouhé URL), proto se
 * nečte celý do paměti — `TourChunker` ze streamu vyřezává jednotlivé
 * `<tour>…</tour>` a ty se parsují po jednom (fast-xml-parser, který už
 * v projektu je; streamovací parser by byl další závislost).
 *
 * Z každého zájezdu vzniknou ŘÁDKY nabídek: jeden za každou kombinaci
 * strava × doprava × odletová místa (`term_group`) s LETECKOU dopravou
 * a odletem z českého letiště, s nejlevnějším budoucím termínem. Díky tomu
 * fungují filtry stravy a odletu na stránce poctivě (hotel s all inclusive
 * i polopenzí má dva řádky, web ukáže ten, který projde filtrem).
 * Odlety z Vídně, Bratislavy či Krakova se vyřazují — inzerovat Čechům
 * „zájezd za X“ s odletem z Vídně by bylo zavádějící (stejné pravidlo jako
 * u Invie v syncAffiliateDeals).
 */

/** Číselník typu zájezdu — web rozlišuje jen pobyt a poznávací. */
export type TourKind = 'stay' | 'tour'

/** Číselník stravy (board/id) → popisek pro kartu. */
export const BOARD_LABELS: Record<string, string> = {
  '1': 'bez stravy',
  '2': 'snídaně',
  '3': 'večeře',
  '4': 'polopenze',
  '5': 'plná penze',
  '6': 'all inclusive',
  '7': 'dle programu',
  '8': 'ultra all inclusive',
}

/**
 * Číselník úrovně ubytování (class_id 1–11) → hvězdy. Spec má 8 = ****,
 * 9 = ****+, 10 = *****, 11 = *****+; Čedok ale posílá 9 u běžných
 * čtyřhvězdiček a 11 u pětihvězdiček (ověřeno na známých hotelech 16. 10.
 * 2026), takže „plus“ stupně se zaokrouhlují dolů na celé hvězdy — půlhvězda
 * by na kartě slibovala něco, co cestovka sama neuvádí. 1 = neuvedeno.
 */
export function starsFromClass(classId: string | number | null | undefined): number | null {
  const n = Number(classId)
  if (!Number.isInteger(n) || n < 2 || n > 11) return null
  return Math.floor(n / 2)
}

const TRANSPORT_FLIGHT = '2'
const KIND_BY_TOUR_TYPE: Record<string, TourKind> = { '1': 'stay', '2': 'tour' }

const CZECH_CITY_NAMES: readonly string[] = CZECH_AIRPORTS.map((a) => a.name)

/** Jeden řádek nabídky (viz hlavička) — tvar, který sync zapisuje do kolekce `tour-offers`. */
export interface TourOfferRow {
  source: TourSourceId
  externalId: string
  kind: TourKind
  title: string
  countryCode: string
  area: string | null
  place: string | null
  stars: number | null
  board: string
  /** Odletová města v ČR (jen ta z `CZECH_AIRPORTS`), Praha první. */
  departures: string[]
  termFrom: string
  termTo: string | null
  nights: number
  /** Cena za osobu v Kč (dospělý, `desc_id` 1) — nejlevnější budoucí termín skupiny. */
  price: number
  /** Původní cena téhož termínu, jen když je vyšší než `price` (sleva). */
  originalPrice: number | null
  /** Počet budoucích termínů skupiny — „18 termínů“ na kartě. */
  termCount: number
  photoUrl: string | null
  /** Odkaz na detail zájezdu u cestovky (bez provize — tu přidá /go/zajezd). */
  detailUrl: string
  lat: number | null
  lng: number | null
}

type Loc = { country_id?: unknown; area_title?: unknown; place_title?: unknown }
type Term = {
  start?: unknown
  end?: unknown
  night_count?: unknown
  prices?: { price?: { desc_id?: unknown; final_price?: unknown }[]; price_orig?: unknown }
}
type TermGroup = {
  board?: { id?: unknown }
  transport?: { id?: unknown }
  dept_places?: { place?: unknown[] }
  terms?: { term?: Term[] }
}
type RawTour = {
  tour_id?: unknown
  tour_type?: unknown
  tour_title?: unknown
  tour_detail_url?: unknown
  locations?: { location?: Loc[] }
  accommodation?: { class_id?: unknown; title?: unknown; gps?: { lat?: unknown; lon?: unknown } }
  photos?: { photo?: { order?: unknown; url?: unknown }[] }
  term_groups?: { term_group?: TermGroup[] }
}

// Pole, která musí být VŽDY pole — jinak parser jediný prvek zploští na objekt.
const ARRAY_PATHS = new Set([
  'tour.locations.location',
  'tour.photos.photo',
  'tour.term_groups.term_group',
  'tour.term_groups.term_group.dept_places.place',
  'tour.term_groups.term_group.terms.term',
  'tour.term_groups.term_group.terms.term.prices.price',
])

const parser = new XMLParser({
  ignoreAttributes: true,
  // Čísla nechat jako text: `tour_id` i ceny se dál zpracovávají ručně a
  // automatický převod by z „0123“ udělal 123.
  parseTagValue: false,
  isArray: (_name, jpath) => ARRAY_PATHS.has(String(jpath)),
})

/**
 * Textová hodnota z parseru, ZPLOŠTĚNÁ: fast-xml-parser vrací podřetězce
 * velkého XML a V8 je drží jako „sliced strings“ ukazující do původního
 * řetězce — každý uložený název hotelu by tak držel v paměti celý zájezd
 * (stovky kB) až do konce syncu (ověřeno: špička 600 MB RSS). Průchod přes
 * Buffer vytvoří samostatnou kopii.
 */
const text = (v: unknown): string => {
  const raw = (v == null ? '' : String(v)).trim()
  return raw.length === 0 ? '' : Buffer.from(raw, 'utf8').toString('utf8')
}
const isoDate = (v: unknown): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text(v))
  return m ? m[1] : null
}
const num = (v: unknown): number | null => {
  const n = Number(text(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Odstraní z XML zájezdu odkazy jednotlivých termínů (`availability`,
 * `purchase_url`) — nesou ~80 % bajtů feedu a web je nepotřebuje (odkaz
 * karty je `tour_detail_url`). Bez nich parser staví třetinový strom, což
 * drží paměť syncu nízko (produkce má 1,8 GB RAM pro všechno).
 */
export function stripTermUrls(xml: string): string {
  return xml.replace(/<(availability|purchase_url)>[\s\S]*?<\/\1>/g, '')
}

/**
 * Rozebere jeden `<tour>…</tour>` na řádky nabídek. `today` (YYYY-MM-DD,
 * pražský den) odřezává propadlé termíny. Zájezd bez letecké skupiny
 * z českého letiště nebo bez budoucího termínu dá prázdné pole.
 */
export function parseSdovolenaTour(
  xml: string,
  source: TourSourceId,
  today: string,
): TourOfferRow[] {
  let parsed: { tour?: RawTour }
  try {
    parsed = parser.parse(stripTermUrls(xml)) as { tour?: RawTour }
  } catch {
    return []
  }
  const tour = parsed.tour
  if (!tour) return []

  const externalId = text(tour.tour_id)
  const title = text(tour.tour_title) || text(tour.accommodation?.title)
  const detailUrl = text(tour.tour_detail_url)
  const kind = KIND_BY_TOUR_TYPE[text(tour.tour_type).charAt(0)]
  if (!externalId || !title || !detailUrl.startsWith('https://') || !kind) return []

  const loc = tour.locations?.location?.[0]
  const countryCode = text(loc?.country_id).toUpperCase()
  if (!/^[A-Z]{3}$/.test(countryCode)) return []
  const area = text(loc?.area_title) || null
  const place = text(loc?.place_title) || null

  const stars = starsFromClass(text(tour.accommodation?.class_id))
  const photos = [...(tour.photos?.photo ?? [])].sort(
    (a, b) => (num(a.order) ?? 0) - (num(b.order) ?? 0),
  )
  const photoUrl = photos.map((p) => text(p.url)).find((u) => u.startsWith('https://')) ?? null
  const lat = num(tour.accommodation?.gps?.lat)
  const lng = num(tour.accommodation?.gps?.lon)

  const rows: TourOfferRow[] = []
  for (const group of tour.term_groups?.term_group ?? []) {
    if (text(group.transport?.id) !== TRANSPORT_FLIGHT) continue
    const board = text(group.board?.id)
    if (!BOARD_LABELS[board]) continue
    const departures = (group.dept_places?.place ?? [])
      .map(text)
      .filter((p) => CZECH_CITY_NAMES.includes(p))
      // Praha první (pořadí CZECH_AIRPORTS), ať je na kartě hlavní odlet stabilní.
      .sort((a, b) => CZECH_CITY_NAMES.indexOf(a) - CZECH_CITY_NAMES.indexOf(b))
    const uniqueDepartures = [...new Set(departures)]
    if (uniqueDepartures.length === 0) continue

    let best: {
      price: number
      orig: number | null
      from: string
      to: string | null
      nights: number
    } | null = null
    let termCount = 0
    for (const term of group.terms?.term ?? []) {
      const from = isoDate(term.start)
      if (!from || from < today) continue
      const adult = (term.prices?.price ?? []).find((p) => text(p.desc_id) === '1')
      const price = num(adult?.final_price ?? term.prices?.price?.[0]?.final_price)
      if (!price || price <= 0) continue
      termCount++
      const nights = Math.round(num(term.night_count) ?? 0)
      if (nights <= 0) continue
      if (!best || price < best.price) {
        const orig = num(term.prices?.price_orig)
        best = {
          price: Math.round(price),
          orig: orig && orig > price ? Math.round(orig) : null,
          from,
          to: isoDate(term.end),
          nights,
        }
      }
    }
    if (!best) continue

    rows.push({
      source,
      externalId,
      kind,
      title,
      countryCode,
      area,
      place,
      stars,
      board,
      departures: uniqueDepartures,
      termFrom: best.from,
      termTo: best.to,
      nights: best.nights,
      price: best.price,
      originalPrice: best.orig,
      termCount,
      photoUrl,
      detailUrl,
      lat,
      lng,
    })
  }
  return rows
}

/**
 * Vyřezává `<tour>…</tour>` z proudu textu. `push` vrací hotové zájezdy
 * z dosud přijatého textu; zbytek (rozpracovaný zájezd) si drží. Obal
 * `<tours>` a hlavičku ignoruje. Hotové kusy se z bufferu hned odřezávají,
 * takže paměť drží jen jeden rozpracovaný zájezd (stovky kB), ne feed.
 */
export class TourChunker {
  private buffer = ''

  push(chunk: string): string[] {
    this.buffer += chunk
    const out: string[] = []
    for (;;) {
      const start = this.buffer.indexOf('<tour>')
      if (start === -1) {
        // Nic rozpracovaného: držet jen konec, kde by mohl začínat ořezaný `<tour>`.
        if (this.buffer.length > 16) this.buffer = this.buffer.slice(-16)
        return out
      }
      const end = this.buffer.indexOf('</tour>', start)
      if (end === -1) {
        if (start > 0) this.buffer = this.buffer.slice(start)
        return out
      }
      out.push(this.buffer.slice(start, end + '</tour>'.length))
      this.buffer = this.buffer.slice(end + '</tour>'.length)
    }
  }
}
