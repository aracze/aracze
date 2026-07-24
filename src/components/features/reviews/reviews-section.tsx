import React from 'react'
import { ReviewPublic } from '@/types/payload'
import { getTurnstileSiteKey } from '@/lib/comment-spam'
import { UserAvatar } from '@/components/user-avatar'
import { AdSenseScript, ArticleAd } from '@/components/features/article-ad'
import { ReviewItem } from './review-item'
import { ReviewRatingBox } from './review-rating-box'
import { WriteReviewButton } from './write-review-button'

/**
 * Sekce recenzí turistického cíle — parita s legacy webem:
 *  1. lišta „Byl jsi zde? Ohodnoť to!" s hvězdičkovým vstupem a sbaleným
 *     formulářem (přes celou šířku obsahu),
 *  2. výpis recenzí (nejnovější nahoře) + závěrečný řádek „Tvé jméno /
 *     Doporučuji navštívit …" s tlačítkem,
 *  3. reklamní sloupec vpravo (300×250 při méně než 2 recenzích, jinak 300×600
 *     — stejná logika i sloty jako legacy).
 *
 * Zarovnání: stejné centrování jako komentáře u článku (max-w-[1188px] = obsah
 * 808 + mezera 40 + reklama 340); lg:pl-16 posadí levý okraj na text stránky.
 */
export function ReviewsSection({
  pageId,
  pageTitle,
  reviews,
}: {
  pageId: number
  pageTitle: string
  reviews: ReviewPublic[]
}) {
  const siteKey = getTurnstileSiteKey()

  return (
    <section id="recenze" className="mx-auto w-full max-w-7xl scroll-mt-24 px-4 pb-12 md:pb-20">
      <div className="lg:mx-auto lg:max-w-[1188px] lg:pl-16">
        <ReviewRatingBox pageId={pageId} turnstileSiteKey={siteKey} />

        <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
          <div className="min-w-0 flex-1">
            <div className="mt-10 border-t border-[#d7d7d7]">
              {reviews.map((review) => (
                <ReviewItem key={review.id} review={review} itemReviewed={pageTitle} />
              ))}

              {/* Výzva k vlastní recenzi (legacy „proposal" řádek) */}
              <div className="flex flex-wrap items-center gap-4 border-b border-[#d7d7d7] py-4">
                <div className="shrink-0">
                  <UserAvatar name="Tvé jméno" avatarUrl={null} size={45} />
                </div>
                <div className="min-w-0">
                  <div className="pb-1 pt-2 text-[17px] tracking-[1px] text-[#565656]">
                    Tvé jméno
                  </div>
                  <div className="text-[#2c3643]">Doporučuji navštívit …</div>
                </div>
                <div className="ml-auto">
                  <WriteReviewButton />
                </div>
              </div>
            </div>
          </div>

          <aside className="hidden w-[340px] shrink-0 lg:block">
            <AdSenseScript />
            <ArticleAd
              variant={reviews.length < 2 ? 'box' : 'primary'}
              className="mt-10 lg:sticky lg:top-5"
            />
          </aside>
        </div>
      </div>
    </section>
  )
}
