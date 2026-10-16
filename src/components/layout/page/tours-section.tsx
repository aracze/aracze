import React from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { TourOffer } from '@/types/payload'
import { BOARD_LABELS } from '@/lib/sdovolena'
import { TOUR_SOURCES, tourSourceById } from '@/lib/tour-sources'
import {
  BOARD_OPTIONS,
  DEPARTURE_OPTIONS,
  NIGHTS_OPTIONS,
  SORT_OPTIONS,
  TOURS_PAGE_SIZE,
  buildResorts,
  buildTourCards,
  countByKind,
  discountPercent,
  sourcesPresent,
  tourFiltersHref,
  type TourFilters,
} from '@/lib/tour-filters'
import { nightCount, priceCzk } from './deals-section'
import { DealCardImage } from './deal-card-image'

/**
 * Podstránka „Zájezdy“ země (kategorie `Zájezdy`, maketa varianta A z 16. 10.
 * 2026): přepínač pobyt / poznávací, filtry v adrese, pás letovisek s cenou
 * „od“, řádkové karty hotelů (každý jednou, nejlevnější termín) a řádek
 * cestovek. Data: kolekce `tour-offers` (denní sync z feedů cestovek ve
 * formátu Sdovolená.cz) — viz src/lib/tour-filters.ts pro skládání karet.
 *
 * Vše jsou obyčejné odkazy (serverová komponenta): filtr = jiná adresa,
 * „Načíst další“ = vyšší `pocet`. Funguje bez JavaScriptu a každá kombinace
 * filtrů má adresu, kterou lze poslat dál. Rozbalovací filtry jsou
 * `<details>` — bez klientského skriptu, klávesnicí ovladatelné.
 *
 * Odkazy na zájezd vedou přes /go/zajezd/<id> (CJ click link cestovky
 * s deep-linkem z feedu), robots.txt /go/ vylučuje; `rel` nese sponsored.
 */

interface ToursSectionProps {
  offers: TourOffer[]
  filters: TourFilters
  /** Adresa stránky bez parametrů (základ pro odkazy filtrů). */
  basePath: string
  /** „do Egypta“ — druhý pád vč. předložky (pole genitive kontextového místa). */
  genitive: string
  placeTitle: string
}

/** „2026-11-22“ → „22. 11. 2026“. */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : iso
}

/** „z Ostravy“ / „z Prahy nebo Brna“ — hlavní odlet první (Praha), ostatní zkráceně. */
function departuresLabel(departures: string[]): string {
  const froms = departures
    .map((d) => DEPARTURE_OPTIONS.find((o) => o.name === d)?.from ?? `z ${d}`)
    .filter(Boolean)
  if (froms.length === 0) return ''
  if (froms.length === 1) return froms[0]
  return `${froms[0]} nebo ${froms
    .slice(1)
    .map((f) => f.replace(/^z /, ''))
    .join(', ')}`
}

function termCountLabel(count: number): string {
  if (count <= 0) return ''
  if (count === 1) return '1 termín'
  if (count <= 4) return `${count} termíny`
  return `${count} termínů`
}

function hotelCountLabel(count: number): string {
  if (count === 1) return '1 hotel'
  if (count <= 4) return `${count} hotely`
  return `${count} hotelů`
}

/** Hvězdy hotelu — maska `.star-glyph` jako u hodnocení (jen grafika, popis pro čtečky). */
function Stars({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-px align-[1px] text-star"
      aria-label={`${count} hvězd`}
      role="img"
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} aria-hidden="true" className="star-glyph h-3 w-3 bg-current" />
      ))}
    </span>
  )
}

/** Štítek cestovky na fotce. */
function SourceBadge({ source }: { source: string }) {
  const label = tourSourceById(source)?.label ?? source
  return (
    <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-1 text-caps-sm font-bold tracking-[0.09em] text-brand-deep uppercase">
      {label}
    </span>
  )
}

function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-meta font-bold text-white ${className ?? ''}`}
    >
      −{percent}&nbsp;%
    </span>
  )
}

/** Rozbalovací filtr: `<details>` s nabídkou odkazů; aktivní hodnota tučně. */
function FilterMenu({
  label,
  value,
  active,
  options,
}: {
  label: string
  value: string
  /** Je nastaveno něco jiného než výchozí hodnota → zvýraznit. */
  active: boolean
  options: { label: string; href: string; selected: boolean }[]
}) {
  return (
    <details className="group relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-label select-none [&::-webkit-details-marker]:hidden ${
          active
            ? 'border-brand-tint bg-brand-tint font-semibold text-brand-deep'
            : 'border-line-strong bg-white text-ink hover:border-brand/40'
        }`}
      >
        <span className="text-ink-3">{label}</span>
        <span>{value}</span>
        <ChevronDown
          className="h-3.5 w-3.5 text-ink-3 transition-transform group-open:rotate-180"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </summary>
      <div className="absolute top-full left-0 z-20 mt-1.5 min-w-[11rem] rounded-xl border border-line bg-white p-1.5 shadow-[0_10px_28px_rgba(26,63,108,0.14)]">
        {options.map((o) => (
          <Link
            key={o.href + o.label}
            href={o.href}
            scroll={false}
            aria-current={o.selected ? 'true' : undefined}
            className={`block rounded-lg px-3 py-1.5 text-label whitespace-nowrap hover:bg-surface hover:no-underline ${
              o.selected ? 'font-semibold text-brand-deep' : 'text-ink'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  )
}

function SectionHeading({
  title,
  sub,
  aside,
}: {
  title: string
  sub?: string
  aside?: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-heading text-section font-semibold tracking-tight text-brand-deep">
          {title}
        </h2>
        {aside}
      </div>
      {sub && <p className="mt-1 text-small text-ink-3">{sub}</p>}
    </div>
  )
}

/** Řádková karta hotelu (varianta A): miniatura, název s hvězdami, údaje, cena vpravo. */
function TourRow({ offer }: { offer: TourOffer }) {
  const discount = discountPercent(offer)
  const meta = [
    offer.area || offer.place || null,
    BOARD_LABELS[offer.board] ?? null,
    nightCount(offer.nights),
    `odlet ${formatDate(offer.termFrom)} ${departuresLabel(offer.departures)}`.trim(),
  ].filter(Boolean)
  return (
    <a
      href={`/go/zajezd/${offer.id}`}
      target="_blank"
      rel="nofollow sponsored noopener"
      className="group grid grid-cols-[132px_1fr] gap-x-4 gap-y-2 rounded-xl border border-line bg-white p-3 transition-all duration-300 hover:-translate-y-0.5 hover:no-underline hover:shadow-[0_10px_28px_rgba(26,63,108,0.12)] md:grid-cols-[196px_1fr_auto] md:items-center md:gap-x-5"
    >
      <div className="relative aspect-[3/2] overflow-hidden rounded-[9px] bg-surface-2">
        {offer.photoUrl && (
          <DealCardImage
            src={offer.photoUrl}
            alt=""
            aspect="3:2"
            sizes="(min-width: 768px) 196px, 132px"
          />
        )}
        <SourceBadge source={offer.source} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-heading text-lead leading-snug font-semibold text-ink">
          {offer.title}
          {offer.stars ? (
            <>
              {' '}
              <Stars count={offer.stars} />
            </>
          ) : null}
        </h3>
        <p className="text-small text-ink-2">{meta.join(' · ')}</p>
        {offer.termCount > 1 && (
          <p className="text-label text-ink-3">{termCountLabel(offer.termCount)} u cestovky</p>
        )}
      </div>
      <div className="col-span-2 flex items-center gap-3 border-t border-line pt-2 tabular-nums md:col-span-1 md:flex-col md:items-end md:gap-0.5 md:border-0 md:pt-0 md:pl-2">
        {discount > 0 && <DiscountBadge percent={discount} className="md:mb-1" />}
        <span className="font-heading text-title leading-none font-semibold text-brand-deep transition-colors group-hover:text-brand">
          {priceCzk(offer.price)}
        </span>
        {offer.originalPrice ? (
          <s className="text-label text-ink-3">{priceCzk(offer.originalPrice)}</s>
        ) : (
          <span className="text-label text-ink-3">za osobu</span>
        )}
        <span className="ml-auto rounded-full bg-brand px-4 py-2 font-heading text-label font-bold whitespace-nowrap text-white md:mt-2 md:ml-0">
          Zobrazit zájezd
        </span>
      </div>
    </a>
  )
}

/** Dlaždice poznávacího zájezdu (náhled pod pobyty). */
function TourTile({ offer }: { offer: TourOffer }) {
  const discount = discountPercent(offer)
  return (
    <a
      href={`/go/zajezd/${offer.id}`}
      target="_blank"
      rel="nofollow sponsored noopener"
      className="group overflow-hidden rounded-xl border border-line bg-white transition-all duration-300 hover:-translate-y-0.5 hover:no-underline hover:shadow-[0_10px_28px_rgba(26,63,108,0.12)]"
    >
      <div className="relative aspect-[16/10] bg-surface-2">
        {offer.photoUrl && (
          <DealCardImage
            src={offer.photoUrl}
            alt=""
            aspect="16:9"
            sizes="(min-width: 768px) 33vw, 100vw"
          />
        )}
        {discount > 0 && (
          <DiscountBadge percent={discount} className="absolute top-2.5 left-2.5 shadow" />
        )}
        <SourceBadge source={offer.source} />
      </div>
      <div className="flex flex-col gap-1 px-3.5 py-3">
        <h3 className="line-clamp-2 font-heading text-body leading-snug font-semibold text-ink">
          {offer.title}
        </h3>
        <p className="truncate text-label text-ink-3">
          {[offer.area || offer.place, BOARD_LABELS[offer.board], nightCount(offer.nights)]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="mt-1 font-heading text-lead font-semibold text-brand-deep tabular-nums">
          {priceCzk(offer.price)}
          {offer.originalPrice && (
            <s className="ml-1.5 font-sans text-meta font-normal text-ink-3">
              {priceCzk(offer.originalPrice)}
            </s>
          )}
        </p>
      </div>
    </a>
  )
}

export function ToursSection({
  offers,
  filters,
  basePath,
  genitive,
  placeTitle,
}: ToursSectionProps) {
  const href = (patch: Partial<TourFilters>) => tourFiltersHref(basePath, filters, patch)
  const kinds = countByKind(offers)
  const cards = buildTourCards(offers, filters)
  const shown = cards.slice(0, filters.pocet)
  const isTours = filters.typ === 'poznavaci'
  const resorts = isTours ? [] : buildResorts(offers)
  // Náhled poznávacích zájezdů pod pobyty — tři nejlevnější, bez ostatních filtrů.
  const toursPreview = isTours
    ? []
    : buildTourCards(offers, {
        ...filters,
        typ: 'poznavaci',
        strava: 'vse',
        noci: 'vse',
        hvezdy: 0,
      }).slice(0, 3)
  const present = sourcesPresent(offers)
  const sourceNames = TOUR_SOURCES.filter((s) => present.some((p) => p.id === s.id)).map(
    (s) => s.label,
  )
  const hasFilters =
    filters.strava !== 'vse' ||
    filters.noci !== 'vse' ||
    filters.odlet !== 'vse' ||
    filters.hvezdy !== 0 ||
    filters.ck !== 'vse'

  if (offers.length === 0) {
    return (
      <section className="w-full bg-white pb-16">
        <div className="mx-auto max-w-7xl px-4 md:px-12">
          <p className="rounded-xl bg-surface-quiet px-5 py-6 text-center text-body text-ink-3">
            Nabídky zájezdů {genitive} se právě načítají z cestovek. Zkus to prosím později.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="w-full bg-white pb-16" aria-labelledby="zajezdy-nadpis">
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        <h2 id="zajezdy-nadpis" className="sr-only">
          Nabídky zájezdů {genitive}
        </h2>

        {/* Přepínač pobyt / poznávací — jen když jsou obojí. */}
        {kinds.stay > 0 && kinds.tour > 0 && (
          <div className="mb-4 inline-flex rounded-full border border-line-strong bg-white p-0.5">
            {(
              [
                { value: 'pobyt', label: 'Pobyt u moře', count: kinds.stay },
                { value: 'poznavaci', label: 'Poznávací', count: kinds.tour },
              ] as const
            ).map((o) => {
              const selected = filters.typ === o.value
              return (
                <Link
                  key={o.value}
                  href={href({ typ: o.value })}
                  scroll={false}
                  aria-current={selected ? 'true' : undefined}
                  className={`rounded-full px-4 py-1.5 text-small font-semibold hover:no-underline ${
                    selected ? 'bg-brand text-white' : 'text-ink-2 hover:text-brand'
                  }`}
                >
                  {o.label} <span className="font-normal opacity-75">{o.count}</span>
                </Link>
              )
            })}
          </div>
        )}

        {/* Filtry */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <FilterMenu
            label="Odlet"
            value={DEPARTURE_OPTIONS.find((o) => o.slug === filters.odlet)?.name ?? 'kdekoli v ČR'}
            active={filters.odlet !== 'vse'}
            options={[
              {
                label: 'kdekoli v ČR',
                href: href({ odlet: 'vse' }),
                selected: filters.odlet === 'vse',
              },
              ...DEPARTURE_OPTIONS.map((o) => ({
                label: o.name,
                href: href({ odlet: o.slug }),
                selected: filters.odlet === o.slug,
              })),
            ]}
          />
          <FilterMenu
            label="Strava"
            value={filters.strava === 'vse' ? 'libovolná' : BOARD_LABELS[filters.strava]}
            active={filters.strava !== 'vse'}
            options={[
              {
                label: 'libovolná',
                href: href({ strava: 'vse' }),
                selected: filters.strava === 'vse',
              },
              ...BOARD_OPTIONS.map((o) => ({
                label: o.label,
                href: href({ strava: o.code }),
                selected: filters.strava === o.code,
              })),
            ]}
          />
          <FilterMenu
            label="Délka"
            value={NIGHTS_OPTIONS.find((o) => o.value === filters.noci)?.label ?? 'libovolná'}
            active={filters.noci !== 'vse'}
            options={NIGHTS_OPTIONS.map((o) => ({
              label: o.label,
              href: href({ noci: o.value }),
              selected: filters.noci === o.value,
            }))}
          />
          {!isTours && (
            <FilterMenu
              label="Hotel"
              value={filters.hvezdy ? `${filters.hvezdy}★ a víc` : 'libovolný'}
              active={filters.hvezdy !== 0}
              options={[
                { label: 'libovolný', href: href({ hvezdy: 0 }), selected: filters.hvezdy === 0 },
                ...[3, 4, 5].map((n) => ({
                  label: `${n}★ a víc`,
                  href: href({ hvezdy: n }),
                  selected: filters.hvezdy === n,
                })),
              ]}
            />
          )}
          {present.length > 1 && (
            <FilterMenu
              label="Cestovka"
              value={
                filters.ck === 'vse' ? 'všechny' : (tourSourceById(filters.ck)?.label ?? filters.ck)
              }
              active={filters.ck !== 'vse'}
              options={[
                { label: 'všechny', href: href({ ck: 'vse' }), selected: filters.ck === 'vse' },
                ...present.map((s) => ({
                  label: s.label,
                  href: href({ ck: s.id }),
                  selected: filters.ck === s.id,
                })),
              ]}
            />
          )}
          <div className="ml-auto">
            <FilterMenu
              label="Řadit"
              value={SORT_OPTIONS.find((o) => o.value === filters.razeni)?.label ?? 'nejlevnější'}
              active={false}
              options={SORT_OPTIONS.map((o) => ({
                label: o.label,
                href: href({ razeni: o.value }),
                selected: filters.razeni === o.value,
              }))}
            />
          </div>
        </div>

        {/* Letoviska */}
        {resorts.length > 1 && (
          <div className="mb-10">
            <SectionHeading
              title={`Kam ${genitive}`}
              sub="Nejnižší cena za osobu na 6–8 nocí s odletem z Česka."
            />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6 md:gap-3.5">
              {resorts.map((r) => (
                <li
                  key={r.name}
                  className="relative aspect-[4/3] overflow-hidden rounded-[10px] bg-surface-2"
                >
                  {r.photoUrl && (
                    <DealCardImage
                      src={r.photoUrl}
                      alt=""
                      aspect="3:2"
                      sizes="(min-width: 768px) 16vw, 50vw"
                    />
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-night/80 to-night/0 px-3 pt-9 pb-2.5 text-white">
                    <b className="font-heading text-body leading-tight font-semibold">{r.name}</b>
                    <i className="text-meta not-italic opacity-90">
                      od {priceCzk(r.minPrice)} · {hotelCountLabel(r.hotels)}
                    </i>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Seznam */}
        <SectionHeading
          title={isTours ? `Poznávací zájezdy ${genitive}` : `Nejlevnější zájezdy ${genitive}`}
          sub={
            isTours
              ? 'Každý zájezd jednou, s nejlevnějším termínem. Cena za osobu při obsazení dvěma dospělými.'
              : 'Každý hotel jednou, s nejlevnějším termínem. Cena za osobu při obsazení dvěma dospělými.'
          }
          aside={
            <span className="text-small text-ink-3 tabular-nums">
              {cards.length === 1
                ? '1 nabídka'
                : cards.length <= 4
                  ? `${cards.length} nabídky`
                  : `${cards.length} nabídek`}
            </span>
          }
        />
        {shown.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {shown.map((offer) => (
              <li key={offer.id}>
                <TourRow offer={offer} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-surface-quiet px-5 py-6 text-center text-body text-ink-3">
            Tomuhle výběru teď žádný zájezd neodpovídá.{' '}
            {hasFilters && (
              <Link
                href={href({ strava: 'vse', noci: 'vse', odlet: 'vse', hvezdy: 0, ck: 'vse' })}
                scroll={false}
              >
                Zrušit filtry
              </Link>
            )}
          </p>
        )}
        {cards.length > shown.length && (
          <div className="mt-6 flex justify-center">
            <Link
              href={href({ pocet: filters.pocet + TOURS_PAGE_SIZE * 2 })}
              scroll={false}
              className="inline-flex items-center gap-2 rounded-full border-2 border-brand/30 px-7 py-3 font-heading text-sm font-bold tracking-wider text-brand uppercase transition-all btn-halo hover:border-brand hover:no-underline"
            >
              Načíst další nabídky
              <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </Link>
          </div>
        )}

        {/* Náhled poznávacích zájezdů */}
        {toursPreview.length > 0 && (
          <div className="mt-12">
            <SectionHeading
              title={`Poznávací zájezdy ${genitive}`}
              sub="S průvodcem a programem — ne jen hotel u moře."
              aside={
                <Link
                  href={href({ typ: 'poznavaci' })}
                  scroll={false}
                  className="text-small font-semibold"
                >
                  {kinds.tour <= 4 ? `Všechny ${kinds.tour}` : `Všech ${kinds.tour}`} →
                </Link>
              }
            />
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {toursPreview.map((offer) => (
                <li key={offer.id}>
                  <TourTile offer={offer} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cestovky + poznámka */}
        <div className="mt-12">
          <SectionHeading title={`S kým ${genitive}`} sub={`Zájezdy ${genitive} podle cestovky.`} />
          <ul className="flex flex-wrap items-center gap-2.5">
            {present.map((s) => (
              <li key={s.id}>
                <Link
                  href={href({ ck: s.id })}
                  scroll={false}
                  className="inline-block rounded-[10px] border border-line bg-white px-4 py-2.5 font-heading text-small font-semibold text-brand-deep hover:border-brand/40 hover:no-underline"
                >
                  {s.label} <span className="font-sans font-normal text-ink-3">{s.count}</span>
                </Link>
              </li>
            ))}
            <li>
              <a
                href="/go/zajezdy"
                target="_blank"
                rel="nofollow sponsored noopener"
                className="inline-block rounded-[10px] border border-line bg-white px-4 py-2.5 font-heading text-small font-semibold text-ink-2 hover:border-brand/40 hover:no-underline"
              >
                Porovnat na Invii ↗
              </a>
            </li>
          </ul>
          <p className="mt-4 max-w-3xl text-label text-ink-3">
            Ceny {placeTitle ? `zájezdů ${genitive}` : 'zájezdů'} pocházejí z nabídek cestovek
            {sourceNames.length > 0 ? ` (${sourceNames.join(', ')})` : ''} a obnovují se jednou
            denně; během dne se mohou změnit nebo vyprodat, konečnou cenu a volná místa potvrdí
            cestovka. Za objednávku přes náš odkaz dostaneme provizi, cena pro tebe je stejná.
          </p>
        </div>
      </div>
    </section>
  )
}
