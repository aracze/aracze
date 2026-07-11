"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Article } from "@/types/payload";
import {
  cn,
  getArticleExcerpt,
  getArticleHref,
  getArticleImageUrl,
  getArticleKey,
} from "@/lib/utils";
import { isCloudinary } from "@/lib/cloudinary-loader";
import { ArticleAd, AdSenseScript } from "./article-ad";

// Klasický (vertikální) layout článků — podobný původnímu webu: články pod sebou
// (titulek + perex vlevo, náhled vpravo), vedle nich reklamní sloupec.
// Moderní prvky (zoom náhledu, zakulacení) zachovány. Existuje vedle mřížkové
// varianty `ArticlesList` pro porovnání.
const ARTICLES_STEP = 3;

interface ArticlesProps {
  articles: Article[];
  parentFullSlug?: string;
  /** Lokativ destinace z `page.detail.locative` (např. „v Chorvatsku", „na Slovensku"). */
  destinationLocative?: string | null;
}

export const ArticlesListClassic = ({
  articles: articlesProp,
  parentFullSlug,
  destinationLocative,
}: ArticlesProps) => {
  const [visibleCount, setVisibleCount] = useState(ARTICLES_STEP);

  const articles = Array.isArray(articlesProp)
    ? articlesProp
    : articlesProp
      ? [articlesProp]
      : [];

  if (articles.length === 0) return null;

  const hasMore = visibleCount < articles.length;

  const place = destinationLocative?.replace(/^(ve?|na)\s+/i, "").trim();
  const subtitle = place
    ? `Zážitky, tipy a inspirace z cestování po ${place}.`
    : "Zážitky, tipy a inspirace z cestování.";

  return (
    <section id="clanky" className="w-full py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 md:px-12">
        <div className="flex flex-col mb-12 items-center text-center">
          <h2 className="text-3xl font-bold text-[#1a3f6c] mb-3 font-heading tracking-tight">
            Články a cestopisy
          </h2>
          <div className="w-[30px] h-[1px] bg-[#215491] rounded-full mb-5"></div>
          <p className="text-[17px] text-gray-400 max-w-xl leading-relaxed">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          {/* Article list — one below another. Renderujeme VŠECHNY (SEO — odkazy v HTML),
              přebytek schováme přes `hidden` (obrázky se načtou až po „zobrazit další"). */}
          <div className="flex-1 flex flex-col gap-8">
            {articles.map((article, index) => {
              const href = getArticleHref(article, parentFullSlug);
              const excerpt = getArticleExcerpt(article);
              const imageUrl = getArticleImageUrl(article);

              return (
                <Link
                  key={getArticleKey(article, index)}
                  href={href}
                  className={cn(
                    "group flex flex-col sm:flex-row gap-6 items-stretch bg-white rounded-3xl border border-gray-100/50 p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] transition-all duration-500 transform hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)]",
                    index >= visibleCount && "hidden",
                  )}
                >
                  <div className="flex-1 order-2 sm:order-1 flex flex-col justify-center">
                    <h3 className="text-2xl font-bold text-[#1a3f6c] mb-3 leading-[1.2] transition-colors group-hover:text-[#215491]">
                      {article.title}
                    </h3>
                    <p className="text-gray-500 line-clamp-3 text-[15px] leading-relaxed font-light">
                      {excerpt}
                    </p>
                    <div className="mt-[20px] flex items-center text-[#215491] font-bold text-[12px] tracking-[0.1em] uppercase group/read font-heading">
                      <span>Číst více</span>
                      <div className="ml-3 w-8 h-[1px] bg-[#215491]/30 transition-all duration-300 group-hover/read:w-12 group-hover/read:bg-[#215491]"></div>
                    </div>
                  </div>
                  <div className="order-1 sm:order-2 relative w-full sm:w-[280px] h-[180px] shrink-0 overflow-hidden rounded-2xl">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={article.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, 280px"
                        unoptimized={!isCloudinary(imageUrl)}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#1a3f6c]/5 to-[#1a3f6c]/10 flex items-center justify-center">
                        <span className="text-[#1a3f6c]/20 font-bold uppercase tracking-[0.2em] text-[10px]">
                          Bez náhledu
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Ad column — like the legacy layout */}
          <aside className="hidden lg:block w-[300px] shrink-0">
            <AdSenseScript />
            <ArticleAd variant="primary" className="sticky top-24" />
          </aside>
        </div>

        {hasMore && (
          <div className="mt-12 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + ARTICLES_STEP)}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#215491]/30 px-7 py-3 text-sm font-bold uppercase tracking-wider text-[#215491] font-heading transition-all hover:border-[#215491] hover:bg-[#215491] hover:text-white"
            >
              Zobrazit další články
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
