'use client'

import { MessageCircle } from 'lucide-react'

/**
 * Facebook brand icon drawn locally — lucide-react 1.x removed brand icons.
 * The path is taken from the original lucide `Facebook` icon so the button
 * renders identically.
 */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

/**
 * Comment count + "Vložit komentář" + "Sdílet" action row at the end of an article.
 * Mirrors the legacy `.article-action` bar. The count links down to the comments
 * section; "Vložit komentář" jumps to the comment form; sharing opens the FB dialog.
 */
export function ArticleActions({ commentCount = 0 }: { commentCount?: number }) {
  const share = () => {
    const url = encodeURIComponent(window.location.href)
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      '_blank',
      'noopener,noreferrer,width=626,height=436',
    )
  }

  return (
    <div className="mt-6 flex items-center justify-between border-y border-[#2c3643] py-2.5">
      {/* Comments — scroll to the comments section / form */}
      <div className="flex items-center gap-3">
        <a
          href="#komentare"
          className="flex items-center gap-2 text-black transition-opacity hover:opacity-70"
          aria-label={`Přejít na komentáře (${commentCount})`}
        >
          <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
          <span>{commentCount}</span>
        </a>
        <a
          href="#napsat-komentar"
          className="text-xs font-bold uppercase tracking-wide text-black/70 transition-opacity hover:opacity-100 hover:text-[#215491]"
        >
          Vložit komentář
        </a>
      </div>

      {/* Share */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[#99a9b3]">Sdílet</span>
        <button
          type="button"
          onClick={share}
          aria-label="Sdílet na Facebooku"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#3a589b] text-white transition-opacity hover:opacity-90"
        >
          <FacebookIcon className="h-4 w-4 fill-white" />
        </button>
      </div>
    </div>
  )
}
