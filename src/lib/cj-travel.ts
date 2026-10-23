import { boardCode, type TourOfferRow, validCoords } from './sdovolena'
import { pragueToday } from './kiwi-deals'
import { airportRank } from './tour-airports'
import { isSourceHost, type TourSource } from './tour-sources'

/**
 * Nabídky zájezdů z **produktového katalogu sítě CJ** (GraphQL
 * https://ads.api.cj.com/query, typ `TravelExperience`). Fischer a Exim
 * nedávají feed Sdovolená — VIVnetworks odkázal na „promo feed ze CJ“
 * (23. 10. 2026). Katalog je jiný tvar než Sdovolená: jeden produkt = jeden
 * hotel s JEDINOU nabídkou (termín, délka, strava, cena za osobu při dvou
 * dospělých — stejně jako u Sdovolená), bez původní ceny a bez dalších
 * termínů. Nabídka se proto do `TourOfferRow` překládá s jedním termínem.
 *
 * Oba katalogy jsou společná nabídka skupiny DER Touristik se značkami
 * FISCHER / EXIM TOURS / KARTAGO TOURS a tytéž hotely za stejné ceny jsou
 * v obou (ověřeno: 155 ze 179 eximáckých hotelů Egypta v katalogu Fischeru je
 * i v katalogu Eximu). Aby se karty nezdvojily, bere se z každého katalogu jen
 * jeho vlastní značka (`cjBrands` u zdroje).
 *
 * Nejspolehlivější údaje nese deep-link na web cestovky (parametry `DD`
 * odlet, `NN` nocí, `DI` kód stravy); pole katalogu slouží jako záloha.
 * `travelStartDate` je půlnoc místního času v UTC („2027-01-06T23:00:00Z“
 * = 7. 1. v Praze), proto se převádí na pražský den.
 */

export const CJ_GRAPHQL_URL = 'https://ads.api.cj.com/query'
const PAGE_SIZE = 500
const MAX_PAGES = 40

export interface CjTravelProduct {
  id: string
  title: string | null
  brand: string | null
  link: string | null
  imageLink: string | null
  price: { amount: string; currency: string }
  destinationCountry: string | null
  destinationName: string | null
  destinationLatitude: string | null
  destinationLongitude: string | null
  originCity: string | null
  starRating: string | null
  diningOptions: string | null
  duration: string | null
  travelStartDate: string | null
}

const FIELDS = `id title brand link imageLink price { amount currency }
  ... on TravelExperience {
    destinationCountry destinationName destinationLatitude destinationLongitude
    originCity starRating diningOptions duration travelStartDate
  }`

/** Stáhne celý katalog partnera po stránkách. */
export async function fetchCjTravelProducts(
  partnerId: string,
  token: string,
  companyId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CjTravelProduct[]> {
  const all: CjTravelProduct[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = `{ products(companyId: "${companyId}", partnerIds: ["${partnerId}"], limit: ${PAGE_SIZE}, offset: ${
      page * PAGE_SIZE
    }) { totalCount count resultList { ${FIELDS} } } }`
    const res = await fetchImpl(CJ_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`CJ API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as {
      errors?: { message: string }[]
      data?: { products?: { totalCount: number; count: number; resultList: CjTravelProduct[] } }
    }
    if (json.errors?.length) throw new Error(`CJ API: ${json.errors[0].message}`)
    const d = json.data?.products
    if (!d) throw new Error('CJ API: odpověď bez products')
    all.push(...d.resultList)
    if (d.count === 0 || all.length >= d.totalCount) break
  }
  return all
}

/** ISO 3166-1 alpha-2 → alpha-3 pro země, které se v katalozích cestovek objevují. */
const ISO2_TO_ISO3: Record<string, string> = {
  AE: 'ARE',
  AL: 'ALB',
  AM: 'ARM',
  AT: 'AUT',
  BG: 'BGR',
  BH: 'BHR',
  BR: 'BRA',
  CH: 'CHE',
  CN: 'CHN',
  CO: 'COL',
  CR: 'CRI',
  CU: 'CUB',
  CV: 'CPV',
  CY: 'CYP',
  CZ: 'CZE',
  DE: 'DEU',
  DK: 'DNK',
  DO: 'DOM',
  EG: 'EGY',
  ES: 'ESP',
  FI: 'FIN',
  FR: 'FRA',
  GB: 'GBR',
  GE: 'GEO',
  GR: 'GRC',
  HR: 'HRV',
  HU: 'HUN',
  ID: 'IDN',
  IE: 'IRL',
  IL: 'ISR',
  IN: 'IND',
  IS: 'ISL',
  IT: 'ITA',
  JM: 'JAM',
  JO: 'JOR',
  JP: 'JPN',
  KE: 'KEN',
  KH: 'KHM',
  KR: 'KOR',
  LK: 'LKA',
  LV: 'LVA',
  MA: 'MAR',
  ME: 'MNE',
  MT: 'MLT',
  MU: 'MUS',
  MV: 'MDV',
  MX: 'MEX',
  MY: 'MYS',
  NL: 'NLD',
  NO: 'NOR',
  OM: 'OMN',
  PA: 'PAN',
  PL: 'POL',
  PT: 'PRT',
  QA: 'QAT',
  SA: 'SAU',
  SC: 'SYC',
  SE: 'SWE',
  SG: 'SGP',
  SI: 'SVN',
  SK: 'SVK',
  TH: 'THA',
  TN: 'TUN',
  TR: 'TUR',
  TZ: 'TZA',
  US: 'USA',
  VN: 'VNM',
  ZA: 'ZAF',
  ZM: 'ZMB',
}

/** IATA odletového letiště z katalogu → jméno letiště ze seznamu TOUR_AIRPORTS. */
const IATA_TO_AIRPORT: Record<string, string> = {
  PRG: 'Praha',
  BRQ: 'Brno',
  OSR: 'Ostrava',
  PED: 'Pardubice',
  KLV: 'Karlovy Vary',
  BTS: 'Bratislava',
  VIE: 'Vídeň',
  BUD: 'Budapešť',
  KRK: 'Krakov',
  KTW: 'Katovice',
  MUC: 'Mnichov',
  DRS: 'Drážďany',
  LNZ: 'Linz',
}

/** Kód stravy z deep-linku (`DI`) → kód Sdovolená. */
const DI_TO_BOARD: Record<string, string> = {
  SC: '1', // bez stravování
  BB: '2', // snídaně
  HB: '4', // polopenze
  HP: '4', // polopenze plus
  FB: '5', // plná penze
  FP: '5', // plná penze plus
  AI: '6', // all inclusive
  AS: '6', // all inclusive soft
  AL: '6', // all inclusive light
  AU: '8', // all inclusive ultra
  AP: '8', // all inclusive plus
  AM: '8', // all inclusive premium
  UL: '8', // unlimited luxury
  IT: '7', // dle programu (poznávací)
}

/**
 * Letoviska, která katalog DER pojmenovává jinak než Čedok/TUI — stejné
 * jméno = jedna položka v pásu „Kam do …“ a ve filtru letovisek. Jen
 * známé odchylky; nový případ se pozná jako zdvojené letovisko na stránce.
 */
const RESORT_ALIASES: Record<string, string> = {
  'Sharm El Sheikh': 'Sharm el Sheikh',
  'Marsa Matruh – El Alamein': 'Marsa Matrouh',
  'Marsa Matruh': 'Marsa Matrouh',
}

export function normalizeResortName(name: string): string {
  return RESORT_ALIASES[name] ?? name
}

/** „2027-01-06T23:00:00Z“ → pražský den „2027-01-07“. */
export function pragueDay(instant: string): string | null {
  const d = new Date(instant)
  return Number.isNaN(d.getTime()) ? null : pragueToday(d)
}

/**
 * Produkt katalogu → řádek nabídky; null = nepatří zdroji (cizí značka),
 * není letecký zájezd z našich letišť, nebo chybí cena/termín/odkaz.
 */
export function mapCjProduct(
  product: CjTravelProduct,
  source: TourSource,
  today: string,
): TourOfferRow | null {
  const brand = (product.brand ?? '').trim().toUpperCase()
  if (source.cjBrands && !source.cjBrands.includes(brand)) return null
  const title = (product.title ?? '').trim()
  const detailUrl = (product.link ?? '').trim()
  if (!title || !detailUrl.startsWith('https://') || !isSourceHost(source, detailUrl)) return null
  const countryCode = ISO2_TO_ISO3[(product.destinationCountry ?? '').toUpperCase()]
  if (!countryCode) return null

  let params: URLSearchParams
  try {
    params = new URL(detailUrl).searchParams
  } catch {
    return null
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('DD') ?? '')
    ? params.get('DD')!
    : product.travelStartDate
      ? pragueDay(product.travelStartDate)
      : null
  if (!date || date < today) return null
  const nightsFromLink = Number(params.get('NN'))
  const nightsFromDuration = Number(/(\d+)/.exec(product.duration ?? '')?.[1])
  const nights =
    Number.isInteger(nightsFromLink) && nightsFromLink > 0 ? nightsFromLink : nightsFromDuration
  if (!Number.isInteger(nights) || nights <= 0) return null
  const price = Math.round(Number(product.price?.amount))
  if (!Number.isFinite(price) || price <= 0 || product.price?.currency !== 'CZK') return null
  const board = DI_TO_BOARD[params.get('DI') ?? ''] ?? boardCode(null, product.diningOptions)
  if (!board) return null
  const airport = IATA_TO_AIRPORT[(product.originCity ?? '').toUpperCase()]
  if (!airport) return null
  const starsRaw = Number(product.starRating)
  const stars = Number.isFinite(starsRaw) && starsRaw >= 1 ? Math.floor(starsRaw) : null
  // Number(null) je 0 → chybějící zeměpisná šířka by dala bod na rovníku.
  const coord = (v: unknown): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v)
  const latRaw = coord(product.destinationLatitude)
  const lngRaw = coord(product.destinationLongitude)
  const [lat, lng] = validCoords(
    latRaw !== null && Number.isFinite(latRaw) ? latRaw : null,
    lngRaw !== null && Number.isFinite(lngRaw) ? lngRaw : null,
  )
  const photo = (product.imageLink ?? '').trim()
  const area = normalizeResortName((product.destinationName ?? '').trim()) || null

  return {
    source: source.id,
    externalId: String(product.id),
    kind: board === '7' ? 'tour' : 'stay',
    title,
    countryCode,
    area,
    place: null,
    stars,
    board,
    departures: [airport].sort((a, b) => airportRank(a) - airportRank(b)),
    terms: [[date, nights, price, 0]],
    termFrom: date,
    termTo: null,
    nights,
    price,
    originalPrice: null,
    termCount: 1,
    photoUrl: photo.startsWith('https://') ? photo : null,
    detailUrl,
    lat,
    lng,
  }
}
