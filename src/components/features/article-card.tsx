import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Article } from "@/types/payload";
import { cn, getArticleExcerpt, getArticleImageUrl } from "@/lib/utils";
import { isCloudinary } from "@/lib/cloudinary-loader";

/** Single article card used in listings (recommended articles, rubric pages). */
export function ArticleCard({
  article,
  href,
  className,
}: {
  article: Article;
  href: string;
  className?: string;
}) {
  const articleText = getArticleExcerpt(article);
  const imageUrl = getArticleImageUrl(article);

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col bg-white rounded-3xl overflow-hidden border border-gray-100/50 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] transition-all duration-500 transform hover:-translate-y-2",
        className,
      )}
    >
      <div className="relative h-48 w-full overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={article.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            unoptimized={!isCloudinary(imageUrl)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1a3f6c]/5 to-[#1a3f6c]/10 flex items-center justify-center">
            <span className="text-[#1a3f6c]/20 font-bold uppercase tracking-[0.2em] text-[10px]">
              Bez náhledu
            </span>
          </div>
        )}
        {/* Type icon badge — mirrors the location-pin badge on "Místa" cards for a
            consistent card motif (the "Články a cestopisy" heading already gives context,
            so a repeated "Článek" text label would be redundant). */}
        <div className="absolute top-4 left-4 w-7 h-7 bg-white/80 rounded-full flex items-center justify-center shadow-sm">
          <svg
            className="w-4 h-4 text-[#1a3f6c]"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
          </svg>
        </div>
      </div>

      <div className="p-6 flex flex-col flex-1 relative">
        <h3 className="text-xl font-bold text-[#1a3f6c] mb-2 group-hover:text-[#215491] transition-colors leading-[1.25]">
          {article.title}
        </h3>
        <div className="text-gray-500 line-clamp-3 text-sm leading-relaxed mb-5 font-light">
          {articleText}
        </div>
        <div className="mt-auto flex items-center text-[#215491] font-bold text-[12px] tracking-[0.1em] uppercase group/read font-heading">
          <span>Číst více</span>
          <div className="ml-3 w-8 h-[1px] bg-[#215491]/30 transition-all duration-300 group-hover/read:w-12 group-hover/read:bg-[#215491]"></div>
        </div>
      </div>
    </Link>
  );
}
