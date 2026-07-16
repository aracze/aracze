import Fuse from 'fuse.js'
import { unstable_cache } from 'next/cache'
import { getDb } from './db'
import { isProduction, richTextToPlainText } from './utils'
import type { SearchItem } from '@/types/search'

/**
 * Vyhledávací index se staví ZA BĚHU z Local API (dřív se generoval při buildu
 * ze souborů, což vyžadovalo běžící CMS při buildu a index zastarával).
 * Data se cachují s tagy — publikace stránky index okamžitě obnoví
 * (revalidateTag v hoocích). Fuse index nad ~200 položkami se staví za ~ms.
 *
 * Payload instance se sdílí přes stejný singleton (getDb) jako datová vrstva —
 * /api/search se volá při psaní často, vlastní init by byl zbytečná režie.
 */
// Selhání DB NESMÍ vracet prázdno uvnitř cache (uložilo by se) — chyba propadá
// ven z unstable_cache a fallback řeší až getFuse.
async function loadSearchDataUncached(): Promise<SearchItem[]> {
  const payload = await getDb()
  const items: SearchItem[] = []
  // Stránkujeme přes CELOU kolekci — s pevným limitem 200 by se do indexu
  // dostalo jen prvních 200 stránek a zbytek by nešel vyhledat.
  let page = 1
  for (;;) {
    const res = await payload.find({
      overrideAccess: false,
      collection: 'pages',
      limit: 200,
      page,
      depth: 0,
      select: { title: true, text: true, slug: true, fullSlug: true },
      // Bez joinů — jejich vyhodnocení stojí stovky ms za KAŽDÝ dokument
      // (viz komentář u MENU_SELECT v lib/payload.ts).
      joins: false,
    })
    for (const p of res.docs || []) {
      const doc = p as unknown as {
        title?: string
        text?: unknown
        slug?: string
        fullSlug?: string
      }
      items.push({
        title: doc.title ?? '',
        text: richTextToPlainText(doc.text).slice(0, 2000),
        slug: doc.slug ?? '',
        fullSlug: doc.fullSlug ?? '',
      } satisfies SearchItem)
    }
    if (!res.hasNextPage) break
    page++
  }
  return items
}

const loadSearchData = isProduction()
  ? unstable_cache(loadSearchDataUncached, ['search-data'], {
      tags: ['pages', 'search-index'],
      revalidate: 3600,
    })
  : loadSearchDataUncached

export async function getFuse(): Promise<Fuse<SearchItem>> {
  let data: SearchItem[] = []
  try {
    data = await loadSearchData()
  } catch {
    // DB nedostupná — prázdné vyhledávání, nic se necachuje
  }
  return new Fuse<SearchItem>(data, { keys: ['title', 'text'] })
}
