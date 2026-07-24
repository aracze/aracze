import React from 'react'
import { Star } from 'lucide-react'

/**
 * Hodnocení 1–5 hvězdiček, jen pro čtení (výpis recenzí). Plné oranžové
 * hvězdičky + šedé „vypnuté" — jako legacy raty (star-on/star-off, 13 px).
 */
export function StarRating({
  rating,
  size = 13,
  className = '',
}: {
  rating: number
  size?: number
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-px ${className}`}
      role="img"
      aria-label={`Hodnocení ${rating} z 5 hvězdiček`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          style={{ width: size, height: size }}
          className={
            n <= rating ? 'fill-[#f5a623] text-[#f5a623]' : 'fill-[#d9dee3] text-[#d9dee3]'
          }
          strokeWidth={0}
        />
      ))}
    </span>
  )
}
