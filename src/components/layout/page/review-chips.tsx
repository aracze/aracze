import { googleMapsSearchUrl, tripadvisorSearchUrl } from '@/lib/tour-reviews'

/**
 * Odkazy na recenze hotelu jako tiché chipy s logem (maketa E5, rozhodnutí
 * uživatele 23. 10. 2026): v klidu šedé, barvu loga dostanou až při najetí,
 * aby nesoutěžily s cenou. Tripadvisor vždy (hledání podle názvu), Invia jen
 * u spárovaného hotelu, Google (Mapy, hledání podle názvu) vždy. Chipy
 * stojí nad roztaženým odkazem karty (z-10).
 * Loga: public/assets/partners (Tripadvisor = ikona ze Simple Icons v brand
 * zelené, Invia = oficiální wordmark).
 */
export function ReviewChips({
  title,
  area,
  inviaUrl,
  label = true,
  className,
}: {
  title: string
  area: string | null
  inviaUrl: string | null
  /** Návěští „Recenze hotelu:“ před chipy (v mapě se kvůli šířce vynechává). */
  label?: boolean
  className?: string
}) {
  const chip =
    'group/chip relative z-10 inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-white px-2.5 text-ink-3 hover:border-line-strong hover:text-ink hover:no-underline'
  const logo =
    'w-auto opacity-70 grayscale transition group-hover/chip:opacity-100 group-hover/chip:grayscale-0'
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-label text-ink-3 ${className ?? ''}`}>
      {label && <span className="mr-0.5">Recenze hotelu:</span>}
      <a
        href={tripadvisorSearchUrl(title, area)}
        target="_blank"
        rel="nofollow noopener"
        className={chip}
        aria-label={`${title}: recenze na Tripadvisoru`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/partners/tripadvisor.svg" alt="" className={`h-3.5 ${logo}`} />
        <span className="font-heading text-meta font-bold">Tripadvisor</span>
      </a>
      <a
        href={googleMapsSearchUrl(title, area)}
        target="_blank"
        rel="nofollow noopener"
        className={chip}
        aria-label={`${title}: hodnocení na Mapách Google`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/partners/google-maps.svg" alt="" className={`h-3.5 ${logo}`} />
        <span className="font-heading text-meta font-bold">Google</span>
      </a>
      {inviaUrl && (
        <a
          href={inviaUrl}
          target="_blank"
          rel="nofollow noopener"
          className={chip}
          aria-label={`${title}: recenze na Invii`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/partners/invia.svg" alt="Invia" className={`h-2.5 ${logo}`} />
        </a>
      )}
    </div>
  )
}
