import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// SEO metadata (src/lib/seo.ts): titulek a popisek z CMS pole `meta` s
// fallbacky, absolutní canonical, Open Graph a JSON-LD článku. Hlídá hlavně
// zacházení s legacy titulky („… • Ara.cz") a zkracování popisku.
import {
  articleJsonLd,
  buildPageMetadata,
  DEFAULT_DESCRIPTION,
  DESCRIPTION_MAX,
  OG_FALLBACK_IMAGE,
  OG_IMAGE_WIDTH,
  ogImageDimensions,
  resolveSeoDescription,
  resolveSeoTitle,
  SITE_NAME,
  SITE_TITLE_SUFFIX,
  shareImageFromMedia,
  stripSiteSuffix,
  truncateDescription,
} from '@/lib/seo'
import { getSiteURL } from '@/lib/utils'

const lexical = (paragraphs: string[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [{ type: 'text', text }],
    })),
  },
})

describe('stripSiteSuffix — přípona webu z legacy/plugin titulků', () => {
  it('odřízne „• Ara.cz" ze starého webu i „| Ara.cz" z plugin-seo', () => {
    expect(stripSiteSuffix('Astana: Cestovní průvodce Astanou • Ara.cz')).toBe(
      'Astana: Cestovní průvodce Astanou',
    )
    expect(stripSiteSuffix('Norsko | Ara.cz')).toBe('Norsko')
    expect(stripSiteSuffix('Norsko - Ara.cz ')).toBe('Norsko')
  })

  it('zvládne i legacy varianty s frází a překlep „•vAra.cz"', () => {
    expect(stripSiteSuffix('Salzburská ZOO - cestovní průvodce Ara.cz')).toBe('Salzburská ZOO')
    expect(stripSiteSuffix('Podmořské jeskyně Nereo: Cestovní průvodce Ara.cz')).toBe(
      'Podmořské jeskyně Nereo',
    )
    expect(stripSiteSuffix('Top ze světa - Cestovní inspirace Ara.cz')).toBe('Top ze světa')
    expect(stripSiteSuffix('Victoria: Cestovní průvodce Gozo •vAra.cz')).toBe(
      'Victoria: Cestovní průvodce Gozo',
    )
    expect(stripSiteSuffix('Reklama a spolupráce na Ara.cz')).toBe('Reklama a spolupráce na Ara.cz')
  })

  it('titulek bez přípony nechá být (včetně „Ara.cz" uprostřed)', () => {
    expect(stripSiteSuffix('O webu Ara.cz a jeho autorech')).toBe('O webu Ara.cz a jeho autorech')
  })
})

describe('resolveSeoTitle — SEO titulek z CMS má přednost', () => {
  it('vyplněný meta.title → bez přípony (tu přidá layout šablona `%s • Ara.cz`)', () => {
    expect(
      resolveSeoTitle({ title: 'Vstupní podmínky a víza do Srbska • Ara.cz' }, 'fallback'),
    ).toBe('Vstupní podmínky a víza do Srbska')
    expect(SITE_TITLE_SUFFIX).toBe(SITE_NAME)
  })

  it('prázdný/chybějící meta.title → fallback', () => {
    expect(resolveSeoTitle(null, 'Norsko')).toBe('Norsko')
    expect(resolveSeoTitle({ title: '   ' }, 'Norsko')).toBe('Norsko')
    // Jen přípona bez obsahu = jako prázdný.
    expect(resolveSeoTitle({ title: '• Ara.cz' }, 'Norsko')).toBe('Norsko')
  })
})

describe('truncateDescription — zkrácení na hranici slova', () => {
  it('krátký text nemění, dlouhý usekne na slovo a přidá výpustku', () => {
    expect(truncateDescription('Krátký popis.')).toBe('Krátký popis.')
    const long = Array.from({ length: 40 }, (_, i) => `slovo${i}`).join(' ')
    const out = truncateDescription(long)
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(out.endsWith('…')).toBe(true)
    // Všechna slova před výpustkou jsou celá (žádné useknuté „slov…").
    expect(
      out
        .slice(0, -1)
        .split(' ')
        .every((w) => /^slovo\d+$/.test(w)),
    ).toBe(true)
  })

  it('sbalí bílé znaky a nenechá před výpustkou čárku', () => {
    expect(truncateDescription('a,   b\n c', 3)).toBe('a…')
  })

  it('mez platí včetně výpustky a řeže po celých znacích (emoji = jeden znak)', () => {
    expect(truncateDescription('a'.repeat(200), 160)).toHaveLength(160)
    const emoji = truncateDescription('😀'.repeat(10), 5)
    expect(emoji).toBe('😀😀😀😀…')
    expect(Array.from(emoji)).toHaveLength(5)
  })
})

describe('resolveSeoDescription — CMS popisek, jinak začátek textu', () => {
  it('vyplněný meta.description vrací beze změny (i delší než limit)', () => {
    const custom = 'x'.repeat(200)
    expect(resolveSeoDescription({ description: custom }, lexical(['Text']))).toBe(custom)
  })

  it('bez meta → plain text z rich textu, zkrácený', () => {
    const text = lexical(['Norsko je země fjordů.', 'Druhý odstavec ' + 'dlouhý '.repeat(40)])
    const out = resolveSeoDescription(null, text)!
    expect(out.startsWith('Norsko je země fjordů. Druhý odstavec')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
  })

  it('bez meta a bez textu → undefined (uplatní se výchozí z layoutu)', () => {
    expect(resolveSeoDescription(null, lexical([]))).toBeUndefined()
    expect(resolveSeoDescription({ description: ' ' }, null)).toBeUndefined()
    expect(DEFAULT_DESCRIPTION.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
  })
})

type OgImage = { url: string; alt?: string; width?: number; height?: number }
const ogImages = (m: ReturnType<typeof buildPageMetadata>) =>
  (m.openGraph as { images: OgImage[] }).images

const CLOUDINARY = 'https://res.cloudinary.com/ara/image/upload/v1/foto.jpg'

describe('buildPageMetadata — canonical + Open Graph', () => {
  it('stránka: absolutní canonical, OG website se siteName/locale, bez fotky výchozí obrázek s rozměry a popiskem', () => {
    const m = buildPageMetadata({ title: 'Norsko', description: 'Popis', path: '/norsko' })
    expect(m.alternates?.canonical).toBe(`${getSiteURL()}/norsko`)
    expect(m.openGraph).toMatchObject({
      type: 'website',
      url: `${getSiteURL()}/norsko`,
      siteName: SITE_NAME,
      locale: 'cs_CZ',
    })
    expect(ogImages(m)).toEqual([
      {
        url: `${getSiteURL()}/og-default.png`,
        width: OG_FALLBACK_IMAGE.width,
        height: OG_FALLBACK_IMAGE.height,
        alt: OG_FALLBACK_IMAGE.alt,
      },
    ])
    expect(m.twitter).toEqual({ card: 'summary_large_image' })
  })

  it('výchozí obrázek: konstanty odpovídají skutečnému public/og-default.png (IHDR)', () => {
    const png = readFileSync(join(process.cwd(), 'public', OG_FALLBACK_IMAGE.path))
    // PNG: 8 B signatura, 4 B délka + 4 B „IHDR", pak šířka a výška (big-endian).
    expect(png.subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'))
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(OG_FALLBACK_IMAGE.width)
    expect(png.readUInt32BE(20)).toBe(OG_FALLBACK_IMAGE.height)
  })

  it('článek: OG article s časy a autorem, Cloudinary fotka dostane zmenšení, alt z titulku bez přípony', () => {
    const m = buildPageMetadata({
      title: { absolute: 'Dva týdny v Myanmaru • Ara.cz' },
      path: '/myanmar/dva-tydny-v-myanmaru',
      image: { url: CLOUDINARY },
      type: 'article',
      publishedTime: '2019-03-12T22:00:00.000Z',
      modifiedTime: '2026-08-01T10:00:00.000Z',
      authors: [`${getSiteURL()}/profil/panda`],
    })
    expect(m.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2019-03-12T22:00:00.000Z',
      modifiedTime: '2026-08-01T10:00:00.000Z',
      authors: [`${getSiteURL()}/profil/panda`],
    })
    const [img] = ogImages(m)
    expect(img.url).toMatch(/\/upload\/f_auto,q_auto,c_limit,w_1200\/v1\/foto\.jpg$/)
    expect(img.alt).toBe('Dva týdny v Myanmaru')
    // Bez známého originálu se rozměry neposílají (lepší nic než špatný poměr).
    expect(img).not.toHaveProperty('width')
    expect(img).not.toHaveProperty('height')
    expect(m.twitter).toEqual({ card: 'summary_large_image' })
  })

  it('og:image:alt: alt média z CMS má přednost, prázdný/bílý alt → titulek stránky', () => {
    const withAlt = buildPageMetadata({
      title: 'Počasí v Norsku',
      path: '/norsko/pocasi',
      image: { url: CLOUDINARY, alt: 'Fjord Geiranger za úsvitu' },
    })
    expect(ogImages(withAlt)[0].alt).toBe('Fjord Geiranger za úsvitu')

    const blankAlt = buildPageMetadata({
      title: 'Počasí v Norsku',
      path: '/norsko/pocasi',
      image: { url: CLOUDINARY, alt: '   ' },
    })
    expect(ogImages(blankAlt)[0].alt).toBe('Počasí v Norsku')
  })

  it('rozměry originálu z CMS: širší než 1200 se zmenší se zachováním poměru, menší zůstanou', () => {
    const big = buildPageMetadata({
      title: 'Norsko',
      path: '/norsko',
      image: { url: CLOUDINARY, width: 2400, height: 1350 },
    })
    expect(ogImages(big)[0]).toMatchObject({ width: 1200, height: 675 })

    const small = buildPageMetadata({
      title: 'Norsko',
      path: '/norsko',
      image: { url: CLOUDINARY, width: 800, height: 600 },
    })
    expect(ogImages(small)[0]).toMatchObject({ width: 800, height: 600 })
  })

  it('relativní Payload upload se stane absolutním a rozměry platí beze změny (bez transformace)', () => {
    const m = buildPageMetadata({
      title: 'X',
      path: '/x',
      image: { url: '/api/media/file/a.jpg', width: 3000, height: 2000 },
    })
    const [img] = ogImages(m)
    expect(img.url).toMatch(/^https?:\/\/.+\/api\/media\/file\/a\.jpg$/)
    expect(img).toMatchObject({ width: 3000, height: 2000, alt: 'X' })
  })
})

describe('ogImageDimensions + shareImageFromMedia', () => {
  it('neúplné či nesmyslné rozměry → null; poměr stran se zaokrouhluje', () => {
    expect(ogImageDimensions(CLOUDINARY, null, 100)).toBeNull()
    expect(ogImageDimensions(CLOUDINARY, 0, 100)).toBeNull()
    expect(ogImageDimensions(CLOUDINARY, 1201, 800)).toEqual({ width: OG_IMAGE_WIDTH, height: 799 })
    expect(ogImageDimensions(CLOUDINARY, OG_IMAGE_WIDTH, 630)).toEqual({ width: 1200, height: 630 })
  })

  it('shareImageFromMedia: bez URL null, jinak url + alt + rozměry média', () => {
    expect(shareImageFromMedia(null)).toBeNull()
    expect(shareImageFromMedia({ url: '', alternativeText: 'x' })).toBeNull()
    expect(
      shareImageFromMedia({ url: CLOUDINARY, alternativeText: 'Fjord', width: 4000, height: 3000 }),
    ).toEqual({ url: CLOUDINARY, alt: 'Fjord', width: 4000, height: 3000 })
  })
})

describe('articleJsonLd — schema.org Article', () => {
  it('obsahuje autora, data, vydavatele a kanonickou URL; escapuje „<"', () => {
    const json = articleJsonLd({
      title: 'Za ayahuascou <do> pralesa',
      description: 'Popis',
      path: '/ekvador/za-ayahuascou',
      imageUrl: 'https://res.cloudinary.com/ara/image/upload/v1/x.jpg',
      publishedAt: '2019-03-12T22:00:00.000Z',
      modifiedAt: '2026-08-01T10:00:00.000Z',
      author: { name: 'Maria M.', profilePath: '/profil/Panda' },
    })
    expect(json).not.toContain('<')
    const data = JSON.parse(json)
    expect(data).toMatchObject({
      '@type': 'Article',
      headline: 'Za ayahuascou <do> pralesa',
      datePublished: '2019-03-12T22:00:00.000Z',
      dateModified: '2026-08-01T10:00:00.000Z',
      author: { '@type': 'Person', name: 'Maria M.', url: `${getSiteURL()}/profil/Panda` },
      publisher: { '@type': 'Organization', name: SITE_NAME },
      mainEntityOfPage: `${getSiteURL()}/ekvador/za-ayahuascou`,
      inLanguage: 'cs',
    })
    expect(data.image[0]).toContain('w_1200')
  })

  it('bez autora je autorem web (Organization)', () => {
    const data = JSON.parse(articleJsonLd({ title: 'T', path: '/a/b' }))
    expect(data.author).toEqual({ '@type': 'Organization', name: SITE_NAME, url: getSiteURL() })
    expect(data).not.toHaveProperty('image')
    expect(data).not.toHaveProperty('datePublished')
  })
})
