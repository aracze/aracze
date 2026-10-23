import { XMLParser } from 'fast-xml-parser'
import { airportRank, normalizeAirportName } from './tour-airports'
import type { TourSourceId } from './tour-sources'

/**
 * Parser nabídkového feedu ve formátu **Sdovolená.cz** (Čedok přes SFTP, TUI
 * přes https; Fischer/Exim/Blue Style na vyžádání). Feedy se liší v drobnostech
 * (velikost písmen tagů, strava jen popisem, „Brno-Tuřany“ místo „Brno“) —
 * parser je sjednocuje. Spec: https://o-seznam.cz/napoveda/sdovolena/pro-inzerenty/specifikace-xml/
 *
 * Feed je obří (Čedok 3,4 GB: každý `<term>` nese dvě dlouhé URL), proto se
 * nečte celý do paměti — `TourChunker` ze streamu vyřezává jednotlivé
 * `<tour>…</tour>` a ty se parsují po jednom (fast-xml-parser, který už
 * v projektu je; streamovací parser by byl další závislost).
 *
 * Z každého zájezdu vzniknou ŘÁDKY nabídek: jeden za každou kombinaci
 * strava × doprava × odletová místa (`term_group`) s LETECKOU dopravou
 * a odletem z českého NEBO okolního letiště (seznam TOUR_AIRPORTS; Vídeň,
 * Bratislava, Krakov… — jiná se vyřazují), s nejlevnějším budoucím termínem
 * a navíc se VŠEMI budoucími termíny (`terms`), ať web umí filtr podle měsíce
 * či přesných dnů a kalendář s dny odletu. Díky řádkům po skupinách fungují
 * filtry stravy a odletu na stránce poctivě (hotel s all inclusive i
 * polopenzí má dva řádky, web ukáže ten, který projde filtrem). Okolní
 * letiště jsou na webu jen na vyžádání a karta je značí — výchozí je Česko.
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

/**
 * Kompaktní termín pro JSON: [odlet YYYY-MM-DD, nocí, cena, původní cena nebo 0].
 * Pole místo objektu — u tisíců řádků × desítek termínů dělá název klíče rozdíl
 * v megabajtech (limit 2 MB položky Next cache, viz lib/payload.ts).
 */
export type TourTerm = [string, number, number, number]

/** Strop termínů na řádek — ochrana velikosti JSON (Čedok má u hotelu i 120 termínů). */
export const MAX_TERMS_PER_ROW = 200

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
  /** Odletová letiště (jen z TOUR_AIRPORTS), česká první. */
  departures: string[]
  /** Všechny budoucí termíny skupiny podle data, nejvýš MAX_TERMS_PER_ROW. */
  terms: TourTerm[]
  termFrom: string
  termTo: string | null
  nights: number
  /** Cena za osobu v Kč (dospělý, `desc_id` 1) — nejlevnější budoucí termín skupiny. */
  price: number
  /** Původní cena téhož termínu, jen když je vyšší než `price` (sleva). */
  originalPrice: number | null
  /** Počet budoucích termínů skupiny (i nad strop `terms`) — „18 termínů“ na kartě. */
  termCount: number
  photoUrl: string | null
  /** Odkaz na detail zájezdu u cestovky (bez provize — tu přidá /go/zajezd). */
  detailUrl: string
  lat: number | null
  lng: number | null
  /** Stránka hotelu u Invie (recenze) — plní jen zdroj invia (src/lib/invia-tours.ts). */
  inviaUrl?: string | null
}

type Loc = { country_id?: unknown; area_title?: unknown; place_title?: unknown }
type Term = {
  start?: unknown
  end?: unknown
  night_count?: unknown
  prices?: { price?: { desc_id?: unknown; final_price?: unknown }[]; price_orig?: unknown }
}
type TermGroup = {
  board?: { id?: unknown; desc?: unknown }
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
  // Čedok píše tagy malými písmeny, TUI velkými (`<TOUR_ID>`) — spec je
  // nepředepisuje, tak se všechno sjednotí na malá.
  transformTagName: (name) => name.toLowerCase(),
  isArray: (_name, jpath) => ARRAY_PATHS.has(String(jpath)),
})

/**
 * Kód stravy: primárně `board/id` z číselníku; když chybí (TUI u „All
 * inclusive plus“ posílá prázdné id a jen popis), odvodí se z popisu.
 */
export function boardCode(id: unknown, desc: unknown): string | null {
  const code = text(id)
  if (BOARD_LABELS[code]) return code
  const d = text(desc).toLowerCase()
  if (!d) return null
  if (d.includes('all inclusive') || d.includes('all-inclusive')) {
    return d.includes('ultra') || d.includes('plus') || d.includes('premium') ? '8' : '6'
  }
  if (d.includes('plná penze') || d.includes('plna penze')) return '5'
  if (d.includes('polopenze')) return '4'
  if (d.includes('večeře') || d.includes('vecere')) return '3'
  if (d.includes('snídan') || d.includes('snidan')) return '2'
  if (d.includes('bez strav')) return '1'
  if (d.includes('program')) return '7'
  return null
}

/**
 * Textová hodnota z parseru, ZPLOŠTĚNÁ: fast-xml-parser vrací podřetězce
 * velkého XML a V8 je drží jako „sliced strings“ ukazující do původního
 * řetězce — každý uložený název hotelu by tak držel v paměti celý zájezd
 * (stovky kB) až do konce syncu (ověřeno: špička 600 MB RSS). Průchod přes
 * Buffer vytvoří samostatnou kopii.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
}
/**
 * Druhé kolo dekódování entit: Blue Style posílá názvy zakódované dvakrát
 * („Resort &amp;amp; Spa“, „Kumk&amp;#xF6;y“), takže po parseru zůstane
 * `&amp;` a `&#xF6;` v textu (23. 10. 2026). U správně kódovaných feedů
 * se nic nezmění (po parseru už entity nejsou).
 */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m
  })
}

const text = (v: unknown): string => {
  const raw = (v == null ? '' : String(v)).trim()
  return raw.length === 0 ? '' : decodeEntities(Buffer.from(raw, 'utf8').toString('utf8'))
}
const isoDate = (v: unknown): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text(v))
  return m ? m[1] : null
}
/** Souřadnice jen v platném rozsahu a ne 0/0 (chybějící hodnota ve feedech). */
export function validCoords(
  lat: number | null,
  lng: number | null,
): [number | null, number | null] {
  if (lat === null || lng === null) return [null, null]
  if (lat === 0 && lng === 0) return [null, null]
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return [null, null]
  return [lat, lng]
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
  // Čedok u části hotelů posílá 0/0 („Null Island“) — bereme jako chybějící.
  const [lat, lng] = validCoords(
    num(tour.accommodation?.gps?.lat),
    num(tour.accommodation?.gps?.lon),
  )

  const rows: TourOfferRow[] = []
  for (const group of tour.term_groups?.term_group ?? []) {
    if (text(group.transport?.id) !== TRANSPORT_FLIGHT) continue
    const board = boardCode(group.board?.id, group.board?.desc)
    if (!board) continue
    const departures = (group.dept_places?.place ?? [])
      .map((p) => normalizeAirportName(text(p)))
      .filter((p): p is string => p !== null)
      // Česká letiště první (Praha, Brno…), ať je na kartě hlavní odlet stabilní.
      .sort((a, b) => airportRank(a) - airportRank(b))
    const uniqueDepartures = [...new Set(departures)]
    if (uniqueDepartures.length === 0) continue

    let best: {
      price: number
      orig: number | null
      from: string
      to: string | null
      nights: number
    } | null = null
    const terms: TourTerm[] = []
    for (const term of group.terms?.term ?? []) {
      const from = isoDate(term.start)
      if (!from || from < today) continue
      const adult = (term.prices?.price ?? []).find((p) => text(p.desc_id) === '1')
      const price = num(adult?.final_price ?? term.prices?.price?.[0]?.final_price)
      if (!price || price <= 0) continue
      const nights = Math.round(num(term.night_count) ?? 0)
      if (nights <= 0) continue
      const origRaw = num(term.prices?.price_orig)
      const orig = origRaw && origRaw > price ? Math.round(origRaw) : 0
      terms.push([from, nights, Math.round(price), orig])
      if (!best || price < best.price) {
        best = {
          price: Math.round(price),
          orig: orig || null,
          from,
          to: isoDate(term.end),
          nights,
        }
      }
    }
    if (!best) continue
    terms.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[2] - b[2]))
    const termCount = terms.length

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
      terms: terms.slice(0, MAX_TERMS_PER_ROW),
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
/** Pozice tagu bez ohledu na velikost písmen (Čedok `<tour>`, TUI `<TOUR>`). */
function indexOfTag(haystack: string, tag: string, from: number): number {
  const lower = haystack.indexOf(tag, from)
  const upper = haystack.indexOf(tag.toUpperCase(), from)
  if (lower === -1) return upper
  if (upper === -1) return lower
  return Math.min(lower, upper)
}

export class TourChunker {
  private buffer = ''

  push(chunk: string): string[] {
    this.buffer += chunk
    const out: string[] = []
    for (;;) {
      const start = indexOfTag(this.buffer, '<tour>', 0)
      if (start === -1) {
        // Nic rozpracovaného: držet jen konec, kde by mohl začínat ořezaný `<tour>`.
        if (this.buffer.length > 16) this.buffer = this.buffer.slice(-16)
        return out
      }
      const end = indexOfTag(this.buffer, '</tour>', start)
      if (end === -1) {
        if (start > 0) this.buffer = this.buffer.slice(start)
        return out
      }
      out.push(this.buffer.slice(start, end + '</tour>'.length))
      this.buffer = this.buffer.slice(end + '</tour>'.length)
    }
  }
}
