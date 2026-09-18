/**
 * Hero fotka článku — JEDNO pravidlo pro viditelné hero (komponenta Article)
 * i náhled pro sdílení (`generateMetadata`): vlastní fotka článku, jinak fotka
 * kontextové stránky (místo z URL / hlavní stránka). Popisek, rozměry i pozice
 * ohniska musí pocházet ze STEJNÉ fotky jako adresa — zděděná fotka stránky
 * nesmí dostat výřez ani popisek fotky článku.
 */
import type { Article, Page } from '@/types/payload'
import { absoluteMediaUrl } from '@/lib/utils'
import { shareImageFromMedia, type ShareImage } from '@/lib/seo'

export type ArticleHeroImage = {
  /** Absolutní adresa fotky, bez fotky `null`. */
  url: string | null
  /** Alt média z CMS; bez něj `null` (hero pak použije název článku). */
  alt: string | null
  /** Pozice ohniska (`featureImageStyleCss`) fotky, ze které je `url`. */
  styleCss: string | undefined
  /** Tatáž fotka pro Open Graph (`buildPageMetadata`). */
  share: ShareImage | null
}

type ContextPage = Pick<Page, 'featuredImage'> | null | undefined

export function resolveArticleHeroImage(page: ContextPage, article: Article): ArticleHeroImage {
  // Fotka článku je po enrichFeaturedImages populovaný objekt; číselné id
  // (nepopulováno) se bere jako „bez fotky".
  const own = article.featuredImage?.image
  const ownMedia = own && typeof own === 'object' ? own : null
  const share = shareImageFromMedia(ownMedia) ?? shareImageFromMedia(page?.featuredImage?.image)
  const fromArticle = !!ownMedia?.url

  return {
    url: absoluteMediaUrl(share?.url),
    alt: share?.alt?.trim() || null,
    styleCss: fromArticle
      ? article.featuredImage?.featureImageStyleCss || undefined
      : page?.featuredImage?.featureImageStyleCss || undefined,
    share,
  }
}
