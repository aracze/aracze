import { describe, expect, it } from 'vitest'
import {
  boardCode,
  parseSdovolenaTour,
  starsFromClass,
  TourChunker,
  validCoords,
  decodeEntities,
} from '@/lib/sdovolena'
import { googleMapsSearchUrl, inviaHotelReviewsUrl, tripadvisorSearchUrl } from '@/lib/tour-reviews'
import { matchInviaRows, normalizeHotelName, parseInviaFeed } from '@/lib/invia-tours'
import { normalizeAirportName } from '@/lib/tour-airports'
import { mapCjProduct, pragueDay, type CjTravelProduct } from '@/lib/cj-travel'
import {
  DEFAULT_TOUR_FILTERS,
  appliedFilterTags,
  buildResorts,
  buildTourCards,
  dateSummary,
  departureDays,
  monthFacet,
  parseTourFilters,
  resortFacet,
  tourFiltersHref,
  hotelTerms,
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
  it('vrátí řádek za leteckou skupinu z našich letišť s nejlevnějším budoucím termínem a všemi termíny', () => {
    const xml = tourXml(`
      <term_group><board><id>6</id></board><transport><id>2</id></transport>
        <dept_places><place>Ostrava</place><place>Praha</place></dept_places>
        <terms>${term('2026-10-01', 7, 9000)}${term('2026-11-22', 7, 12990, 21490)}${term('2026-12-06', 7, 13990)}</terms>
      </term_group>
      <term_group><board><id>6</id></board><transport><id>2</id></transport>
        <dept_places><place>Vídeň</place><place>Frankfurt nad Mohanem</place></dept_places>
        <terms>${term('2026-11-22', 7, 9990)}</terms>
      </term_group>
      <term_group><board><id>2</id></board><transport><id>1</id></transport>
        <dept_places><place /></dept_places>
        <terms>${term('2026-11-22', 7, 5000)}</terms>
      </term_group>`)
    const rows = parseSdovolenaTour(xml, 'cedok', '2026-10-16')
    expect(rows).toHaveLength(2)
    const [row, vienna] = rows
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
      terms: [
        ['2026-11-22', 7, 12990, 21490],
        ['2026-12-06', 7, 13990, 0],
      ],
      termFrom: '2026-11-22',
      nights: 7,
      price: 12990,
      originalPrice: 21490,
      termCount: 2,
      photoUrl: 'https://s.content4travel.com/a.jpg',
      lat: 25.5,
      lng: 34.6,
    })
    // Okolní letiště zůstává (Vídeň), cizí se vyřadí (Frankfurt).
    expect(vienna.departures).toEqual(['Vídeň'])
    // XML entity v adrese se dekódují (do deep-linku jde skutečný znak &).
    expect(row.detailUrl).toBe(
      'https://www.cedok.cz/redirect,RMF2MLG?id=abc&participants%5B0%5D%5Badults%5D=2',
    )
  })

  it('poznávací zájezd má kind=tour; bez letecké skupiny z našich letišť nic', () => {
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

describe('parseSdovolenaTour — odchylky feedu TUI', () => {
  it('velká písmena tagů, strava jen popisem a „Brno-Tuřany“ se sjednotí', () => {
    const xml = `<TOUR><TOUR_ID>AYT12012</TOUR_ID><TOUR_TYPE>100</TOUR_TYPE>
      <TOUR_DETAIL_URL>https://www.tui.cz/dovolena/turecko/maxx-royal-ayt12012</TOUR_DETAIL_URL>
      <LOCATIONS><LOCATION><COUNTRY_ID>TUR</COUNTRY_ID><AREA_TITLE>Turecká riviéra</AREA_TITLE><PLACE_TITLE>Kiris</PLACE_TITLE></LOCATION></LOCATIONS>
      <TOUR_TITLE>Maxx Royal Kemer Resort</TOUR_TITLE>
      <ACCOMMODATION><CLASS_ID>10</CLASS_ID><GPS><LAT>36.5</LAT><LON>30.5</LON></GPS></ACCOMMODATION>
      <PHOTOS><PHOTO><ORDER>1</ORDER><URL>https://r.cdn.redgalaxy.com/a.jpg?x=1&amp;y=2</URL></PHOTO></PHOTOS>
      <TERM_GROUPS>
        <TERM_GROUP><BOARD><ID/><DESC>All inclusive plus</DESC></BOARD><TRANSPORT><ID>2</ID></TRANSPORT>
          <DEPT_PLACES><PLACE>Brno-Tuřany</PLACE></DEPT_PLACES>
          <TERMS><TERM><START>2027-05-22</START><END>2027-05-29</END><NIGHT_COUNT>7</NIGHT_COUNT>
            <PRICES><PRICE><DESC_ID>1</DESC_ID><FINAL_PRICE>119451</FINAL_PRICE></PRICE><PRICE_ORIG>119451</PRICE_ORIG></PRICES></TERM></TERMS>
        </TERM_GROUP>
        <TERM_GROUP><BOARD><ID>2</ID><DESC>Snídaně</DESC></BOARD><TRANSPORT><ID>2</ID></TRANSPORT>
          <DEPT_PLACES><PLACE>Frankfurt</PLACE></DEPT_PLACES>
          <TERMS><TERM><START>2027-05-22</START><END>2027-05-29</END><NIGHT_COUNT>7</NIGHT_COUNT>
            <PRICES><PRICE><DESC_ID>1</DESC_ID><FINAL_PRICE>50000</FINAL_PRICE></PRICE><PRICE_ORIG>50000</PRICE_ORIG></PRICES></TERM></TERMS>
        </TERM_GROUP>
      </TERM_GROUPS></TOUR>`
    const rows = parseSdovolenaTour(xml, 'tui', '2026-10-23')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      source: 'tui',
      externalId: 'AYT12012',
      board: '8',
      departures: ['Brno'],
      stars: 5,
      price: 119451,
      originalPrice: null,
      photoUrl: 'https://r.cdn.redgalaxy.com/a.jpg?x=1&y=2',
    })
  })

  it('boardCode: kód má přednost, popis jen náhradou', () => {
    expect(boardCode('6', 'Snídaně')).toBe('6')
    expect(boardCode('', 'Ultra All Inclusive')).toBe('8')
    expect(boardCode('', 'All Inclusive')).toBe('6')
    expect(boardCode('', 'Polopenze Plus')).toBe('4')
    expect(boardCode('', 'Bez stravy')).toBe('1')
    expect(boardCode('', '')).toBeNull()
    expect(normalizeAirportName('Ostrava-Mošnov')).toBe('Ostrava')
    expect(normalizeAirportName('Vídeň (Schwechat)')).toBe('Vídeň')
    expect(normalizeAirportName('Varšava')).toBeNull()
  })

  it('TourChunker bere i <TOUR> velkými písmeny', () => {
    const chunker = new TourChunker()
    expect(chunker.push('<TOURS><TOUR><A>1</A></TOUR><TOUR><A>2</A></TOUR></TOURS>')).toEqual([
      '<TOUR><A>1</A></TOUR>',
      '<TOUR><A>2</A></TOUR>',
    ])
  })
})

describe('mapCjProduct — produktový katalog CJ (Fischer, Exim)', () => {
  const fischer = TOUR_SOURCES.find((s) => s.id === 'fischer')!
  const exim = TOUR_SOURCES.find((s) => s.id === 'exim')!
  const product = (o: Partial<CjTravelProduct> = {}): CjTravelProduct => ({
    id: '2480',
    title: 'Jaz Elite Negma',
    brand: 'FISCHER',
    link: 'https://www.fischer.cz/egypt/marsa-alam/jaz-elite-negma?DS=256&DI=AI&NN=3&DD=2027-01-07&AC1=2',
    imageLink: 'https://img.fischer.cz/hotels/720/x.jpg',
    price: { amount: '18390.00', currency: 'CZK' },
    destinationCountry: 'EG',
    destinationName: 'Marsa Alam',
    destinationLatitude: '25.1',
    destinationLongitude: '34.9',
    originCity: 'PRG',
    starRating: '5.0',
    diningOptions: 'All Inclusive',
    duration: '3 noci',
    travelStartDate: '2027-01-06T23:00:00Z',
    ...o,
  })

  it('přeloží produkt na řádek s jedním termínem (údaje z deep-linku)', () => {
    expect(mapCjProduct(product(), fischer, '2026-10-23')).toEqual({
      source: 'fischer',
      externalId: '2480',
      kind: 'stay',
      title: 'Jaz Elite Negma',
      countryCode: 'EGY',
      area: 'Marsa Alam',
      place: null,
      stars: 5,
      board: '6',
      departures: ['Praha'],
      terms: [['2027-01-07', 3, 18390, 0]],
      termFrom: '2027-01-07',
      termTo: null,
      nights: 3,
      price: 18390,
      originalPrice: null,
      termCount: 1,
      photoUrl: 'https://img.fischer.cz/hotels/720/x.jpg',
      detailUrl:
        'https://www.fischer.cz/egypt/marsa-alam/jaz-elite-negma?DS=256&DI=AI&NN=3&DD=2027-01-07&AC1=2',
      lat: 25.1,
      lng: 34.9,
    })
  })

  it('cizí značku v katalogu vynechá, bez deep-link parametrů bere pole katalogu a pražský den', () => {
    expect(mapCjProduct(product({ brand: 'EXIM TOURS' }), fischer, '2026-10-23')).toBeNull()
    const ex = mapCjProduct(
      product({
        brand: 'KARTAGO TOURS',
        link: 'https://www.eximtours.cz/egypt/hurghada/hotel',
        diningOptions: 'All Inclusive Ultra',
        starRating: '4.5',
        originCity: 'BTS',
      }),
      exim,
      '2026-10-23',
    )
    expect(ex).toMatchObject({
      source: 'exim',
      board: '8',
      stars: 4,
      departures: ['Bratislava'],
      terms: [['2027-01-07', 3, 18390, 0]],
    })
    expect(pragueDay('2027-01-06T23:00:00Z')).toBe('2027-01-07')
    expect(
      mapCjProduct(product({ destinationName: 'Marsa Matruh – El Alamein' }), fischer, '2026-10-23')
        ?.area,
    ).toBe('Marsa Matrouh')
    expect(pragueDay('2027-06-30T22:00:00Z')).toBe('2027-07-01')
    // Poznávací podle stravy „dle programu“; cizí měna, minulý termín a neznámé letiště = nic.
    expect(
      mapCjProduct(
        product({ link: 'https://www.fischer.cz/x?DI=IT&NN=7&DD=2027-03-01' }),
        fischer,
        '2026-10-23',
      )?.kind,
    ).toBe('tour')
    expect(
      mapCjProduct(product({ price: { amount: '100', currency: 'EUR' } }), fischer, '2026-10-23'),
    ).toBeNull()
    expect(mapCjProduct(product(), fischer, '2027-02-01')).toBeNull()
    expect(mapCjProduct(product({ originCity: 'FRA' }), fischer, '2026-10-23')).toBeNull()
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
  terms: [['2026-11-22', 7, 10000, 0]],
  termFrom: '2026-11-22',
  nights: 7,
  price: 10000,
  originalPrice: null,
  termCount: 1,
  photoUrl: null,
  lat: null,
  lng: null,
  inviaUrl: null,
  ...o,
})

describe('tour filters', () => {
  it('parseTourFilters bere jen hodnoty z číselníku, jinak výchozí (týden, Česko, vše)', () => {
    expect(
      parseTourFilters({
        typ: 'poznavaci',
        odlet: 'praha,bratislava,x',
        mesice: '2026-12,2026-11,2026-13',
        noci: '9-11',
        strava: 'ai,zzz',
        hvezdy: '5,2',
        letovisko: 'hurghada',
        ck: 'cedok,neznama',
        sleva: '1',
        razeni: 'sleva',
        pocet: '36',
      }),
    ).toEqual({
      typ: 'poznavaci',
      odlet: ['praha', 'bratislava'],
      mesice: ['2026-11', '2026-12'],
      od: null,
      do: null,
      noci: [9, 11],
      strava: ['ai'],
      hvezdy: [5],
      letovisko: ['hurghada'],
      ck: ['cedok'],
      sleva: true,
      razeni: 'sleva',
      pocet: 36,
    })
    expect(DEFAULT_TOUR_FILTERS).toMatchObject({
      typ: 'vse',
      odlet: [],
      noci: [6, 8],
      razeni: 'doporucene',
    })
    expect(parseTourFilters({ noci: 'vse' }).noci).toBeNull()
    expect(parseTourFilters({ od: '2026-12-10', do: '2026-12-01' }).do).toBeNull()
  })

  it('tourFiltersHref nepíše výchozí hodnoty a resetuje počet', () => {
    expect(tourFiltersHref('/egypt/zajezdy', DEFAULT_TOUR_FILTERS, {})).toBe('/egypt/zajezdy')
    const f = { ...DEFAULT_TOUR_FILTERS, pocet: 36, strava: ['ai' as const] }
    expect(tourFiltersHref('/egypt/zajezdy', f, { odlet: ['praha'] })).toBe(
      '/egypt/zajezdy?odlet=praha&strava=ai',
    )
    expect(tourFiltersHref('/egypt/zajezdy', DEFAULT_TOUR_FILTERS, { noci: null })).toBe(
      '/egypt/zajezdy?noci=vse',
    )
    // Přesné dny mají přednost před měsíci.
    expect(
      tourFiltersHref('/egypt/zajezdy', DEFAULT_TOUR_FILTERS, {
        mesice: ['2026-11'],
        od: '2026-11-20',
        do: '2026-11-30',
      }),
    ).toBe('/egypt/zajezdy?od=2026-11-20&do=2026-11-30')
  })

  it('buildTourCards: nejlevnější termín po filtru data/délky, každý hotel jednou, odlet z českých letišť', () => {
    const offers = [
      offer({
        id: 1,
        title: 'A',
        terms: [
          ['2026-11-22', 7, 12000, 20000],
          ['2026-12-06', 7, 11000, 0],
          ['2027-01-10', 3, 6000, 0],
        ],
      }),
      offer({ id: 2, title: 'A', board: '4', terms: [['2026-11-22', 7, 11500, 0]] }),
      offer({ id: 3, title: 'B', departures: ['Bratislava'], terms: [['2026-11-22', 7, 9000, 0]] }),
      offer({ id: 4, title: 'C', kind: 'tour', board: '7', terms: [['2026-11-22', 7, 9500, 0]] }),
    ]
    // Výchozí: Česko, týden, vše → A (11 000 z prosince), C; Bratislava mimo.
    const cards = buildTourCards(offers, { ...DEFAULT_TOUR_FILTERS, razeni: 'cena' })
    expect(cards.map((c) => [c.offer.title, c.price, c.date])).toEqual([
      ['C', 9500, '2026-11-22'],
      ['A', 11000, '2026-12-06'],
    ])
    // Listopad → A dostane listopadový termín se slevou.
    const nov = buildTourCards(offers, {
      ...DEFAULT_TOUR_FILTERS,
      mesice: ['2026-11'],
      razeni: 'cena',
    })
    expect(nov.find((c) => c.offer.title === 'A')).toMatchObject({
      price: 11500,
      date: '2026-11-22',
    })
    // Jen se slevou + AI → A za 12 000 (jediný termín se slevou).
    const disc = buildTourCards(offers, { ...DEFAULT_TOUR_FILTERS, sleva: true, strava: ['ai'] })
    expect(disc.map((c) => [c.offer.title, c.price])).toEqual([['A', 12000]])
    // Víkend → jen třídenní termín A.
    expect(
      buildTourCards(offers, { ...DEFAULT_TOUR_FILTERS, noci: [3, 5] }).map((c) => c.price),
    ).toEqual([6000])
    // Okolní letiště přidá B.
    expect(
      buildTourCards(offers, {
        ...DEFAULT_TOUR_FILTERS,
        odlet: ['praha', 'bratislava'],
        razeni: 'cena',
      }).map((c) => c.offer.title),
    ).toEqual(['B', 'C', 'A'])
    // Doporučené: sleva −40 % posune A (12 000) před C (9 500)? 12000*(1-0.2)=9600 > 9500 → C první.
    expect(
      buildTourCards(offers, {
        ...DEFAULT_TOUR_FILTERS,
        mesice: ['2026-11'],
        strava: ['ai', 'program'],
      }).map((c) => c.offer.title),
    ).toEqual(['C', 'A'])
  })

  it('facety: měsíce s počty, letoviska, dny odletů, štítky použitých filtrů', () => {
    const offers = [
      offer({
        id: 1,
        terms: [
          ['2026-11-22', 7, 10000, 0],
          ['2026-12-06', 7, 9000, 0],
        ],
      }),
      offer({ id: 2, area: 'Marsa Alam', terms: [['2026-12-13', 7, 8000, 0]] }),
    ]
    const months = monthFacet(offers, DEFAULT_TOUR_FILTERS, '2026-10-16')
    expect(months.slice(0, 3).map((m) => [m.value, m.count])).toEqual([
      ['2026-10', 0],
      ['2026-11', 1],
      ['2026-12', 2],
    ])
    expect(
      resortFacet(offers, DEFAULT_TOUR_FILTERS).map((r) => [r.value, r.label, r.count]),
    ).toEqual([
      ['hurghada', 'Hurghada', 1],
      ['marsa-alam', 'Marsa Alam', 1],
    ])
    expect(departureDays(offers, { ...DEFAULT_TOUR_FILTERS, mesice: ['2026-11'] })).toEqual([
      '2026-11-22',
      '2026-12-06',
      '2026-12-13',
    ])
    const f = parseTourFilters({
      odlet: 'praha',
      mesice: '2026-11,2026-12',
      noci: 'vse',
      letovisko: 'hurghada',
    })
    expect(
      appliedFilterTags(f, (s) => (s === 'hurghada' ? 'Hurghada' : s)).map((t) => t.label),
    ).toEqual(['Praha', 'listopad 2026', 'prosinec 2026', 'libovolná délka', 'Hurghada'])
    expect(dateSummary(f)).toBe('listopad – prosinec 2026')
    // Stejné letovisko psané jinak se v pásu slije.
    const mixed = [
      ...offers,
      offer({ id: 9, area: 'HURGHADA', terms: [['2026-12-20', 7, 7000, 0]] }),
    ]
    expect(
      buildResorts(buildTourCards(mixed, DEFAULT_TOUR_FILTERS)).map((r) => [
        r.slug,
        r.hotels,
        r.minPrice,
      ]),
    ).toEqual([
      ['hurghada', 2, 7000],
      ['marsa-alam', 1, 8000],
    ])
    expect(buildResorts(buildTourCards(offers, DEFAULT_TOUR_FILTERS))).toEqual([
      { name: 'Marsa Alam', slug: 'marsa-alam', minPrice: 8000, photoUrl: null, hotels: 1 },
      { name: 'Hurghada', slug: 'hurghada', minPrice: 9000, photoUrl: null, hotels: 1 },
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

describe('validCoords', () => {
  it('0/0 a hodnoty mimo rozsah bere jako chybějící souřadnice', () => {
    expect(validCoords(0, 0)).toEqual([null, null])
    expect(validCoords(27.2, null)).toEqual([null, null])
    expect(validCoords(95, 30)).toEqual([null, null])
    expect(validCoords(27.2579, 33.8116)).toEqual([27.2579, 33.8116])
  })
})

describe('tripadvisorSearchUrl', () => {
  it('hledá podle názvu a letoviska, bez letoviska jen podle názvu', () => {
    expect(tripadvisorSearchUrl('Hotel Alexander the Great Resort', 'Marsa Alam')).toBe(
      'https://www.tripadvisor.cz/Search?q=Hotel%20Alexander%20the%20Great%20Resort%20Marsa%20Alam',
    )
    expect(tripadvisorSearchUrl('Lazuli ', null)).toBe('https://www.tripadvisor.cz/Search?q=Lazuli')
    expect(googleMapsSearchUrl('Lazuli', 'Marsa Alam')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Lazuli%20Marsa%20Alam',
    )
  })
})

const INVIA_XML = `<?xml version="1.0" encoding="utf-8"?>
<offers>
  <offer>
    <image width="450" height="300">https://dcontent.inviacdn.net/x/1.jpg</image>
    <destination><country>Egypt</country><locality>Sahl Hasheesh</locality></destination>
    <hotel>Pickalbatros Citadel Resort</hotel>
    <term><from>2027-02-26</from><to>2027-03-06</to><length>9</length></term>
    <price currency="CZK">37980</price><totalprice currency="CZK">37980</totalprice>
    <discount>0</discount><food>All Inclusive</food><transportation>Letecky</transportation>
    <airports><airport>Praha</airport><airport>Košice</airport></airports>
    <url>https://www.invia.cz/hotel/egypt/sahl-hasheesh/pickalbatros-citadel-resort/zajezd/?s_offer_id=abc&amp;aid=4745582</url>
    <tourtypes><type>Pobytové</type></tourtypes>
    <hotelinfo><id>74896</id><stars>4.5</stars><coords><lat>27.0</lat><lng>33.9</lng></coords></hotelinfo>
  </offer>
  <offer>
    <hotel>Pickalbatros Citadel Resort</hotel>
    <destination><country>Egypt</country><locality>Sahl Hasheesh</locality></destination>
    <term><from>2027-03-05</from><to>2027-03-12</to><length>8</length></term>
    <totalprice currency="CZK">29990</totalprice><discount>10</discount>
    <food>Ultra All inclusive</food><transportation>Letecky</transportation>
    <airports><airport>Brno</airport></airports>
    <url>https://www.invia.cz/hotel/egypt/sahl-hasheesh/pickalbatros-citadel-resort/zajezd/?s_offer_id=def&amp;aid=4745582</url>
    <hotelinfo><id>74896</id><coords><lat>27.0</lat><lng>33.9</lng></coords></hotelinfo>
    <stars>4</stars>
  </offer>
  <offer>
    <hotel>Dive Inn</hotel>
    <destination><country>Egypt</country><locality>Sharm El Sheikh</locality></destination>
    <term><from>2026-01-01</from><to>2026-01-08</to><length>8</length></term>
    <totalprice currency="CZK">9990</totalprice><food>Snídaně</food><transportation>Letecky</transportation>
    <airports><airport>Praha</airport></airports>
    <url>https://www.invia.cz/hotel/egypt/sharm-el-sheikh/dive-inn/zajezd/?aid=4745582</url>
    <hotelinfo><id>1</id></hotelinfo>
  </offer>
</offers>`

describe('Invia feed', () => {
  it('skládá termíny po hotelu, bere jen naše letiště a vynechá propadlé termíny', () => {
    const rows = parseInviaFeed(INVIA_XML, 'EGY', '2026-10-23')
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row.source).toBe('invia')
    expect(row.externalId).toBe('74896')
    expect(row.departures).toEqual(['Praha', 'Brno'])
    expect(row.terms).toEqual([
      ['2027-02-26', 8, 37980, 0],
      ['2027-03-05', 7, 29990, 33322],
    ])
    expect(row.price).toBe(29990)
    expect(row.originalPrice).toBe(33322)
    expect(row.nights).toBe(7)
    expect(row.board).toBe('6')
    expect(row.stars).toBe(4)
    expect(row.area).toBe('Sahl Hasheesh')
    expect(row.lat).toBe(27)
    expect(row.detailUrl).toContain('s_offer_id=def')
  })

  it('páruje s hotely přímých partnerů podle názvu nebo vzdálenosti', () => {
    const rows = parseInviaFeed(INVIA_XML, 'EGY', '2026-10-23')
    const { matched, unmatched } = matchInviaRows(rows, [
      { id: 1, title: 'Hotel Pickalbatros Citadel Resort', lat: null, lng: null },
      // tatáž budova (20 m), jiné jméno → shoda
      { id: 2, title: 'Citadel Azur', lat: 27.0001, lng: 33.9001 },
      // 150 m vedle, polovina slov společná → shoda
      { id: 3, title: 'Pickalbatros Citadel Azur Resort', lat: 27.0012, lng: 33.9005 },
      // 150 m vedle, jen jedno společné slovo z tří → ne
      { id: 4, title: 'Citadel Palace Royal', lat: 27.0012, lng: 33.9005 },
      // jednoslovný název 150 m daleko → ne (jen do 120 m)
      { id: 5, title: 'Citadel', lat: 27.0012, lng: 33.9005 },
      { id: 6, title: 'Jiný hotel', lat: 25.2, lng: 34.8 },
    ])
    expect(matched).toHaveLength(1)
    expect(matched[0].ids.sort()).toEqual([1, 2, 3])
    expect(unmatched).toHaveLength(0)
    expect(matchInviaRows(rows, []).unmatched).toHaveLength(1)
  })

  it('normalizuje názvy a staví odkaz na recenze hotelu', () => {
    expect(normalizeHotelName('Hotel Steigenberger Ras Soma Beach Resort & Spa')).toBe(
      'steigenberger ras soma',
    )
    expect(normalizeHotelName('Jaz Grand Marsa (Ex. Grand Resta)')).toBe('jaz grand marsa')
    expect(
      inviaHotelReviewsUrl(
        'https://www.invia.cz/hotel/egypt/sahl-hasheesh/pickalbatros-citadel-resort/zajezd/?s_offer_id=abc&aid=4745582',
        '4745582',
      ),
    ).toBe(
      'https://www.invia.cz/hotel/egypt/sahl-hasheesh/pickalbatros-citadel-resort/?aid=4745582#recenze-hotelu',
    )
    expect(inviaHotelReviewsUrl('https://www.cedok.cz/hotel/x/', '1')).toBeNull()
  })
})

describe('decodeEntities', () => {
  it('dekóduje dvakrát zakódované entity Blue Style a jinak text nemění', () => {
    expect(decodeEntities('Hotel Seher Kumk&#xF6;y Star Resort &amp; Spa')).toBe(
      'Hotel Seher Kumköy Star Resort & Spa',
    )
    expect(decodeEntities('Fort Arabesque Beach Resort & SPA')).toBe(
      'Fort Arabesque Beach Resort & SPA',
    )
    expect(decodeEntities('A &unknown; B &#99999999;')).toBe('A &unknown; B &#99999999;')
  })
})

describe('hotelTerms', () => {
  it('slučuje termíny hotelu přes skupiny letišť a rozlišuje filtr', () => {
    const a = offer({
      id: 1,
      title: 'Hotel X',
      departures: ['Praha'],
      terms: [
        ['2026-11-07', 7, 14290, 0],
        ['2026-12-26', 7, 24990, 0],
      ],
    })
    const b = offer({
      id: 2,
      title: 'Hotel X',
      departures: ['Brno'],
      terms: [
        ['2026-11-07', 7, 13990, 0],
        ['2026-10-31', 7, 13590, 32290],
      ],
    })
    const other = offer({
      id: 3,
      title: 'Hotel Y',
      departures: ['Praha'],
      terms: [['2026-11-07', 7, 9990, 0]],
    })
    const f = parseTourFilters({ mesice: '2026-11' })
    const card = { offer: b, date: '2026-10-31', nights: 7, price: 13590, originalPrice: 32290 }
    const { all, filtered } = hotelTerms([a, b, other], card, f)
    expect(all.map((t) => [t.date, t.price, t.airports])).toEqual([
      ['2026-10-31', 13590, ['Brno']],
      ['2026-11-07', 13990, ['Praha', 'Brno']],
      ['2026-12-26', 24990, ['Praha']],
    ])
    expect(all[0].originalPrice).toBe(32290)
    expect(filtered.map((t) => t.date)).toEqual(['2026-11-07'])
  })
})
