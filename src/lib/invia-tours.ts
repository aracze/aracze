import { XMLParser } from 'fast-xml-parser'
import { normalizeAirportName, airportByName, airportRank } from './tour-airports'
import {
  boardCode,
  validCoords,
  type TourOfferRow,
  type TourTerm,
  MAX_TERMS_PER_ROW,
} from './sdovolena'

/**
 * Invia jako šestý zdroj zájezdů (rozhodnutí uživatele 23. 10. 2026): Invia
 * je agentura, nabízí zájezdy stejných cestovek, jaké máme napřímo přes CJ
 * (provize 1 % proti 3–4 %). Z jejího feedu proto do nabídky jdou JEN hotely,
 * které od přímých partnerů nemáme (zkouška Egypt, 150 položek: 105 hotelů,
 * 101 už jsme měli, 4 nové), a u spárovaných hotelů se bere jen odkaz na
 * stránku hotelu u Invie — pro „Recenze na Invii“ (silná značka = důvěra).
 *
 * Feed: XML z affil.invia.cz (`<offers><offer>…`), nastavený v adminu na
 * podstránce Zájezdy země (jedna adresa na řádek; portál dovolí max 150
 * položek na feed, proto klidně víc feedů po letoviscích). Jedna položka =
 * jeden termín hotelu; řádky se skládají po hotelech (hotelinfo/id).
 * Ceny jsou za osobu (deep-link nese `passengers: A`), adresy nesou `aid`.
 */

type InviaOffer = {
  image?: { '#text'?: string } | string
  hotel?: string
  totalprice?: { '#text'?: string | number } | string | number
  discount?: string | number
  url?: string
  food?: string
  transportation?: string
  destination?: { locality?: string; country?: string }
  term?: { from?: string; to?: string; length?: string | number }
  airports?: { airport?: string[] | string }
  stars?: string | number
  tourtypes?: { type?: string[] | string }
  hotelinfo?: {
    id?: string | number
    /** Hvězdy hotelu sedí v hotelinfo (ne na úrovni nabídky), např. 4 nebo 4.5. */
    stars?: string | number
    coords?: { lat?: string | number; lng?: string | number }
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === 'offer' || name === 'airport' || name === 'type' || name === 'photo',
})

const str = (v: unknown): string => {
  if (v && typeof v === 'object' && '#text' in (v as object)) {
    return String((v as { '#text'?: unknown })['#text'] ?? '').trim()
  }
  return v == null ? '' : String(v).trim()
}
const num = (v: unknown): number | null => {
  const n = Number(str(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** Jen letecké termíny z našich letišť (TOUR_AIRPORTS); jiná letiště (Košice…) se zahodí. */
function ourAirports(o: InviaOffer): string[] {
  const raw = o.airports?.airport
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list
    .map((a) => normalizeAirportName(str(a)))
    .filter((a): a is string => a !== null && airportByName(a) !== null)
}

export function parseInviaFeed(xml: string, countryCode: string, today: string): TourOfferRow[] {
  const parsed = parser.parse(xml) as { offers?: { offer?: InviaOffer[] } }
  const offers = parsed.offers?.offer ?? []
  type Acc = { row: TourOfferRow; best: number; airports: Set<string> }
  const byHotel = new Map<string, Acc>()
  for (const o of offers) {
    if (str(o.transportation) && !/letecky/i.test(str(o.transportation))) continue
    const from = str(o.term?.from)
    const to = str(o.term?.to)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from < today)
      continue
    const price = num(o.totalprice)
    const title = str(o.hotel)
    const url = str(o.url)
    if (!price || price <= 0 || !title || !url.startsWith('https://')) continue
    const airports = ourAirports(o)
    if (airports.length === 0) continue
    const nights = dayDiff(from, to)
    if (nights <= 0) continue
    const discount = num(o.discount) ?? 0
    const orig = discount > 0 && discount < 90 ? Math.round(price / (1 - discount / 100)) : 0
    const term: TourTerm = [from, nights, price, orig > price ? orig : 0]
    const id = str(o.hotelinfo?.id) || title.toLowerCase()
    const acc = byHotel.get(id)
    if (acc) {
      acc.row.terms.push(term)
      acc.row.termCount++
      for (const a of airports) acc.airports.add(a)
      if (price < acc.best) {
        acc.best = price
        acc.row.price = price
        acc.row.originalPrice = term[3] || null
        acc.row.termFrom = from
        acc.row.termTo = to
        acc.row.nights = nights
        acc.row.detailUrl = url
      }
      continue
    }
    const types = o.tourtypes?.type
    const typeList = (Array.isArray(types) ? types : types ? [types] : []).map(str)
    const [lat, lng] = validCoords(num(o.hotelinfo?.coords?.lat), num(o.hotelinfo?.coords?.lng))
    const starsRaw = num(o.hotelinfo?.stars ?? o.stars)
    const photo = str(o.image)
    byHotel.set(id, {
      best: price,
      airports: new Set(airports),
      row: {
        source: 'invia',
        externalId: id,
        kind: typeList.some((t) => /pozn/i.test(t)) ? 'tour' : 'stay',
        title,
        countryCode,
        area: str(o.destination?.locality) || null,
        place: null,
        stars: starsRaw && starsRaw >= 1 ? Math.floor(starsRaw) : null,
        board: boardCode(null, str(o.food)) ?? '1',
        departures: [],
        terms: [term],
        termFrom: from,
        termTo: to,
        nights,
        price,
        originalPrice: term[3] || null,
        termCount: 1,
        photoUrl: photo.startsWith('https://') ? photo : null,
        detailUrl: url,
        lat,
        lng,
      },
    })
  }
  const rows: TourOfferRow[] = []
  for (const { row, airports } of byHotel.values()) {
    row.departures = [...airports].sort((a, b) => airportRank(a) - airportRank(b))
    row.terms.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    if (row.terms.length > MAX_TERMS_PER_ROW) row.terms = row.terms.slice(0, MAX_TERMS_PER_ROW)
    rows.push(row)
  }
  return rows
}

/**
 * Normalizovaný název hotelu pro párování mezi zdroji: bez diakritiky,
 * závorek („(Ex. …)“), obecných slov (Hotel, Resort, Spa…) a interpunkce.
 */
export function normalizeHotelName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\bex\..*$/g, '')
    .replace(/\b(hotel|resort|resorts|spa|aqua ?park|beach|club|village|the|and|by)\b|&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const EARTH_KM = 6371
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p = Math.PI / 180
  const dLat = (lat2 - lat1) * p
  const dLng = (lng2 - lng1) * p
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

export interface ExistingOffer {
  id: number
  title: string
  lat: number | null
  lng: number | null
}

/**
 * Hotel z Invie = náš hotel, když (a) sedí normalizovaný název, nebo (b) stojí
 * do 250 m a názvy se shodují aspoň z poloviny slov (nebo je jeden podmnožinou
 * druhého; u jednoslovných názvů jen do 120 m — „Mercure“ vs. „Mercure
 * Hurghada“ ano, „Titanic“ vedle „Titanic Palace“ ne), nebo (c) stojí do 30 m
 * (tatáž budova pod jiným jménem). Samotná vzdálenost 600 m párovala v husté
 * Hurghadě sousedy (529 shod místo ~195, ověřeno na datech 23. 10. 2026).
 */
export const MATCH_NEAR_KM = 0.25
export const MATCH_NEAR_SINGLE_WORD_KM = 0.12
export const MATCH_SAME_BUILDING_KM = 0.03

export function sameHotel(
  a: { title: string; lat: number | null; lng: number | null },
  b: { title: string; lat: number | null; lng: number | null },
): boolean {
  const n1 = normalizeHotelName(a.title)
  const n2 = normalizeHotelName(b.title)
  if (n1 && n1 === n2) return true
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return false
  const d = distanceKm(a.lat, a.lng, b.lat, b.lng)
  if (d <= MATCH_SAME_BUILDING_KM) return true
  if (d > MATCH_NEAR_KM || !n1 || !n2) return false
  const t1 = new Set(n1.split(' '))
  const t2 = new Set(n2.split(' '))
  const shared = [...t1].filter((t) => t2.has(t)).length
  const jaccard = shared / new Set([...t1, ...t2]).size
  const subset = shared === Math.min(t1.size, t2.size)
  if (jaccard < 0.5 && !subset) return false
  return Math.min(t1.size, t2.size) >= 2 || d <= MATCH_NEAR_SINGLE_WORD_KM
}

/**
 * Rozdělí řádky Invie na spárované (id našich řádků téhož hotelu — dostanou
 * odkaz na Invii) a nové (jdou do nabídky jako zdroj `invia`).
 */
export function matchInviaRows(
  rows: TourOfferRow[],
  existing: ExistingOffer[],
): { matched: { row: TourOfferRow; ids: number[] }[]; unmatched: TourOfferRow[] } {
  const matched: { row: TourOfferRow; ids: number[] }[] = []
  const unmatched: TourOfferRow[] = []
  for (const row of rows) {
    const ids = existing.filter((e) => sameHotel(row, e)).map((e) => e.id)
    if (ids.length > 0) matched.push({ row, ids })
    else unmatched.push(row)
  }
  return { matched, unmatched }
}
