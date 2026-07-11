"use client";

import { MessageCircle, Facebook } from "lucide-react";

/**
 * Comment count + "Vložit komentář" + "Sdílet" action row at the end of an article.
 * Mirrors the legacy `.article-action` bar. Comments are not wired up yet — the
 * comment items are static placeholders (no navigation); sharing opens the FB dialog.
 */
export function ArticleActions({
  commentCount = 0,
}: {
  commentCount?: number;
}) {
  const share = () => {
    const url = encodeURIComponent(window.location.href);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      "_blank",
      "noopener,noreferrer,width=626,height=436",
    );
  };

  return (
    <div className="mt-6 flex items-center justify-between border-y border-[#2c3643] py-2.5">
      {/* Comments (static placeholders until wired up — no navigation) */}
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 opacity-60">
          <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-black">{commentCount}</span>
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-black/70 opacity-80">
          Vložit komentář
        </span>
      </div>

      {/* Share */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[#99a9b3]">
          Sdílet
        </span>
        <button
          type="button"
          onClick={share}
          aria-label="Sdílet na Facebooku"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#3a589b] text-white transition-opacity hover:opacity-90"
        >
          <Facebook className="h-4 w-4 fill-white" />
        </button>
      </div>
    </div>
  );
}
