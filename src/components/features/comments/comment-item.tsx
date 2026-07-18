import React from 'react'
import Link from 'next/link'
import { CommentPublic } from '@/types/payload'
import { formatCommentDate } from '@/lib/relative-time'
import { UserAvatar } from '@/components/user-avatar'
import { ReplyButton } from './reply-button'

/**
 * Jeden komentář (varianta „vzdušné karty", ztlumená).
 *  - Symetrická mezera: levý okraj k textu (padding + avatar + rozestup) = pravý
 *    padding (md:pr-[88px]), takže je text vycentrovaný. Na mobilu se pravá
 *    mezera zmenší.
 *  - `isReply` = odpověď ve vlákně: bílé pozadí + odsazení + spojovací linka.
 *  - Registrovaný autor má odkaz na profil; autor článku štítek „autor".
 */
export function CommentItem({
  comment,
  isReply = false,
}: {
  comment: CommentPublic
  isReply?: boolean
}) {
  const { relative, absolute } = formatCommentDate(comment.commentedAt)
  const profileHref = comment.authorUsername ? `/profil/${comment.authorUsername}` : null

  const avatar = <UserAvatar name={comment.authorName} avatarUrl={comment.avatarUrl} size={42} />

  const cardClasses = isReply
    ? 'relative bg-white border border-[#e6eaee]'
    : 'bg-[#f5f7f9] border border-[#e6eaee]'

  return (
    <article
      className={`flex gap-[18px] rounded-2xl py-5 pl-[26px] pr-[26px] md:pr-[88px] ${cardClasses}`}
    >
      {/* Spojovací linka vlákna (jen u odpovědi) */}
      {isReply && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-[26px] -top-4 h-[42px] w-[22px] rounded-bl-[14px] border-b-2 border-l-2 border-[#cfd8e0]"
        />
      )}

      {profileHref ? (
        <Link href={profileHref} className="shrink-0" aria-label={`Profil ${comment.authorName}`}>
          {avatar}
        </Link>
      ) : (
        avatar
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {profileHref ? (
            <Link href={profileHref} className="font-bold text-[#215491] hover:underline">
              {comment.authorName}
            </Link>
          ) : (
            <span className="font-bold text-[#215491]">{comment.authorName}</span>
          )}
          {comment.isAuthor && (
            <span className="rounded-full bg-[#e9f1f9] px-2 py-px text-[11px] font-bold uppercase tracking-wide text-[#215491]">
              autor
            </span>
          )}
          {relative && (
            <time
              dateTime={comment.commentedAt ?? undefined}
              title={absolute}
              className="text-[13.5px] text-gray-500"
            >
              · {relative}
            </time>
          )}
        </div>

        {/* Text komentáře je čistý plaintext (žádné HTML) — zalomení řádků zachováme. */}
        <p className="mt-2 whitespace-pre-line break-words leading-relaxed text-[#2c3643]">
          {comment.body}
        </p>

        <ReplyButton commentId={comment.id} authorName={comment.authorName} />
      </div>
    </article>
  )
}
