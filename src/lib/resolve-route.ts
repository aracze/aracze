import { cache } from 'react'
import { fetchArticleBySlug, fetchPageByFullSlug } from '@/lib/payload'
import { isValidArticleParent } from '@/lib/utils'
import type { Article, Page } from '@/types/payload'

export type SlugResolution =
  | { kind: 'page'; page: Page }
  | { kind: 'article'; article: Article; parentSlug: string }
  | { kind: 'notFound' }

/**
 * Jediné místo, které z cesty v URL rozhodne, CO to je: stránka, článek (pod
 * platným rodičem), nebo 404. Sdílí ho `[...slug]/layout.tsx` (autoritativní
 * check pro TVRDÝ 404 nad loading kostrou) i `[...slug]/page.tsx` (render).
 *
 * Proč string `fullSlug`, ne pole segmentů: React `cache()` klíčuje přes
 * `Object.is` per argument. String se stejnou hodnotou dedupuje mezi layoutem
 * a page (jeden request → jedna sada DB dotazů), nové pole z `params` by ale
 * pokaždé minulo. Jednotlivé fetchy uvnitř jsou navíc taky React-cache.
 */
export const resolveSlugRoute = cache(async (fullSlug: string): Promise<SlugResolution> => {
  // 1. Nejdřív jako stránka.
  const { data: pageData } = await fetchPageByFullSlug(fullSlug)
  if (pageData?.pages.length > 0) return { kind: 'page', page: pageData.pages[0] }

  // 2. Jinak jako článek (poslední segment = slug článku, zbytek = rodič z URL).
  const segments = fullSlug.split('/').filter(Boolean)
  if (segments.length > 1) {
    const articleSlug = segments[segments.length - 1]
    const parentSlug = segments.slice(0, -1).join('/')
    const { data: articleData } = await fetchArticleBySlug(articleSlug, parentSlug)
    // #21: článek uznáme jen pod platným rodičem (mainPage nebo některá z pages).
    if (
      articleData.articles.length > 0 &&
      isValidArticleParent(parentSlug, articleData.validParentSlugs)
    ) {
      return { kind: 'article', article: articleData.articles[0], parentSlug }
    }
  }

  return { kind: 'notFound' }
})
