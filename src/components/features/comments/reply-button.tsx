'use client'

import { CornerUpLeft } from 'lucide-react'

/**
 * „Odpovědět" — skočí na formulář, předvyplní „@jméno " a hlavně předá ID
 * komentáře, na který se odpovídá (skutečná vazba vlákna, na rozdíl od starého
 * webu). Provázání s formulářem je přes window CustomEvent (`ara:comment-reply`),
 * aby seznam komentářů mohl zůstat server komponentou.
 */
export function ReplyButton({ commentId, authorName }: { commentId: number; authorName: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent('ara:comment-reply', { detail: { commentId, authorName } }),
        )
      }}
      className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 transition-colors hover:text-[#215491]"
    >
      <CornerUpLeft className="h-3.5 w-3.5" strokeWidth={2} />
      Odpovědět
    </button>
  )
}
