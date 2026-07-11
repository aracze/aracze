"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Article } from "@/types/payload";
import { getArticleHref, getArticleKey } from "@/lib/utils";
import { ArticleCard } from "./article-card";

// Kolik článků přibude na první zobrazení i po každém kliknutí na „Zobrazit další".
// Mřížka se používá pro rubriky → 8 = dvě plné řady čtyřsloupcové mřížky.
const ARTICLES_STEP = 8;

interface ArticlesProps {
  articles: Article[];
  parentFullSlug?: string;
}

export const ArticlesList = ({
  articles: articlesProp,
  parentFullSlug,
}: ArticlesProps) => {
  const [visibleCount, setVisibleCount] = useState(ARTICLES_STEP);

  // Ensure we have an array even if Payload returns a single object (due to relation type)
  const articles = Array.isArray(articlesProp)
    ? articlesProp
    : articlesProp
      ? [articlesProp]
      : [];

  if (articles.length === 0) return null;

  const hasMore = visibleCount < articles.length;

  // Nadpis/podtitulek zde nejsou — mřížka se používá na stránkách rubrik,
  // kde stránka sama je „Reportáže a cestopisy" apod., takže by byly redundantní.
  return (
    <section id="clanky" className="w-full py-16 bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Renderujeme VŠECHNY články (kvůli SEO — odkazy jsou v HTML), přebytek
              schováme přes `hidden` (display:none → jejich obrázky se ani nenačtou,
              dokud uživatel neklikne na „zobrazit další"). */}
          {articles.map((article, index) => {
            return (
              <ArticleCard
                key={getArticleKey(article, index)}
                article={article}
                href={getArticleHref(article, parentFullSlug)}
                className={index >= visibleCount ? "hidden" : undefined}
              />
            );
          })}
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
