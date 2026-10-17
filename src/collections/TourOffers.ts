import type { CollectionConfig } from 'payload'
import { isAdmin } from '../access/isAdmin'
import { TOUR_SOURCE_IDS } from '../lib/tour-sources'

/**
 * Nabídky zájezdů pro podstránky kategorie „Zájezdy“ — denně přepisuje
 * `/api/sync-tour-offers` z feedů cestovek (formát Sdovolená.cz, viz
 * `src/lib/sdovolena.ts`). Jeden řádek = hotel × strava × odletová místa
 * s nejlevnějším budoucím termínem (viz `TourOfferRow`).
 *
 * Záměrně BEZ verzí a draftů (strojová data bez redakčního cyklu) a bez
 * relace na stránky: stránka si nabídky dohledá podle `countryCode`
 * (ISO 3166-1 alpha-3 z feedu, u stránky vyplněný v záložce Zájezdy).
 * Sync zapisuje přímým SQL (tisíce řádků denně — Local API by bylo
 * zbytečně pomalé), proto `source`, `kind` a `board` jsou prostý text,
 * ne `select`: nová hodnota číselníku pak nechce ALTER TYPE na produkci.
 *
 * V adminu jen ke čtení (co web ukazuje, je vidět na stránce) a jen pro
 * adminy — veřejný web čte přes Local API s overrideAccess.
 */
export const TourOffers: CollectionConfig = {
  slug: 'tour-offers',
  labels: { singular: 'Nabídka zájezdu', plural: 'Nabídky zájezdů' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'source', 'countryCode', 'area', 'price', 'termFrom'],
    group: 'Zájezdy',
    description:
      'Plní denní sync /api/sync-tour-offers z feedů cestovek — ruční úpravy přepíše další běh.',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  timestamps: true,
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'source',
          label: 'Cestovka',
          type: 'text',
          required: true,
          index: true,
          validate: (value: string | null | undefined) =>
            (!!value && (TOUR_SOURCE_IDS as readonly string[]).includes(value)) ||
            `Neznámý zdroj; povolené: ${TOUR_SOURCE_IDS.join(', ')}`,
          admin: { width: '33%' },
        },
        {
          name: 'externalId',
          label: 'ID zájezdu u cestovky',
          type: 'text',
          required: true,
          admin: { width: '33%' },
        },
        {
          name: 'kind',
          label: 'Typ (stay = pobyt, tour = poznávací)',
          type: 'text',
          required: true,
          admin: { width: '33%' },
        },
      ],
    },
    { name: 'title', label: 'Hotel / název zájezdu', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        {
          name: 'countryCode',
          label: 'Země (ISO 3166-1 alpha-3)',
          type: 'text',
          required: true,
          index: true,
          admin: { width: '33%' },
        },
        { name: 'area', label: 'Oblast', type: 'text', admin: { width: '33%' } },
        { name: 'place', label: 'Letovisko', type: 'text', admin: { width: '33%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'stars', label: 'Hvězdy', type: 'number', admin: { width: '25%' } },
        {
          name: 'board',
          label: 'Strava (kód Sdovolená 1–8)',
          type: 'text',
          required: true,
          admin: { width: '25%' },
        },
        {
          name: 'departures',
          label: 'Odletová města v ČR',
          type: 'json',
          admin: { width: '50%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'termFrom', label: 'Odlet', type: 'date', required: true, admin: { width: '25%' } },
        { name: 'termTo', label: 'Návrat', type: 'date', admin: { width: '25%' } },
        { name: 'nights', label: 'Nocí', type: 'number', required: true, admin: { width: '25%' } },
        { name: 'termCount', label: 'Počet termínů', type: 'number', admin: { width: '25%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'price',
          label: 'Cena za osobu (Kč)',
          type: 'number',
          required: true,
          admin: { width: '50%' },
        },
        {
          name: 'originalPrice',
          label: 'Původní cena (Kč)',
          type: 'number',
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'terms',
      label: 'Termíny (odlet, nocí, cena, původní cena)',
      type: 'json',
      admin: {
        description:
          'Všechny budoucí termíny skupiny jako pole [YYYY-MM-DD, nocí, cena, původní cena nebo 0] — filtr podle měsíce a kalendář odletů.',
      },
    },
    { name: 'photoUrl', label: 'Fotka (URL)', type: 'text' },
    { name: 'detailUrl', label: 'Detail u cestovky (URL)', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'lat', label: 'Zeměpisná šířka', type: 'number', admin: { width: '50%' } },
        { name: 'lng', label: 'Zeměpisná délka', type: 'number', admin: { width: '50%' } },
      ],
    },
  ],
}
