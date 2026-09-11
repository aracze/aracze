import Link from 'next/link'

/**
 * Řádek pilulek „Kam dál" — úvodní stránka + oblíbené destinace. Sdílí ho
 * 404 a prázdný výsledek hledání, aby slepé uličky webu nabízely stejné
 * východisko a vypadaly jako jedna rodina.
 */

/** `mobile: false` = pod 640 px se skryje, aby řada držela na jednom řádku. */
const POPULAR_DESTINATIONS = [
  { title: 'Chorvatsko', href: '/chorvatsko', mobile: true },
  { title: 'Itálie', href: '/italie', mobile: false },
  { title: 'Řecko', href: '/recko', mobile: false },
  { title: 'USA', href: '/usa', mobile: false },
]

export function KamDal() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-[13px] font-medium text-ink-3">Kam dál:</span>
      <Link
        href="/"
        className="rounded-full border border-brand bg-brand-tint px-4 py-1 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        Úvodní stránka
      </Link>
      {POPULAR_DESTINATIONS.map((destination) => (
        <Link
          key={destination.href}
          href={destination.href}
          className={`rounded-full border border-line-strong bg-surface px-4 py-1 text-[13px] font-semibold text-brand transition-colors hover:border-brand/40 hover:bg-brand-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
            destination.mobile ? '' : 'hidden sm:inline-block'
          }`}
        >
          {destination.title}
        </Link>
      ))}
    </div>
  )
}
