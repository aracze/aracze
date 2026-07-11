"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { isCloudinary } from "@/lib/cloudinary-loader";

interface ExpandableTouristPointProps {
  id: string | number;
  title: string;
  fullSlug: string;
  imageUrl: string | null;
  previewText: string;
  fullHtml: string;
  hasMoreContent: boolean;
}

export function ExpandableTouristPoint({
  id,
  title,
  fullSlug,
  imageUrl,
  previewText,
  fullHtml,
  hasMoreContent,
}: ExpandableTouristPointProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article data-poiid={id} className="poi-article group">
      {/* Title */}
      <div className="px-2 sm:px-6">
        <Link href={fullSlug} className="block">
          <h2 className="text-[22px] sm:text-[26px] font-bold text-[#1a3f6c] leading-snug mb-4 hover:text-[#2a5a9c] transition-colors">
            {title}
          </h2>
        </Link>
      </div>

      {/* Image */}
      {imageUrl && (
        <Link href={fullSlug} className="block mb-5">
          <div className="relative w-full h-[320px] rounded-xl overflow-hidden shadow-sm">
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-cover transition-transform duration-700 hover:scale-[1.03]"
              sizes="(max-width: 1024px) 100vw, 56vw"
              unoptimized={!isCloudinary(imageUrl)}
            />
          </div>
        </Link>
      )}

      {/* Text — preview or full */}
      <div className="px-2 sm:px-6">
        {expanded ? (
          <div
            className="text-[16px] text-[#4a4a4a] leading-[1.85] tracking-[0.01rem] mb-4 [&_p]:mb-4 [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: fullHtml }}
          />
        ) : (
          <p className="text-[16px] text-[#4a4a4a] leading-[1.85] tracking-[0.01rem] mb-4">
            {previewText}
          </p>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-4 flex-wrap">
          {hasMoreContent && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1a3f6c] hover:text-[#d45145] transition-colors"
            >
              {expanded ? "Zobrazit méně" : "Zobrazit více"}
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}

          <Link
            href={fullSlug}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#888] hover:text-[#1a3f6c] transition-colors"
          >
            Otevřít stránku
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  );
}
