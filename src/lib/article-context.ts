/**
 * Kontext článku — stránky, pod kterými článek na webu visí. JEDNO pravidlo pro
 * komponentu Article (menu, drobečky, hero) i `generateMetadata` (náhled ke
 * sdílení musí ukazovat tutéž fotku jako viditelné hero). React `cache()` →
 * v rámci jednoho requestu se počítá jen jednou, metadata i render dostanou
 * stejný výsledek bez dalších dotazů.
 */
import { cache } from 'react'
import type { Article, Page } from '@/types/payload'
import { fetchPageLightByFullSlug } from '@/lib/payload'
import { fetchAncestorChain } from '@/lib/page-ancestors'
import { menuOwnerCategories } from '@/lib/page-hierarchy'

export type ArticleContext = {
  /** Stránka z adresy, ze které uživatel přišel (jinak hlavní stránka článku). */
  contextPage: Page | null
  /** Kořen z prvního segmentu adresy (země, rubrika…). */
  rootPage: Page | null
  /** Místo, ke kterému článek patří — vlastní menu, drobečky i hero fotku. */
  placePage: Page | null
  /** Stránka, ze které se bere hero fotka, když článek vlastní nemá. */
  heroPage: Page | null
}

/**
 * Kontext článku podle adresy: `contextSlug` je rodičovská část URL
 * (`resolveSlugRoute().parentSlug`), bez ní hlavní stránka článku.
 */
export const resolveArticleContext = cache(
  async (article: Article, contextSlug?: string | null): Promise<ArticleContext> => {
    const contextPageSlug = contextSlug || article.mainPage?.fullSlug?.replace(/^\//, '') || null
    const { contextPage, rootPage } = await resolveContextPages(contextPageSlug)
    // Článek se chová jako turistický cíl: sekundární menu patří MÍSTU, pod
    // kterým visí (např. San Francisco), ne zemi z prvního segmentu URL.
    const placePage = await resolvePlacePage(contextPage, rootPage)
    // Hero fotka ze STEJNÉHO místa jako menu a drobečky (legacy: obrázek
    // článku, jinak fotka nejbližšího místa).
    return { contextPage, rootPage, placePage, heroPage: placePage || contextPage }
  },
)

/**
 * Kontextová stránka + její kořen (první segment adresy) lehkým fetchem —
 * detail článku potřebuje jen menu/hero pole, ne plná data stránky s články.
 */
async function resolveContextPages(
  contextPageSlug: string | null,
): Promise<{ contextPage: Page | null; rootPage: Page | null }> {
  if (!contextPageSlug) return { contextPage: null, rootPage: null }

  // Když je kontext sám kořenem, stačí jeden dotaz.
  const rootSlug = contextPageSlug.split('/')[0]
  if (rootSlug === contextPageSlug) {
    const { data } = await fetchPageLightByFullSlug(contextPageSlug)
    const contextPage = data?.pages[0] ?? null
    return { contextPage, rootPage: contextPage }
  }

  // Nezávislé dotazy paralelně (fetchPageLightByFullSlug je navíc dedup přes cache).
  const [ctxRes, rootRes] = await Promise.all([
    fetchPageLightByFullSlug(contextPageSlug),
    fetchPageLightByFullSlug(rootSlug),
  ])

  const contextPage = ctxRes.data?.pages[0] ?? null
  if (!contextPage) return { contextPage: null, rootPage: null }

  const rootPage = rootRes.data?.pages[0] ?? contextPage
  return { contextPage, rootPage }
}

/**
 * Místo článku (stejné pravidlo jako u podstránek a turistických cílů): kontext
 * sám, je-li vlastníkem menu (místo/rubrika); jinak nejbližší takový předek;
 * když žádný není, kořenová stránka. Článek jde v CMS připojit i k stránce,
 * která místem není (informační podstránka), proto ten průchod předky.
 */
async function resolvePlacePage(
  contextPage: Page | null,
  rootPage: Page | null,
): Promise<Page | null> {
  if (!contextPage) return rootPage

  if (contextPage.category && menuOwnerCategories.includes(contextPage.category)) {
    return contextPage
  }

  const ancestors = await fetchAncestorChain(contextPage.fullSlug)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]
    if (
      !('isPlaceholder' in ancestor) &&
      ancestor.category &&
      menuOwnerCategories.includes(ancestor.category)
    ) {
      return ancestor
    }
  }

  return rootPage
}
