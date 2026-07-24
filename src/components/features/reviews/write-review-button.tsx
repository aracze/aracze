'use client'

/**
 * Tlačítko „Napiš vlastní recenzi" v řádku pod výpisem recenzí. Přes window
 * event `ara:review-open` řekne liště nahoře (ReviewRatingBox), ať se na ni
 * naroluje a rozbalí formulář — stejný vzor jako `ara:comment-reply` u komentářů.
 */
export function WriteReviewButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('ara:review-open'))}
      className="whitespace-nowrap rounded-full bg-[#115094] px-8 py-3 text-[17px] font-semibold text-white transition-colors hover:bg-[#0d3f75]"
    >
      Napiš vlastní recenzi
    </button>
  )
}
