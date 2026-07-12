import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import { Article as ArticleType } from '@/types/payload'
import { getPayloadURL, richTextToHtml } from '@/lib/utils'
import { isCloudinary } from '@/lib/cloudinary-loader'
import Link from 'next/link'
import Image from 'next/image'
import { fetchPageByFullSlug } from '@/lib/payload'
import { Subnavigation } from '@/components/layout/page/subnavigation'
import { HeroSection } from '@/components/layout/page/hero-section'
import { ArticleAd, AdSenseScript } from '@/components/features/article-ad'
import { ArticleActions } from '@/components/features/article-actions'

interface ArticleProps {
  article: ArticleType
  contextSlug?: string
}

export const Article: React.FC<ArticleProps> = async ({ article, contextSlug }) => {
  const articleText = richTextToHtml(article.text)

  // Resolve the context page (the page the user came from based on URL)
  const contextPageSlug = contextSlug || article.mainPage?.fullSlug?.replace(/^\//, '') || null
  const { contextPage, rootPage } = await resolveContextPages(contextPageSlug)

  const heroImageUrl = resolveHeroImage(contextPage || rootPage, article)

  // Author (safe public subset from the backend virtual field)
  const author = article.createdByPublic ?? null
  const authorName = author
    ? [author.firstName, author.lastName].filter(Boolean).join(' ') || author.username || null
    : null
  const profileHref = author?.username ? `/profil/${author.username}` : null
  const DEFAULT_AVATAR = '/assets/avatar-white.jpg'
  const rawAvatar = author?.avatar?.url
  // `getPayloadURL()` vždy vrátí platnou absolutní URL (fallback localhost), takže
  // `new URL()` neselže kvůli chybějícímu env. try/catch je pojistka proti nevalidní cestě.
  let avatarUrl = DEFAULT_AVATAR
  if (rawAvatar) {
    if (rawAvatar.startsWith('/')) {
      try {
        avatarUrl = new URL(rawAvatar, getPayloadURL()).toString()
      } catch {
        avatarUrl = DEFAULT_AVATAR
      }
    } else {
      avatarUrl = rawAvatar
    }
  }
  const authorBio = author?.description || null

  // Sdílený avatar — stejné markup pro variantu s odkazem i bez, ať se needuplikuje.
  const authorAvatar = (
    <Image
      src={avatarUrl}
      alt={authorName ?? ''}
      width={45}
      height={45}
      className="h-[45px] w-[45px] shrink-0 rounded-full border-[3px] border-white object-cover shadow-[0_3px_5px_rgba(0,0,0,0.3)]"
      unoptimized={!isCloudinary(avatarUrl)}
    />
  )

  return (
    <div className="bg-white min-h-screen">
      {/* Article Header / Hero */}
      <HeroSection
        title={article.title}
        imageUrl={heroImageUrl}
        styleCss={article.featuredImage?.featureImageStyleCss || undefined}
        filterId={`blurFilter-article-${article.documentId}`}
      />

      {/* Subnavigation - keeps user in context of parent destination */}
      {rootPage && (
        <Subnavigation
          contextTitle={rootPage.title}
          contextFullSlug={rootPage.fullSlug}
          pageChildren={rootPage.children?.docs ?? []}
          rootChildren={rootPage.children?.docs ?? []}
          currentPageFullSlug={contextPage?.fullSlug ?? ''}
          currentPageCategory={contextPage?.category}
          isSubPlace={false}
          hasPlaces={(rootPage.children?.docs?.length ?? 0) > 0}
          hasArticles={(rootPage.articles?.length ?? 0) > 0}
          activeSection="clanky"
        />
      )}

      {/* Article Content + side advertisement (two-column on desktop) */}
      <div className="max-w-7xl mx-auto px-4 py-16 md:py-8 flex flex-col items-stretch lg:flex-row lg:justify-center gap-8 lg:gap-10">
        <main className="flex-1 min-w-0 lg:max-w-[808px]">
          <div className="article-prose prose max-w-[808px] prose-a:text-[#215491] prose-a:no-underline hover:prose-a:underline">
            <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSlug]}>{articleText}</ReactMarkdown>
          </div>

          {/* Attribution (Zdroj: ...) — right-aligned italic, like the legacy `p.attribution` */}
          {article.attribution && (
            <div className="mt-12 text-right text-sm italic text-gray-600 [&_a]:font-medium [&_a]:text-[#215491] [&_a]:no-underline hover:[&_a]:underline">
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                {richTextToHtml(article.attribution)}
              </ReactMarkdown>
            </div>
          )}

          {/* Author */}
          {authorName && (
            <div className="mt-8 flex items-start gap-4 border-t border-[#dadbdc] pt-5 pb-2.5">
              {profileHref ? (
                <Link href={profileHref} className="shrink-0">
                  {authorAvatar}
                </Link>
              ) : (
                authorAvatar
              )}
              <div className="min-w-0">
                {profileHref ? (
                  <Link href={profileHref} className="font-semibold text-[#215491] hover:underline">
                    {authorName}
                  </Link>
                ) : (
                  <span className="font-semibold text-[#215491]">{authorName}</span>
                )}
                {authorBio && <p className="mt-1 leading-relaxed text-gray-600">{authorBio}</p>}
              </div>
            </div>
          )}

          {/* Comment count + "Vložit komentář" + "Sdílet" (comments not wired up yet) */}
          <ArticleActions commentCount={0} />
        </main>

        {/* Side advertisements — desktop only, matches legacy `.sideAds`.
            The column stretches to the article height and is split into two halves;
            each ad is `sticky`, so the first pins in the upper half and the second
            takes over in the lower half (legacy `sideAds--first` / `sideAds--second`). */}
        <aside className="hidden lg:flex flex-col w-[340px] shrink-0">
          {/* AdSense loader — rendered once, shared by both ad boxes below. */}
          <AdSenseScript />
          <div className="flex-1">
            <ArticleAd variant="primary" className="sticky top-5" />
          </div>
          <div className="flex-1">
            <ArticleAd variant="secondary" className="sticky top-5 mt-10" />
          </div>
        </aside>
      </div>
    </div>
  )
}

async function resolveContextPages(contextPageSlug: string | null) {
  if (!contextPageSlug) return { contextPage: null, rootPage: null }

  // Root = první segment slugu. Když je stejný jako celý slug, kontext JE kořen
  // → stačí jeden dotaz.
  const rootSlug = contextPageSlug.split('/')[0]
  if (rootSlug === contextPageSlug) {
    const { data } = await fetchPageByFullSlug(contextPageSlug)
    const contextPage = data?.pages[0] ?? null
    return { contextPage, rootPage: contextPage }
  }

  // Nezávislé dotazy běží paralelně (fetchPageByFullSlug je navíc dedup přes cache).
  const [ctxRes, rootRes] = await Promise.all([
    fetchPageByFullSlug(contextPageSlug),
    fetchPageByFullSlug(rootSlug),
  ])

  const contextPage = ctxRes.data?.pages[0] ?? null
  if (!contextPage) return { contextPage: null, rootPage: null }

  const rootPage = rootRes.data?.pages[0] ?? contextPage
  return { contextPage, rootPage }
}

function resolveHeroImage(
  page: {
    featuredImage?: {
      image?: { url?: string } | null
      featureImageStyleCss?: string | null
    } | null
  } | null,
  article: ArticleType,
) {
  // Prefer article's own featured image (a populated media object), fall back to context page.
  const articleImage = article.featuredImage?.image
  const url =
    (articleImage && typeof articleImage === 'object' ? articleImage.url : null) ??
    page?.featuredImage?.image?.url
  if (!url) return null

  return url.startsWith('/') ? `${getPayloadURL()}${url}` : url
}
