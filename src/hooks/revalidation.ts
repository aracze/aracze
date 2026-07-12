import { revalidateTag } from 'next/cache'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

/**
 * Okamžitá invalidace cache webu při změně obsahu v adminu.
 *
 * Web běží ve stejné Next.js aplikaci a čte data přes Local API s
 * `unstable_cache` + tagy (viz src/lib/payload.ts a src/lib/search.ts).
 * Tyto hooky po uložení/smazání dokumentu zavolají `revalidateTag`, takže
 * změna je na webu vidět hned — žádné čekání na vypršení cache, žádné webhooky.
 */

// revalidateTag funguje jen uvnitř Next runtime; mimo něj (payload CLI,
// skripty) ho tiše přeskočíme, aby nespadl např. generate:types.
const safeRevalidate = (tags: string[]) => {
  try {
    // expire: 0 → tag se zneplatní okamžitě. (updateTag je v Next 16 jen pro
    // Server Actions; z Payload hooku by vyhodil chybu a invalidace by se ztratila.)
    for (const tag of tags) revalidateTag(tag, { expire: 0 })
  } catch {
    /* mimo Next runtime */
  }
}

type PageLikeDoc = {
  fullSlug?: string | null
  breadcrumbs?: { url?: string | null }[] | null
}

/** Tagy stránky + všech jejích předků (jejich seznamy dětí se mění s ní). */
const pageTags = (doc: PageLikeDoc | undefined | null): string[] => {
  if (!doc) return []
  const tags: string[] = []
  if (typeof doc.fullSlug === 'string' && doc.fullSlug) {
    tags.push('page_' + doc.fullSlug, 'page_' + doc.fullSlug + '_articles')
  }
  if (Array.isArray(doc.breadcrumbs)) {
    for (const crumb of doc.breadcrumbs) {
      if (typeof crumb?.url === 'string' && crumb.url) {
        tags.push('page_' + crumb.url, 'page_' + crumb.url + '_articles')
      }
    }
  }
  return tags
}

export const revalidatePageAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc }) => {
  safeRevalidate([
    'pages',
    'root_pages',
    'sitemap',
    'search-index',
    ...pageTags(doc as PageLikeDoc),
    ...pageTags(previousDoc as PageLikeDoc),
  ])
  return doc
}

export const revalidatePageAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  safeRevalidate([
    'pages',
    'root_pages',
    'sitemap',
    'search-index',
    ...pageTags(doc as PageLikeDoc),
  ])
  return doc
}

type ArticleLikeDoc = {
  slug?: string | null
  mainPage?: number | string | { fullSlug?: string | null } | null
  pages?: (number | string | { fullSlug?: string | null })[] | null
}

/** Tagy stránek, na kterých se článek zobrazuje (mainPage + pages). */
const articlePageTags = (doc: ArticleLikeDoc | undefined | null): string[] => {
  if (!doc) return []
  const tags: string[] = []
  if (typeof doc.slug === 'string' && doc.slug) tags.push('article_' + doc.slug)
  const related = [doc.mainPage, ...(Array.isArray(doc.pages) ? doc.pages : [])]
  for (const rel of related) {
    if (rel && typeof rel === 'object' && typeof rel.fullSlug === 'string' && rel.fullSlug) {
      tags.push('page_' + rel.fullSlug, 'page_' + rel.fullSlug + '_articles')
    }
  }
  return tags
}

export const revalidateArticleAfterChange: CollectionAfterChangeHook = ({ doc, previousDoc }) => {
  safeRevalidate([
    'articles',
    'sitemap',
    // Relace mohou být jen id (bez fullSlug) — pak spadne invalidace na
    // obecný tag 'pages' (jistota správnosti nad mikro-optimalizací).
    'pages',
    ...articlePageTags(doc as ArticleLikeDoc),
    ...articlePageTags(previousDoc as ArticleLikeDoc),
  ])
  return doc
}

export const revalidateArticleAfterDelete: CollectionAfterDeleteHook = ({ doc }) => {
  safeRevalidate(['articles', 'sitemap', 'pages', ...articlePageTags(doc as ArticleLikeDoc)])
  return doc
}

/** Globals (header, homepage, footer) ovlivňují layout všech stránek. */
export const revalidateGlobalsAfterChange: GlobalAfterChangeHook = ({ doc }) => {
  safeRevalidate(['root_pages', 'footer'])
  return doc
}
