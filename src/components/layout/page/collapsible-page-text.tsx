"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import Link from "next/link";
import { cn } from "@/lib/utils";

const DEFAULT_AVATAR = "/assets/avatar-white.jpg";

function getPreviewHtml(html: string): {
  previewHtml: string;
  shouldCollapse: boolean;
} {
  const matches = [...html.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)];
  if (matches.length <= 2) {
    return { previewHtml: html, shouldCollapse: false };
  }

  const secondParagraph = matches[1];
  const secondParagraphEnd =
    (secondParagraph.index ?? 0) + secondParagraph[0].length;

  return {
    previewHtml: html.slice(0, secondParagraphEnd),
    shouldCollapse: true,
  };
}

type Contributor = {
  name?: string | null;
  profileHref?: string | null;
  avatarUrl?: string | null;
};

export function CollapsiblePageTextWithContributor({
  textHtml,
  contributor,
  collapsible = true,
}: {
  textHtml: string;
  contributor?: Contributor | null;
  /** Sbalování textu + „zobrazit více" — jen na stránkách „Místo k navštívení". */
  collapsible?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(
    contributor?.avatarUrl || DEFAULT_AVATAR,
  );
  const { shouldCollapse: canCollapse } = useMemo(
    () => getPreviewHtml(textHtml),
    [textHtml],
  );
  const shouldCollapse = collapsible && canCollapse;

  return (
    <div className="relative">
      <div
        className={cn(
          "relative prose max-w-none prose-a:text-[#215491] prose-a:no-underline hover:prose-a:underline",
          !isExpanded && shouldCollapse && "max-h-[250px] overflow-hidden",
        )}
      >
        <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeSlug]}>
          {textHtml}
        </ReactMarkdown>
        {/* Text mizí do bílé — naznačuje, že pokračuje dál. */}
        {shouldCollapse && !isExpanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[50px] bg-gradient-to-b from-transparent to-white" />
        )}
      </div>

      {shouldCollapse && !isExpanded && (
        <div className="relative mt-[10px] w-full">
          {contributor?.name && (
            <div className="float-left">
              <div className="flex items-start">
                <div className="mr-[15px] block h-[40px] w-[40px] shrink-0 overflow-hidden rounded-full border-[3px] border-white bg-white shadow-[0_3px_9px_rgba(0,0,0,0.22)]">
                  {contributor.profileHref ? (
                    <Link href={contributor.profileHref} className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarSrc}
                        alt={contributor.name}
                        width={34}
                        height={34}
                        className="h-[34px] w-[34px] rounded-full object-cover"
                        onError={() => setAvatarSrc(DEFAULT_AVATAR)}
                      />
                    </Link>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarSrc}
                      alt={contributor.name}
                      width={34}
                      height={34}
                      className="h-[34px] w-[34px] rounded-full object-cover"
                      onError={() => setAvatarSrc(DEFAULT_AVATAR)}
                    />
                  )}
                </div>
                <div className="inline-block pt-[3px]">
                  <div className="block text-[12px] leading-[20.4px] text-[#565656]">
                    {contributor.profileHref ? (
                      <Link
                        href={contributor.profileHref}
                        className="font-semibold text-[#565656] no-underline hover:underline"
                      >
                        {contributor.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{contributor.name}</span>
                    )}
                  </div>
                  <div className="block text-[12px] leading-[20.4px] text-[#898e95]">
                    Cestovní průvodce
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            aria-expanded={isExpanded}
            className="mx-auto block w-[130px] text-center text-[14px] font-bold leading-[19.5px] text-[#005580] hover:underline"
          >
            zobrazit více
            <svg
              aria-hidden="true"
              viewBox="0 0 10 6"
              className="ml-[6px] inline-block h-[10px] w-[10px] align-middle"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 1l4 4 4-4" />
            </svg>
          </button>

          <div className="clear-both" />
        </div>
      )}

      {(!shouldCollapse || isExpanded) && contributor?.name && (
        /* Matches legacy .contribution { margin-top: 30px } (default, non-placeToVisit) */
        <div className="mt-[30px]">
          <div className="flex items-center">
            <div className="mr-[15px] block h-[40px] w-[40px] shrink-0 overflow-hidden rounded-full border-[3px] border-white bg-white shadow-[0_3px_9px_rgba(0,0,0,0.22)]">
              {contributor.profileHref ? (
                <Link href={contributor.profileHref}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarSrc}
                    alt={contributor.name}
                    width={34}
                    height={34}
                    className="h-[34px] w-[34px] rounded-full object-cover"
                    onError={() => setAvatarSrc(DEFAULT_AVATAR)}
                  />
                </Link>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt={contributor.name}
                  width={34}
                  height={34}
                  className="h-[34px] w-[34px] rounded-full object-cover"
                  onError={() => setAvatarSrc(DEFAULT_AVATAR)}
                />
              )}
            </div>
            <div className="inline-block pt-[3px]">
              <div className="block text-[12px] leading-[20.4px] text-[#565656]">
                {contributor.profileHref ? (
                  <Link
                    href={contributor.profileHref}
                    className="font-semibold text-[#565656] no-underline hover:underline"
                  >
                    {contributor.name}
                  </Link>
                ) : (
                  <span className="font-semibold">{contributor.name}</span>
                )}
              </div>
              <div className="block text-[12px] leading-[20.4px] text-[#898e95]">
                Cestovní průvodce
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
