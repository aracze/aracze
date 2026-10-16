import { describe, expect, it } from 'vitest'
import { parseSdovolenaTour, starsFromClass, TourChunker } from '@/lib/sdovolena'
import {
  buildResorts,
  buildTourCards,
  parseTourFilters,
  tourFiltersHref,
  DEFAULT_TOUR_FILTERS,
} from '@/lib/tour-filters'
import { cjDeepLink, TOUR_SOURCES } from '@/lib/tour-sources'
import type { TourOffer } from '@/types/payload'

const term = (start: string, nights: number, price: number, orig?: number) => `
  <term><id>x</id><start>${start}</start><end>${start}</end><night_count>${nights}</night_count><day_count>${nights + 1}</day_count>
    <prices><price><desc_id>1</desc_id><final_price>${price}</final_price></price><price_orig>${orig ?? price}</price_orig></prices>
    <availability>https://www.cedok.cz/a</availability><purchase_url>https://www.cedok.cz/b</purchase_url></term>`

const tourXml = (
  body: string,
  type = '100',
) => `<tour><tour_id>RMF2MLG</tour_id><tour_type>${type}</tour_type>
  <tour_detail_url>https://www.cedok.cz/redirect,RMF2MLG?id=abc&amp;participants%5B0%5D%5Badults%5D=2</tour_detail_url>
  <locations><location><country_id>EGY</country_id><area_title>Marsa Alam</area_title><place_title></place_title></location></locations>
  <tour_title>Hotel Marina Lodge Port Ghalib</tour_title>
  <accommodation><gps><lat>25.5</lat><lon>34.6</lon></gps><type>Hotel</type><class_id>9</class_id><title>Marina Lodge</title></accommodation>
  <photos><photo><order>2</order><url>https://s.content4travel.com/b.jpg</url></photo><photo><order>1</order><url>https://s.content4travel.com/a.jpg</url></photo></photos>
  <term_groups>${body}</term_groups></tour>`

describe('parseSdovolenaTour', () => {
  it('vrátí řádek za leteckou skupinu z ČR s nejlevnějším budoucím termínem', () => {
    const xml = tourXml(`
      <term_group><board><id>6</id></board><transport><id>2</id></transport>
        <dept_places><place>Ostrava</place><place>Praha</place></dept_places>
        <terms>${term('2026-10-01', 7, 9000)}${term('2026-11-22', 7, 12990, 21490)}${term('2026-12-06', 7, 13990)}</terms>
      </term_group>
      <term_group><board><id>6</id></board><transport><id>2</id></transport>
        <dept_places><place>Vídeň</place></dept_places>
        <terms>${term('2026-11-22', 7, 9990)}</terms>
      </term_group>
      <term_group><board><id>2</id></board><transport><id>1</id></transport>
        <dept_places><place /></dept_places>
        <terms>${term('2026-11-22', 7, 5000)}</terms>
      </term_group>`)
    const rows = parseSdovolenaTour(xml, 'cedok', '2026-10-16')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({
      source: 'cedok',
      externalId: 'RMF2MLG',
      kind: 'stay',
      title: 'Hotel Marina Lodge Port Ghalib',
      countryCode: 'EGY',
      area: 'Marsa Alam',
      place: null,
      stars: 4,
      board: '6',
      departures: ['Praha', 'Ostrava'],
      termFrom: '2026-11-22',
      nights: 7,
      price: 12990,
      originalPrice: 21490,
      termCount: 2,
      photoUrl: 'https://s.content4travel.com/a.jpg',
      lat: 25.5,
      lng: 34.6,
    })
    // XML entity v adrese se dekódují (do deep-linku jde skutečný znak &).
    expect(row.detailUrl).toBe(
      'https://www.cedok.cz/redirect,RMF2MLG?id=abc&participants%5B0%5D%5Badults%5D=2',
    )
  })

  it('poznávací zájezd má kind=tour; bez letecké skupiny z ČR nic', () => {
    const tour = parseSdovolenaTour(
      tourXml(
        `<term_group><board><id>7</id></board><transport><id>2</id></transport><dept_places><place>Praha</place></dept_places><terms>${term('2027-01-07', 3, 16990, 25990)}</terms></term_group>`,
        '200',
      ),
      'cedok',
      '2026-10-16',
    )
    expect(tour[0]?.kind).toBe('tour')
    const none = parseSdovolenaTour(
      tourXml(
        `<term_group><board><id>6</id></board><transport><id>4</id></transport><dept_places><place>Praha</place></dept_places><terms>${term('2027-01-07', 7, 4990)}</terms></term_group>`,
      ),
      'cedok',
      '2026-10-16',
    )
    expect(none).toEqual([])
  })

  it('starsFromClass: 9 a 8 = 4★, 11 a 10 = 5★, 1 = neuvedeno', () => {
    expect(starsFromClass('9')).toBe(4)
    expect(starsFromClass('8')).toBe(4)
    expect(starsFromClass('11')).toBe(5)
    expect(starsFromClass('10')).toBe(5)
    expect(starsFromClass('7')).toBe(3)
    expect(starsFromClass('1')).toBeNull()
    expect(starsFromClass(undefined)).toBeNull()
  })
})

describe('TourChunker', () => {
  it('vyřeže zájezdy i přes hranice chunků a ignoruje obal', () => {
    const doc =
      '<?xml version="1.0"?><tours><currency_id>1</currency_id><tour><a>1</a></tour><tour><a>2</a></tour></tours>'
    const chunker = new TourChunker()
    const out: string[] = []
    for (let i = 0; i < doc.length; i += 7) out.push(...chunker.push(doc.slice(i, i + 7)))
    expect(out).toEqual(['<tour><a>1</a></tour>', '<tour><a>2</a></tour>'])
  })
})

const offer = (o: Partial<TourOffer> & { id: number }): TourOffer => ({
  source: 'cedok',
  kind: 'stay',
  title: `Hotel ${o.id}`,
  area: 'Hurghada',
  place: null,
  stars: 4,
  board: '6',
  departures: ['Praha'],
  termFrom: '2026-11-22',
  nights: 7,
  price: 10000,
  originalPrice: null,
  termCount: 3,
  photoUrl: null,
  ...o,
})

describe('tour filters', () => {
  it('parseTourFilters bere jen hodnoty z číselníku, jinak výchozí', () => {
    expect(
      parseTourFilters({
        typ: 'poznavaci',
        strava: '6',
        noci: '7',
        odlet: 'brno',
        hvezdy: '4',
        ck: 'cedok',
        razeni: 'sleva',
        pocet: '36',
      }),
    ).toEqual({
      typ: 'poznavaci',
      strava: '6',
      noci: '7',
      odlet: 'brno',
      hvezdy: 4,
      ck: 'cedok',
      razeni: 'sleva',
      pocet: 36,
    })
    expect(
      parseTourFilters({
        typ: 'x',
        strava: '99',
        noci: 'y',
        odlet: 'viden',
        hvezdy: '2',
        ck: 'invia',
        razeni: 'z',
        pocet: '-5',
      }),
    ).toEqual(DEFAULT_TOUR_FILTERS)
    // Pobyty se srovnávají na týden, poznávací bez filtru délky.
    expect(DEFAULT_TOUR_FILTERS.noci).toBe('7')
    expect(parseTourFilters({ typ: 'poznavaci' }).noci).toBe('vse')
  })

  it('tourFiltersHref nepíše výchozí hodnoty a resetuje počet', () => {
    expect(tourFiltersHref('/egypt/zajezdy', DEFAULT_TOUR_FILTERS, {})).toBe('/egypt/zajezdy')
    const f = { ...DEFAULT_TOUR_FILTERS, pocet: 36, strava: '6' }
    expect(tourFiltersHref('/egypt/zajezdy', f, { odlet: 'praha' })).toBe(
      '/egypt/zajezdy?strava=6&odlet=praha',
    )
    // Přepnutí na poznávací shodí výchozí týden; zpět na pobyty ho vrátí.
    expect(tourFiltersHref('/egypt/zajezdy', DEFAULT_TOUR_FILTERS, { typ: 'poznavaci' })).toBe(
      '/egypt/zajezdy?typ=poznavaci',
    )
    expect(
      tourFiltersHref('/egypt/zajezdy', parseTourFilters({ typ: 'poznavaci' }), { typ: 'pobyt' }),
    ).toBe('/egypt/zajezdy')
    expect(tourFiltersHref('/egypt/zajezdy', DEFAULT_TOUR_FILTERS, { noci: 'vse' })).toBe(
      '/egypt/zajezdy?noci=vse',
    )
  })

  it('buildTourCards: každý hotel jednou, filtr stravy a odletu, řazení podle slevy', () => {
    const offers = [
      offer({ id: 1, title: 'A', board: '6', price: 12000, originalPrice: 20000 }),
      offer({ id: 2, title: 'A', board: '4', price: 11000 }),
      offer({ id: 3, title: 'B', board: '6', price: 13000, departures: ['Ostrava'] }),
      offer({ id: 4, title: 'C', kind: 'tour', price: 9000 }),
    ]
    expect(buildTourCards(offers, DEFAULT_TOUR_FILTERS).map((o) => o.id)).toEqual([2, 3])
    expect(
      buildTourCards(offers, { ...DEFAULT_TOUR_FILTERS, strava: '6' }).map((o) => o.id),
    ).toEqual([1, 3])
    expect(
      buildTourCards(offers, { ...DEFAULT_TOUR_FILTERS, odlet: 'ostrava' }).map((o) => o.id),
    ).toEqual([3])
    expect(
      buildTourCards(offers, { ...DEFAULT_TOUR_FILTERS, strava: '6', razeni: 'sleva' }).map(
        (o) => o.id,
      ),
    ).toEqual([1, 3])
    expect(
      buildTourCards(offers, { ...DEFAULT_TOUR_FILTERS, typ: 'poznavaci' }).map((o) => o.id),
    ).toEqual([4])
  })

  it('buildResorts: nejnižší cena za oblast jen z 6–8 nocí, poznávací se nepočítají', () => {
    const offers = [
      offer({ id: 1, area: 'Hurghada', price: 12579, nights: 3 }),
      offer({ id: 2, area: 'Hurghada', price: 13769, photoUrl: 'https://x/a.jpg' }),
      offer({ id: 3, area: 'Marsa Alam', price: 12990 }),
      offer({ id: 4, area: null, place: null, kind: 'tour', price: 5000 }),
    ]
    expect(buildResorts(offers)).toEqual([
      { name: 'Marsa Alam', minPrice: 12990, photoUrl: null, hotels: 1 },
      { name: 'Hurghada', minPrice: 13769, photoUrl: 'https://x/a.jpg', hotels: 1 },
    ])
  })
})

describe('cjDeepLink', () => {
  const cedok = TOUR_SOURCES.find((s) => s.id === 'cedok')!
  it('obalí adresu cestovky click linkem CJ, cizí adresu zahodí', () => {
    expect(cjDeepLink(cedok, 'https://www.cedok.cz/redirect,X?id=1&a=2')).toBe(
      `${cedok.cjClickUrl}?url=${encodeURIComponent('https://www.cedok.cz/redirect,X?id=1&a=2')}`,
    )
    expect(cjDeepLink(cedok, 'https://evil.example/cedok.cz')).toBe(cedok.cjClickUrl)
    expect(cjDeepLink(cedok, 'http://www.cedok.cz/x')).toBe(cedok.cjClickUrl)
    expect(cjDeepLink(cedok, null)).toBe(cedok.cjClickUrl)
  })
})
