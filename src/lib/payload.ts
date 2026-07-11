import {
  Page,
  PageChild,
  PagesResponse,
  Article,
  GlobalHeader,
  Homepage,
  GlobalFooter,
} from '@/types/payload'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { isProduction } from './utils'

/**
 * Datová vrstva webu nad Payload LOCAL API.
 *
 * Dřív si web tahal data z CMS přes HTTP REST (~0,3–0,4 s režie na dotaz na
 * slabém CPU). Po sloučení frontendu do Payload aplikace voláme databázi přímo
 * v procesu — bez HTTP, bez serializace přes síť.
 *
 * Cache: Local API neprochází fetch-cache Nextu, proto těžší čtení balíme do
 * `unstable_cache` se STEJNÝMI tagy jako dřív. Publikace v adminu je
 * invaliduje okamžitě přes revalidateTag v afterChange hoocích (viz
 * src/hooks/revalidation.ts). Ve vývoji se cache obchází (čerstvá data).
 *
 * Pozn.: media dokumenty se NIKDY neořezávají přes select/populate — cloudinary
 * plugin počítá `url` v afterRead hooku z ostatních polí; s ořezanými poli by
 * vracel url: null a obrázky by zmizely (ověřeno dřív na REST).
 */

const getDb = (): Promise<Payload> => getPayload({ config })

/** Obal: v produkci cache s tagy (revalidace hooky), ve vývoji přímé volání. */
function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyPrefix: string,
  tags: (args: A) => string[],
): (...args: A) => Promise<R> {
  if (!isProduction()) return fn
  return (...args: A) =>
    unstable_cache(fn, [keyPrefix], {
      tags: tags(args),
      revalidate: 300, // pojistka; primárně invalidují hooky
    })(...args)
}

const DEFAULT_LIMIT = 200

// Pole potřebná pro hlavní menu (header): jen názvy/odkazy stránek a jejich
// dětí — bez selectu by se tahaly i texty, články a média (~3 MB místo ~8 KB).
const MENU_SELECT = {
  title: true,
  slug: true,
  fullSlug: true,
  category: true,
  subPages: true,
} as const

const MENU_POPULATE = {
  pages: { title: true, slug: true, fullSlug: true, category: true },
} as const

// Pro předky (breadcrumbs, menu kontext, kořen): navíc detail + featuredImage —
// podstránky z kořene berou hero obrázek a fallback měny/časové zóny.
const ANCESTOR_SELECT = {
  ...MENU_SELECT,
  detail: true,
  featuredImage: true,
} as const

// Detail stránky = 3 paralelní dotazy (stránka ∥ děti ∥ články), každý jen
// s poli, která web kreslí (bez SEO meta, breadcrumbs polí, profilů uživatelů).
const PAGE_SCALAR_SELECT = {
  title: true,
  slug: true,
  fullSlug: true,
  category: true,
  text: true,
  detail: true,
  featuredImage: true,
  createdBy: true,
  createdByPublic: true,
} as const

const PAGE_SCALAR_POPULATE = {
  users: { username: true, firstName: true, lastName: true },
} as const

const PAGE_CHILDREN_SELECT = {
  title: true,
  slug: true,
  fullSlug: true,
  category: true,
  text: true,
  detail: true,
  featuredImage: true,
} as const

const PAGE_ARTICLES_SELECT = {
  title: true,
  slug: true,
  documentId: true,
  text: true,
  featuredImage: true,
  mainPage: true,
} as const

type PayloadDocsResponse<T> = {
  docs: T[]
  totalDocs?: number
}

type RawPayloadPage = Omit<Page, 'children' | 'articles'> & {
  children?: {
    docs: PageChild[]
  }
  subPages?: {
    docs: PageChild[]
  }
  articles?: Article[]
  primaryArticles?: {
    docs: Article[]
  }
  secondaryArticles?: {
    docs: Article[]
  }
}

function normalizePage(page: RawPayloadPage): Page {
  const normalizedChildren = page.children?.docs ?? page.subPages?.docs ?? []

  const primary = page.articles ?? page.primaryArticles?.docs ?? []
  const secondary = page.secondaryArticles?.docs ?? []
  // Merge primary + secondary, deduplicate by documentId/slug
  const seen = new Set<string>()
  const normalizedArticles: Article[] = []
  for (const a of [...primary, ...secondary]) {
    const key = a.documentId || a.slug
    if (!seen.has(key)) {
      seen.add(key)
      normalizedArticles.push(a)
    }
  }

  return {
    ...page,
    children: {
      docs: normalizedChildren,
    },
    articles: normalizedArticles,
  }
}

function normalizePages(pages: RawPayloadPage[]): Page[] {
  return pages.map(normalizePage)
}

async function fetchAllPagesPayload(): Promise<RawPayloadPage[]> {
  const payload = await getDb()
  const res = await payload.find({
    overrideAccess: false,
    collection: 'pages',
    limit: DEFAULT_LIMIT,
    depth: 1,
    select: MENU_SELECT,
    populate: MENU_POPULATE,
  })
  return res.docs as unknown as RawPayloadPage[]
}

// DŮLEŽITÉ: uvnitř cached() funkcí se selhání DB NESMÍ polykat — unstable_cache
// by prázdný výsledek uložil (při buildu bez DB by se zapekl přímo do buildu
// a runtime by ho pak servíroval). Chyba musí propadnout VEN z cache (neuloží
// se nic) a fallback řeší až exportovaná obálka.
async function fetchRootPagesUncached(): Promise<PagesResponse> {
  const payload = await getDb()

  const [rootRes, headerRes, homepageRes] = await Promise.all([
    payload
      .find({
        overrideAccess: false,
        collection: 'pages',
        where: { parent: { exists: false } },
        limit: DEFAULT_LIMIT,
        depth: 1,
        select: MENU_SELECT,
        populate: MENU_POPULATE,
      })
      .then((r) => r.docs as unknown as RawPayloadPage[])
      .catch(() => fetchAllPagesPayload()),
    payload.findGlobal({ slug: 'header', overrideAccess: false }).catch(() => null),
    payload.findGlobal({ slug: 'homepage', overrideAccess: false }).catch(() => null),
  ])

  const header = headerRes as Record<string, unknown> | null
  const homepage = homepageRes as Record<string, unknown> | null

  return {
    data: {
      pages: normalizePages(rootRes),
      global: header
        ? {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            header: ((header as any).header || header) as GlobalHeader,
          }
        : null,
      homepage: homepage
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (((homepage as any).homepage || homepage) as Homepage)
        : null,
    },
  }
}

const fetchRootPagesCached = cached(fetchRootPagesUncached, 'root-pages', () => [
  'root_pages',
  'pages',
])

export const fetchRootPages = cache(async (): Promise<PagesResponse> => {
  try {
    return await fetchRootPagesCached()
  } catch {
    // DB nedostupná (typicky při buildu obrazu v CI, kde neběží žádná DB).
    // Nespadneme — vrátíme prázdno; nic se necachuje, za běhu se data doplní.
    return { data: { pages: [], global: null, homepage: null } }
  }
})

/**
 * Article cards come from joins where `featuredImage.image` may be a numeric id.
 * Resolve those ids to URLs so listing cards show thumbnails. (S depth 1 už
 * obvykle přichází celé media objekty a tohle je no-op.)
 */
async function enrichArticleImages(articles: Article[]): Promise<Article[]> {
  if (!articles?.length) return articles ?? []

  const ids = articles
    .map((a) => a.featuredImage?.image)
    .filter((img): img is number => typeof img === 'number')

  if (ids.length === 0) return articles

  const urlMap = await fetchMediaUrlsByIds([...new Set(ids)])

  return articles.map((a) => {
    const img = a.featuredImage?.image
    if (a.featuredImage && typeof img === 'number' && urlMap.has(img)) {
      return {
        ...a,
        featuredImage: {
          ...a.featuredImage,
          image: { url: urlMap.get(img)!, alternativeText: null },
        },
      }
    }
    return a
  })
}

/** Id z relace, která může být číslo nebo populovaný objekt. */
function relationId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: number | string }).id
  }
  return null
}

async function fetchPageByFullSlugUncached(fullSlug: string): Promise<{ data: { pages: Page[] } }> {
  const payload = await getDb()

  // Tři nezávislé dotazy paralelně — viz komentář u *_SELECT konstant.
  // Selhání DB propadá ven (nesmí se uložit do cache) — fallback řeší export.
  const [pageRes, childrenRes, articlesRes] = (await Promise.all([
    payload.find({
      overrideAccess: false,
      collection: 'pages',
      where: { fullSlug: { equals: fullSlug } },
      limit: 1,
      depth: 1,
      select: PAGE_SCALAR_SELECT,
      populate: PAGE_SCALAR_POPULATE,
    }) as unknown as Promise<PayloadDocsResponse<RawPayloadPage>>,
    payload
      .find({
        overrideAccess: false,
        collection: 'pages',
        where: { 'parent.fullSlug': { equals: fullSlug } },
        limit: 100,
        depth: 1,
        select: PAGE_CHILDREN_SELECT,
      })
      .catch(() => ({ docs: [] })) as unknown as Promise<PayloadDocsResponse<PageChild>>,
    payload
      .find({
        overrideAccess: false,
        collection: 'articles',
        where: {
          or: [
            { 'mainPage.fullSlug': { equals: fullSlug } },
            { 'pages.fullSlug': { equals: fullSlug } },
          ],
        },
        limit: 100,
        depth: 1,
        select: PAGE_ARTICLES_SELECT,
      })
      .catch(() => ({ docs: [] })) as unknown as Promise<PayloadDocsResponse<Article>>,
  ])) as unknown as [
    PayloadDocsResponse<RawPayloadPage>,
    PayloadDocsResponse<PageChild>,
    PayloadDocsResponse<Article>,
  ]

  const raw = pageRes.docs?.[0]
  if (!raw) {
    return { data: { pages: [] } }
  }

  // Roztřídění článků: primární (mainPage = tato stránka) první — stejné
  // pořadí jako primaryArticles/secondaryArticles joiny.
  const allArticles = articlesRes.docs || []
  const primary = allArticles.filter(
    (a) => relationId((a as { mainPage?: unknown }).mainPage) === raw.id,
  )
  const secondary = allArticles.filter(
    (a) => relationId((a as { mainPage?: unknown }).mainPage) !== raw.id,
  )

  const match = normalizePage({
    ...raw,
    subPages: { docs: childrenRes.docs || [] },
    primaryArticles: { docs: primary },
    secondaryArticles: { docs: secondary },
  })

  match.articles = await enrichArticleImages(match.articles)

  return {
    data: {
      pages: [match],
    },
  }
}

async function fetchArticleBySlugUncached(
  slug: string,
): Promise<{ data: { articles: Article[] } }> {
  const payload = await getDb()
  const res = await payload.find({
    overrideAccess: false,
    collection: 'articles',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
  })
  return {
    data: { articles: (res.docs || []) as unknown as Article[] },
  }
}

const ensureCorrectFullSlug = (fullSlug: string) => {
  return fullSlug.startsWith('/') ? fullSlug : `/${fullSlug}`
}

const fetchArticleBySlugCached = cached(fetchArticleBySlugUncached, 'article', ([slug]) => [
  'article_' + slug,
])

export const fetchArticleBySlug = cache(async (slug: string, _parentSlug?: string) => {
  try {
    return await fetchArticleBySlugCached(slug)
  } catch {
    return { data: { articles: [] as Article[] } }
  }
})

const fetchPageByFullSlugCached = cached(
  fetchPageByFullSlugUncached,
  'page-detail',
  ([fullSlug]) => ['page_' + fullSlug, 'pages'],
)

export const fetchPageByFullSlug = cache(async (slug: string) => {
  try {
    return await fetchPageByFullSlugCached(ensureCorrectFullSlug(slug))
  } catch {
    return { data: { pages: [] as Page[] } }
  }
})

/**
 * Lehká varianta fetchPageByFullSlug — jen pole pro menu a drobečky
 * (title, slug, fullSlug, category, detail, featuredImage + děti).
 * Používá se pro předky v řetězci (breadcrumbs, menu kontext).
 */
async function fetchPageLightByFullSlugUncached(
  fullSlug: string,
): Promise<{ data: { pages: Page[] } }> {
  const payload = await getDb()
  const res = await payload.find({
    overrideAccess: false,
    collection: 'pages',
    where: { fullSlug: { equals: fullSlug } },
    limit: 1,
    depth: 1,
    select: ANCESTOR_SELECT,
    populate: MENU_POPULATE,
  })
  const raw = res.docs?.[0] as unknown as RawPayloadPage | undefined
  const match = raw ? normalizePage(raw) : undefined
  return { data: { pages: match ? [match] : [] } }
}

const fetchPageLightCached = cached(
  fetchPageLightByFullSlugUncached,
  'page-light',
  ([fullSlug]) => ['page_' + fullSlug, 'pages'],
)

export const fetchPageLightByFullSlug = cache(async (slug: string) => {
  try {
    return await fetchPageLightCached(ensureCorrectFullSlug(slug))
  } catch {
    return { data: { pages: [] as Page[] } }
  }
})

/**
 * Levné zjištění, zda má stránka (podle fullSlug) nějaké články — jen počet,
 * bez stahování obsahu. Rozhoduje o záložce „Články" v podnavigaci.
 */
async function pageHasArticlesBySlugUncached(fullSlug: string): Promise<boolean> {
  const payload = await getDb()
  const res = await payload.count({
    overrideAccess: false,
    collection: 'articles',
    where: { 'mainPage.fullSlug': { equals: fullSlug } },
  })
  return (res.totalDocs ?? 0) > 0
}

const pageHasArticlesBySlugCached = cached(
  pageHasArticlesBySlugUncached,
  'page-has-articles',
  ([fullSlug]) => ['page_' + fullSlug + '_articles', 'articles'],
)

export const pageHasArticlesBySlug = cache(async (fullSlug: string): Promise<boolean> => {
  try {
    return await pageHasArticlesBySlugCached(fullSlug)
  } catch {
    return false
  }
})

export const pageHasArticles = cache(async (pageId: number | string): Promise<boolean> => {
  try {
    const payload = await getDb()
    const res = await payload.count({
      overrideAccess: false,
      collection: 'articles',
      where: { mainPage: { equals: pageId } },
    })
    return (res.totalDocs ?? 0) > 0
  } catch {
    return false
  }
})

async function fetchFooterUncached(): Promise<GlobalFooter | null> {
  const payload = await getDb()
  const data = (await payload.findGlobal({
    slug: 'footer',
    overrideAccess: false,
  })) as unknown as Record<string, unknown>
  return {
    logo: (data.logo as GlobalFooter['logo']) ?? null,
    navItems: (data.navItems as GlobalFooter['navItems']) ?? [],
    copyrightText: (data.copyrightText as GlobalFooter['copyrightText']) ?? null,
  }
}

const fetchFooterCached = cached(fetchFooterUncached, 'footer', () => ['footer'])

export const fetchFooter = cache(async (): Promise<GlobalFooter | null> => {
  try {
    return await fetchFooterCached()
  } catch {
    return null
  }
})

/**
 * Batch-fetch media URLs by IDs for map markers.
 * Returns a Map of mediaId → URL string.
 * (Bez cache — lokální dotaz je ~ms a Map není serializovatelná.)
 */
export async function fetchMediaUrlsByIds(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()
  const map = new Map<number, string>()
  try {
    const payload = await getDb()
    const res = await payload.find({
      overrideAccess: false,
      collection: 'media',
      where: { id: { in: ids } },
      limit: ids.length,
      depth: 0,
    })
    for (const doc of res.docs || []) {
      const d = doc as unknown as { id: number; url?: string | null }
      if (d.url) map.set(d.id, d.url)
    }
  } catch {
    // bez URL — karty zobrazí placeholder
  }
  return map
}

/**
 * All indexable page & article paths for the sitemap. Pages use `fullSlug`,
 * články `mainPage.fullSlug + slug`.
 */
async function fetchSitemapEntriesUncached(): Promise<{
  pages: { path: string; lastModified: string }[]
  articles: { path: string; lastModified: string }[]
}> {
  type SitemapPage = { fullSlug?: string | null; updatedAt?: string | null }
  type SitemapArticle = {
    slug?: string | null
    updatedAt?: string | null
    mainPage?: { fullSlug?: string | null } | number | null
  }

  const payload = await getDb()
  const [p, a] = await Promise.all([
    payload.find({
      overrideAccess: false,
      collection: 'pages',
      limit: 0,
      pagination: false,
      depth: 0,
      select: { fullSlug: true, updatedAt: true },
    }),
    payload.find({
      overrideAccess: false,
      collection: 'articles',
      limit: 0,
      pagination: false,
      depth: 1,
      select: { slug: true, updatedAt: true, mainPage: true },
      populate: { pages: { fullSlug: true } },
    }),
  ])
  const pagesDocs = p.docs as unknown as SitemapPage[]
  const articlesDocs = a.docs as unknown as SitemapArticle[]

  const now = new Date().toISOString()

  const pages = pagesDocs
    .filter((p) => typeof p.fullSlug === 'string' && p.fullSlug)
    .map((p) => ({
      path: p.fullSlug as string,
      lastModified: p.updatedAt || now,
    }))

  const articles = articlesDocs
    .map((a) => {
      const mp = a.mainPage
      const parent =
        mp && typeof mp === 'object' && typeof mp.fullSlug === 'string' ? mp.fullSlug : null
      if (!parent || !a.slug) return null
      return {
        path: `${parent.replace(/\/$/, '')}/${a.slug}`,
        lastModified: a.updatedAt || now,
      }
    })
    .filter((x): x is { path: string; lastModified: string } => x !== null)

  return { pages, articles }
}

const fetchSitemapEntriesCached = cached(fetchSitemapEntriesUncached, 'sitemap', () => [
  'sitemap',
  'pages',
  'articles',
])

export const fetchSitemapEntries = async () => {
  try {
    return await fetchSitemapEntriesCached()
  } catch (err) {
    console.error('[sitemap] load failed:', err)
    return { pages: [], articles: [] }
  }
}
