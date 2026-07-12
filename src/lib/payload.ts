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

// Globální singleton Payload instance. getPayload má vlastní cache, ale v dev
// s Turbopackem se moduly izolují a init se opakoval při každém požadavku
// (schema pull + connect = desítky sekund). Držíme instanci na globalThis.
const __g = globalThis as unknown as { __araPayload?: Promise<Payload> }
const getDb = (): Promise<Payload> => {
  if (!__g.__araPayload) {
    __g.__araPayload = getPayload({ config })
  }
  return __g.__araPayload
}

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
// DŮLEŽITÉ: web NIKDY nečte JOIN pole (subPages, primaryArticles, comments…)
// přes joiny — Payload je vyhodnocuje za KAŽDÝ vrácený dokument i když nejsou
// v selectu, což stojí stovky ms za dokument (v dev režimu ještě řádově víc).
// Všechny webové dotazy proto mají `joins: false` a děti/články tahají
// samostatné přímé dotazy přes `parent`/`mainPage`. Joiny zůstávají jen
// pro admin rozhraní.
const MENU_SELECT = {
  title: true,
  slug: true,
  fullSlug: true,
  category: true,
} as const

// Děti pro menu — hromadný dotaz přes `parent`; parent v selectu kvůli
// seskupení dětí ke správnému rodiči.
const MENU_CHILD_SELECT = {
  ...MENU_SELECT,
  parent: true,
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
        depth: 0,
        select: MENU_SELECT,
        joins: false,
      })
      .then((r) => r.docs as unknown as RawPayloadPage[]),
    payload.findGlobal({ slug: 'header', overrideAccess: false }).catch(() => null),
    payload.findGlobal({ slug: 'homepage', overrideAccess: false }).catch(() => null),
  ])

  // Děti kořenových stránek (rozbalovací menu) jedním hromadným dotazem —
  // dřív je nosil subPages join, který stál sekundy za každý kořen.
  const childrenByParent = new Map<number | string, PageChild[]>()
  const rootIds = rootRes.map((p) => p.id).filter((id) => id != null)
  if (rootIds.length > 0) {
    const kids = await payload
      .find({
        overrideAccess: false,
        collection: 'pages',
        where: { parent: { in: rootIds } },
        limit: 0,
        pagination: false,
        depth: 0,
        select: MENU_CHILD_SELECT,
        joins: false,
      })
      .catch(() => ({ docs: [] }))
    for (const doc of kids.docs as unknown as Array<PageChild & { parent?: unknown }>) {
      const pid = relationId(doc.parent)
      if (pid == null) continue
      const list = childrenByParent.get(pid) ?? []
      list.push(doc)
      childrenByParent.set(pid, list)
    }
  }

  const rootsWithChildren = rootRes.map((p) => ({
    ...p,
    subPages: { docs: childrenByParent.get(p.id) ?? [] },
  }))

  const header = headerRes as Record<string, unknown> | null
  const homepage = homepageRes as Record<string, unknown> | null

  return {
    data: {
      pages: normalizePages(rootsWithChildren),
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
 * Karty (články i podstránky) se tahají s depth 0, takže `featuredImage.image`
 * je číselné id. Tady se ids hromadně přeloží na URL jedním dotazem — populace
 * přes depth 1 by stála stovky ms za KAŽDÝ dokument (v dev ještě víc).
 */
async function enrichFeaturedImages<T extends { featuredImage?: { image?: unknown } | null }>(
  docs: T[],
): Promise<T[]> {
  if (!docs?.length) return docs ?? []

  const ids = docs
    .map((d) => d.featuredImage?.image)
    .filter((img): img is number => typeof img === 'number')

  if (ids.length === 0) return docs

  const urlMap = await fetchMediaUrlsByIds([...new Set(ids)])

  return docs.map((d) => {
    const img = d.featuredImage?.image
    if (d.featuredImage && typeof img === 'number' && urlMap.has(img)) {
      return {
        ...d,
        featuredImage: {
          ...d.featuredImage,
          image: { url: urlMap.get(img)!, alternativeText: null },
        },
      }
    }
    return d
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

async function resolvePageAuthorPublic(
  payload: Payload,
  createdBy: unknown,
): Promise<Page['createdByPublic']> {
  const authorId = relationId(createdBy)
  if (authorId == null) return null

  try {
    const user = (await payload.findByID({
      collection: 'users',
      id: authorId,
      depth: 0,
      joins: false,
      overrideAccess: false,
      select: { username: true, firstName: true, lastName: true, avatar: true },
    })) as unknown as {
      id: number | string
      username?: string | null
      firstName?: string | null
      lastName?: string | null
      avatar?: unknown
    }

    const avatarId = relationId(user.avatar)
    const avatarUrl =
      typeof avatarId === 'number'
        ? ((await fetchMediaUrlsByIds([avatarId])).get(avatarId) ?? null)
        : null

    return {
      id: Number(user.id),
      username: user.username ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      avatar: avatarUrl ? { url: avatarUrl, alternativeText: null } : null,
    }
  } catch {
    return null
  }
}

async function fetchPageByFullSlugUncached(fullSlug: string): Promise<{ data: { pages: Page[] } }> {
  const payload = await getDb()

  // Nejdřív načteme stránku + děti. Články dotahujeme až po nalezení stránky
  // a filtrujeme přes id relace (`mainPage`/`pages`) místo `*.fullSlug`.
  // Dotaz přes `mainPage.fullSlug` byl na některých stránkách výrazně pomalý.
  const pagePromise = payload
    .find({
      overrideAccess: false,
      collection: 'pages',
      where: { fullSlug: { equals: fullSlug } },
      limit: 1,
      depth: 0,
      select: PAGE_SCALAR_SELECT,
      joins: false,
    })
    .then((res) => res as unknown as PayloadDocsResponse<RawPayloadPage>)

  const childrenPromise = payload
    .find({
      overrideAccess: false,
      collection: 'pages',
      where: { 'parent.fullSlug': { equals: fullSlug } },
      limit: 100,
      // depth 0: obrázky karet dořeší enrichFeaturedImages hromadně — depth 1
      // by populoval media dokument za KAŽDÉ dítě zvlášť (v dev ~0,35 s/kus).
      depth: 0,
      select: PAGE_CHILDREN_SELECT,
      joins: false,
    })
    .then((res) => res as unknown as PayloadDocsResponse<PageChild>)
    .catch(() => ({ docs: [] }) as PayloadDocsResponse<PageChild>)

  const [pageRes, childrenRes] = (await Promise.all([pagePromise, childrenPromise])) as [
    PayloadDocsResponse<RawPayloadPage>,
    PayloadDocsResponse<PageChild>,
  ]

  const raw = pageRes.docs?.[0]
  if (!raw) {
    return { data: { pages: [] } }
  }

  const articlesRes = (await payload
    .find({
      overrideAccess: false,
      collection: 'articles',
      where: {
        or: [{ mainPage: { equals: raw.id } }, { pages: { in: [raw.id] } }],
      },
      limit: 100,
      // depth 0: mainPage stačí jako id (třídění přes relationId) a obrázky
      // karet dořeší enrichFeaturedImages. depth 1 by populoval mainPage jako
      // celé pages dokumenty VČETNĚ vyhodnocení jejich joinů (sekundy navíc).
      depth: 0,
      select: PAGE_ARTICLES_SELECT,
      joins: false,
    })
    .catch(() => ({ docs: [] }))) as unknown as PayloadDocsResponse<Article>

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

  const [enrichedPageArr, enrichedArticles, enrichedChildren, createdByPublic] = await Promise.all([
    enrichFeaturedImages([match]),
    enrichFeaturedImages(match.articles),
    enrichFeaturedImages(match.children.docs),
    resolvePageAuthorPublic(payload, (raw as { createdBy?: unknown }).createdBy),
  ])

  const enrichedPage = enrichedPageArr[0] as Page
  enrichedPage.articles = enrichedArticles
  enrichedPage.children = { docs: enrichedChildren }
  if (createdByPublic) {
    enrichedPage.createdByPublic = createdByPublic
  }

  return {
    data: {
      pages: [enrichedPage],
    },
  }
}

// Detail článku — jen pole, která článek kreslí (titulek, text, hero obrázek,
// autor, atribuce); mainPage jako id, rodič se dohledá zvlášť.
const ARTICLE_DETAIL_SELECT = {
  title: true,
  slug: true,
  documentId: true,
  text: true,
  attribution: true,
  featuredImage: true,
  mainPage: true,
  createdBy: true,
  createdByPublic: true,
} as const

async function fetchArticleBySlugUncached(
  slug: string,
): Promise<{ data: { articles: Article[] } }> {
  const payload = await getDb()
  // depth 0 + select + joins:false: dřívější depth 2 bez selectu populoval
  // mainPage/pages jako celé pages dokumenty včetně vyhodnocení JEJICH joinů
  // (v dev ~24 s na dotaz). fullSlug rodiče a URL obrázku doplní mini-dotazy.
  const res = await payload.find({
    overrideAccess: false,
    collection: 'articles',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    select: ARTICLE_DETAIL_SELECT,
    joins: false,
  })
  const raw = res.docs?.[0] as unknown as (Article & { mainPage?: unknown }) | undefined
  if (!raw) return { data: { articles: [] } }

  const mainPageId = relationId(raw.mainPage)
  const [enriched, mainPageDoc] = await Promise.all([
    enrichFeaturedImages([raw]),
    mainPageId != null
      ? payload
          .findByID({
            collection: 'pages',
            id: mainPageId,
            depth: 0,
            select: { title: true, fullSlug: true },
            joins: false,
            overrideAccess: false,
          })
          .catch(() => null)
      : Promise.resolve(null),
  ])

  const article = { ...enriched[0], mainPage: mainPageDoc ?? null } as unknown as Article
  return { data: { articles: [article] } }
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
  // Předek + jeho děti (menu sekce) paralelně — obojí bez joinů.
  const [res, childrenRes] = await Promise.all([
    payload.find({
      overrideAccess: false,
      collection: 'pages',
      where: { fullSlug: { equals: fullSlug } },
      limit: 1,
      depth: 1,
      select: ANCESTOR_SELECT,
      joins: false,
    }),
    payload
      .find({
        overrideAccess: false,
        collection: 'pages',
        where: { 'parent.fullSlug': { equals: fullSlug } },
        limit: 100,
        depth: 0,
        select: MENU_SELECT,
        joins: false,
      })
      .catch(() => ({ docs: [] })),
  ])
  const raw = res.docs?.[0] as unknown as RawPayloadPage | undefined
  const match = raw
    ? normalizePage({
        ...raw,
        subPages: { docs: (childrenRes.docs ?? []) as unknown as PageChild[] },
      })
    : undefined
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
  type SitemapPage = { id: number | string; fullSlug?: string | null; updatedAt?: string | null }
  type SitemapArticle = {
    slug?: string | null
    updatedAt?: string | null
    mainPage?: unknown
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
      joins: false,
    }),
    payload.find({
      overrideAccess: false,
      collection: 'articles',
      limit: 0,
      pagination: false,
      // depth 0: populace mainPage by vyhodnocovala joiny pages dokumentu za
      // každý článek; fullSlug rodiče se bere z mapy už načtených stránek.
      depth: 0,
      select: { slug: true, updatedAt: true, mainPage: true },
      joins: false,
    }),
  ])
  const pagesDocs = p.docs as unknown as SitemapPage[]
  const articlesDocs = a.docs as unknown as SitemapArticle[]

  const now = new Date().toISOString()

  // fullSlug rodičů článků z už načtených stránek (id → fullSlug)
  const slugById = new Map<number | string, string>()
  for (const doc of pagesDocs) {
    if (typeof doc.fullSlug === 'string' && doc.fullSlug) slugById.set(doc.id, doc.fullSlug)
  }

  const pages = pagesDocs
    .filter((p) => typeof p.fullSlug === 'string' && p.fullSlug)
    .map((p) => ({
      path: p.fullSlug as string,
      lastModified: p.updatedAt || now,
    }))

  const articles = articlesDocs
    .map((a) => {
      const parentId = relationId(a.mainPage)
      const parent = parentId != null ? (slugById.get(parentId) ?? null) : null
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
