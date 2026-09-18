/**
 * Jedno místo, kde se pro stránku (Page) rozhodne SEO titulek, popisek a fotka
 * pro sdílení. Používá ho `generateMetadata` (`<title>`, meta description,
 * og:image) i komponenta Page (popis a fotka ve strukturovaných datech) —
 * bez sdílení by meta description a JSON-LD `description` mohly říkat každý
 * něco jiného (Google chce, aby se shodovaly).
 *
 * React `cache()` klíčuje přes identitu objektu `page`; metadata i render
 * dostávají tentýž objekt z `resolveSlugRoute`, takže se počítá jednou.
 */
import { cache } from 'react'
import { fetchAncestorChain } from '@/lib/page-ancestors'
import { buildPageTitle, rootPageCategories } from '@/lib/page-title'
import {
  resolveSeoDescription,
  resolveSeoTitle,
  shareImageFromMedia,
  type ShareImage,
} from '@/lib/seo'
import { leadSentence, seoDescriptionTemplate, seoTitleTemplate } from '@/lib/seo-templates'
import { richTextToPlainText } from '@/lib/utils'
import { PageCategory, type Page } from '@/types/payload'

export type PageSeo = {
  /** Titulek bez přípony webu (tu přidá layout šablona). */
  title: string
  description: string | undefined
  /** Hero fotka podle stejného pravidla jako viditelné hero (viz níže). */
  imageUrl: string | null
  /** Tatáž fotka s popiskem (alt z CMS) a rozměry pro Open Graph. */
  image: ShareImage | null
  /** Místo, ke kterému stránka patří (samo místo, nebo nejbližší nadřazené). */
  place: Page
  /** Kořen z URL (země, rubrika…), nebo stránka sama. */
  rootPage: Page
}

export const resolvePageSeo = cache(async (page: Page): Promise<PageSeo> => {
  // Řetězec předků z URL (React-cache sdílená s renderem): první je kořen
  // (země/rubrika), poslední místo v něm je kontext pro skloňování v šablonách
  // (u cíle město, u „Počasí" země). Kontinent v URL není (includeInChildUrlPaths
  // false), takže země vychází jako „Stát", město pod zemí jako „Město".
  const ancestors = await fetchAncestorChain(page.fullSlug)
  const realAncestors = ancestors.filter((a): a is Page => !('isPlaceholder' in a))
  const rootPage = realAncestors[0] ?? page
  const nearestPlace = [...realAncestors]
    .reverse()
    .find((a) => a.category === PageCategory.Misto_k_navstiveni)
  const isPlace = page.category === PageCategory.Misto_k_navstiveni
  const place = isPlace ? page : (nearestPlace ?? rootPage)

  // SEO pole z CMS → šablona podle kategorie (znění starého webu) → kontextový
  // titulek, resp. začátek textu. Začátek textu jen bez CMS popisku — jinak je
  // to zbytečný průchod celým rich textem.
  const title = resolveSeoTitle(
    page.meta,
    seoTitleTemplate(page, place) ?? buildPageTitle(page, rootPage),
  )
  const lead = page.meta?.description?.trim() ? '' : leadSentence(richTextToPlainText(page.text))
  const description = resolveSeoDescription(
    page.meta,
    page.text,
    seoDescriptionTemplate(page, place, lead, { placeHasParentPlace: isPlace && !!nearestPlace }),
  )

  // Fotka podle stejného pravidla jako getHeroImage v komponentě Page: kořenové
  // kategorie (místo, cíl, rubrika, statická) jen vlastní fotku (bez ní hero
  // fotku nemá, tak ani náhled), podstránky dědí fotku nejbližšího místa, jinak
  // kořene. Popisek i rozměry musí být ze STEJNÉ fotky jako adresa — zděděná
  // fotka fjordu nesmí dostat popisek podstránky.
  const image = rootPageCategories.includes(page.category)
    ? shareImageFromMedia(page.featuredImage?.image)
    : (shareImageFromMedia(place.featuredImage?.image) ??
      shareImageFromMedia(rootPage.featuredImage?.image))

  return { title, description, imageUrl: image?.url ?? null, image, place, rootPage }
})
