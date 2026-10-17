import React from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { TourOffer } from '@/types/payload'
import { BOARD_LABELS } from '@/lib/sdovolena'
import { TOUR_AIRPORTS, airportByName, airportBySlug } from '@/lib/tour-airports'
import { TOUR_SOURCES, tourSourceById } from '@/lib/tour-sources'
import {
  CLEARED_FILTERS,
  SORT_OPTIONS,
  TOURS_PAGE_SIZE,
  airportFacet,
  appliedFilterTags,
  boardFacet,
  buildResorts,
  buildTourCards,
  departureDays,
  discountPercent,
  formatDay,
  hasActiveFilters,
  kindFacet,
  monthFacet,
  resortFacet,
  selectedAirportNames,
  sourceFacet,
  starsFacet,
  toggleValue,
  tourFiltersHref,
  type FacetOption,
  type TourCard,
  type TourFilters,
} from '@/lib/tour-filters'
import { nightCount, priceCzk } from './deals-section'
import { DealCardImage } from './deal-card-image'
import { TourDateDialog } from './tour-date-dialog'
import { DetailsAutoClose } from './details-auto-close'

/**
 * Podstránka „Zájezdy“ země (kategorie `Zájezdy`): horní panel s odletem
 * (více letišť, okolní na vyžádání) a společným dialogem termín + délka,
 * vedlejší filtry (typ, strava, hvězdy, letovisko, cestovka, sleva) v PRAVÉM
 * bočním panelu — vpravo jako všechny postranní panely webu (obsah, kurz,
 * reklama), rozhodnutí uživatele 17. 10. 2026 po porovnání s řadou chipů
 * na živých datech (chipy s hodnotou „vše“ vypadaly jako aktivní filtr).
 * Pod horním panelem řádek použitých filtrů s křížky, v hlavním sloupci pás
 * letovisek s cenou „od“, řádkové karty (každý hotel jednou, nejlevnější
 * termín po filtru) a řádek cestovek.
 *
 * Data: kolekce `tour-offers` (denní sync z feedů cestovek, Sdovolená.cz),
 * logika filtrů v src/lib/tour-filters.ts. Vše kromě dialogu termínu jsou
 * obyčejné odkazy (serverová komponenta): fungují bez JavaScriptu, každá
 * kombinace má adresu. Odkazy na zájezd vedou přes /go/zajezd/<id> (CJ
 * click link cestovky s deep-linkem z feedu), robots.txt /go/ vylučuje.
 */

interface ToursSectionProps {
  offers: TourOffer[]
  filters: TourFilters
  /** Adresa stránky bez parametrů (základ pro odkazy filtrů). */
  basePath: string
  /** „do Egypta“ — druhý pád vč. předložky (pole genitive kontextového místa). */
  genitive: string
  placeTitle: string
  /** Dnešek v Praze (YYYY-MM-DD). */
  today: string
}

function hotelCountLabel(count: number): string {
  if (count === 1) return '1 hotel'
  if (count <= 4) return `${count} hotely`
  return `${count} hotelů`
}
function offerCountLabel(count: number): string {
  if (count === 1) return '1 nabídka'
  if (count <= 4) return `${count} nabídky`
  return `${count} nabídek`
}
function termCountLabel(count: number): string {
  if (count <= 1) return ''
  if (count <= 4) return `${count} termíny`
  return `${count} termínů`
}

/**
 * Odlet pro kartu: z letišť řádku to nejbližší vybranému (česká první);
 * okolní letiště dostane štítek, ať je z karty jasné, odkud se letí.
 */
function cardDeparture(card: TourCard, f: TourFilters): { label: string; near: boolean } {
  const selected = selectedAirportNames(f)
  const name = card.offer.departures.find((d) => selected.includes(d)) ?? card.offer.departures[0]
  const airport = airportByName(name)
  return { label: airport?.from ?? `z ${name}`, near: airport?.group === 'near' }
}

/**
 * Přepnutí letiště: prázdný výběr znamená „všechna česká“, takže odškrtnutí
 * jednoho českého z výchozího stavu dá ostatní česká; výběr, který se zase
 * rovná celému Česku, se vrací na prázdno (čistá adresa).
 */
function toggleAirport(f: TourFilters, slug: string): string[] {
  const cz = TOUR_AIRPORTS.filter((a) => a.group === 'cz').map((a) => a.slug)
  const current = f.odlet.length === 0 ? cz : f.odlet
  const next = toggleValue(current, slug)
  const isAllCz = next.length === cz.length && cz.every((s) => next.includes(s))
  return isAllCz ? [] : next
}

/** Hvězdy hotelu — maska `.star-glyph` jako u hodnocení. */
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

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-1 text-caps-sm font-bold tracking-[0.09em] text-brand-deep uppercase">
      {tourSourceById(source)?.label ?? source}
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

/** Zaškrtávací volba jako odkaz (funguje bez JS); počet vpravo. */
function CheckOption({
  href,
  label,
  count,
  selected,
  children,
}: {
  href: string
  label?: string
  count?: number
  selected: boolean
  children?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      role="checkbox"
      aria-checked={selected}
      className={`flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-small hover:bg-surface hover:no-underline ${
        selected ? 'font-semibold text-brand-deep' : 'text-ink'
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative h-4 w-4 shrink-0 rounded border-[1.5px] ${
          selected ? 'border-brand bg-brand' : 'border-line-strong bg-white'
        }`}
      >
        {selected && (
          <span className="absolute top-[1px] left-[4px] h-[9px] w-[5px] rotate-45 border-r-2 border-b-2 border-white" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{children ?? label}</span>
      {count !== undefined && <span className="text-meta text-ink-3 tabular-nums">{count}</span>}
    </Link>
  )
}

/** Rozbalovací chip (`<details>`): popisek + hodnota, uvnitř volby. */
function ChipMenu({
  label,
  value,
  active,
  children,
  align = 'left',
}: {
  label: string
  value: string
  active: boolean
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <details className="group relative" data-autoclose="">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-label select-none [&::-webkit-details-marker]:hidden ${
          active
            ? 'border-brand-tint bg-brand-tint font-semibold text-brand-deep'
            : 'border-line-strong bg-white text-ink hover:border-brand/40'
        }`}
      >
        <span className={active ? 'text-brand' : 'text-ink-3'}>{label}</span>
        <span className="max-w-[14rem] truncate">{value}</span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </summary>
      <div
        className={`absolute top-full z-20 mt-1.5 min-w-[13rem] rounded-xl border border-line bg-white p-1.5 shadow-[0_10px_28px_rgba(26,63,108,0.14)] ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {children}
      </div>
    </details>
  )
}

function PanelGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 font-heading text-label font-semibold text-ink">{title}</h3>
      <div className="flex flex-col">{children}</div>
    </div>
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

/** Řádková karta hotelu: miniatura, název s hvězdami, údaje, cena vpravo. */
function TourRow({ card, filters }: { card: TourCard; filters: TourFilters }) {
  const { offer } = card
  const discount = discountPercent(card)
  const departure = cardDeparture(card, filters)
  const meta = [
    offer.area || offer.place || null,
    BOARD_LABELS[offer.board] ?? null,
    nightCount(card.nights),
    `odlet ${formatDay(card.date)} ${departure.label}`,
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
          {offer.kind === 'tour' && (
            <span className="ml-2 inline-block rounded-md bg-brand-tint px-1.5 py-0.5 align-[2px] text-meta font-semibold text-brand-deep">
              poznávací
            </span>
          )}
        </h3>
        <p className="text-small text-ink-2">
          {meta.join(' · ')}
          {departure.near && (
            <span className="ml-1.5 inline-block rounded-md bg-surface-2 px-1.5 py-0.5 align-[1px] text-meta font-semibold text-ink-2">
              okolní letiště
            </span>
          )}
        </p>
        {offer.termCount > 1 && (
          <p className="text-label text-ink-3">{termCountLabel(offer.termCount)} u cestovky</p>
        )}
      </div>
      <div className="col-span-2 flex items-center gap-3 border-t border-line pt-2 tabular-nums md:col-span-1 md:flex-col md:items-end md:gap-0.5 md:border-0 md:pt-0 md:pl-2">
        {discount > 0 && <DiscountBadge percent={discount} className="md:mb-1" />}
        <span className="font-heading text-title leading-none font-semibold text-brand-deep transition-colors group-hover:text-brand">
          {priceCzk(card.price)}
        </span>
        {card.originalPrice ? (
          <s className="text-label text-ink-3">{priceCzk(card.originalPrice)}</s>
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

export function ToursSection({
  offers,
  filters,
  basePath,
  genitive,
  placeTitle,
  today,
}: ToursSectionProps) {
  const href = (patch: Partial<TourFilters>) => tourFiltersHref(basePath, filters, patch)
  const cards = buildTourCards(offers, filters)
  const shown = cards.slice(0, filters.pocet)

  const airports = airportFacet(offers, filters)
  const months = monthFacet(offers, filters, today)
  const kinds = kindFacet(offers, filters)
  const boards = boardFacet(offers, filters)
  const stars = starsFacet(offers, filters)
  const resortsFacet = resortFacet(offers, filters)
  const sources = sourceFacet(offers, filters)
  const days = departureDays(offers, filters)
  const resortLabel = (slug: string) => resortsFacet.find((r) => r.value === slug)?.label ?? slug
  const tags = appliedFilterTags(filters, resortLabel)

  // Pás letovisek jen bez filtru letoviska a mimo čistě poznávací výběr.
  const resorts =
    filters.typ !== 'poznavaci' && filters.letovisko.length === 0 ? buildResorts(cards) : []
  const sourceNames = TOUR_SOURCES.filter((s) => offers.some((o) => o.source === s.id)).map(
    (s) => s.label,
  )

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

  // Shrnutí odletu pro horní pole.
  const czCount = TOUR_AIRPORTS.filter((a) => a.group === 'cz').length
  const departureValue =
    filters.odlet.length === 0
      ? 'kdekoli v Česku'
      : filters.odlet.length === czCount &&
          filters.odlet.every((s) => airportBySlug(s)?.group === 'cz')
        ? 'kdekoli v Česku'
        : filters.odlet.map((s) => airportBySlug(s)?.name ?? s).join(', ')

  const optionList = <T,>(
    facet: FacetOption<T>[],
    patch: (value: T) => Partial<TourFilters>,
    labelOf?: (o: FacetOption<T>) => React.ReactNode,
  ) =>
    facet.map((o) => (
      <CheckOption
        key={String(o.value)}
        href={href(patch(o.value))}
        count={o.count}
        selected={o.selected}
      >
        {labelOf ? labelOf(o) : o.label}
      </CheckOption>
    ))

  const kindOptions = optionList(kinds, (v) => ({ typ: filters.typ === v ? 'vse' : v }))
  const boardOptions = optionList(boards, (v) => ({ strava: toggleValue(filters.strava, v) }))
  const starsOptions = optionList(
    stars,
    (v) => ({ hvezdy: toggleValue(filters.hvezdy, v) }),
    (o) =>
      o.value === 3 ? (
        <>
          <Stars count={3} /> a méně
        </>
      ) : (
        <Stars count={o.value} />
      ),
  )
  const resortOptions = optionList(resortsFacet, (v) => ({
    letovisko: toggleValue(filters.letovisko, v),
  }))
  const sourceOptions = optionList(sources, (v) => ({ ck: toggleValue(filters.ck, v) }))
  const discountOption = (
    <CheckOption href={href({ sleva: !filters.sleva })} selected={filters.sleva}>
      Jen se slevou
    </CheckOption>
  )

  const panelGroups = (
    <>
      <PanelGroup title="Typ zájezdu">{kindOptions}</PanelGroup>
      <PanelGroup title="Strava">{boardOptions}</PanelGroup>
      <PanelGroup title="Hotel">{starsOptions}</PanelGroup>
      {resortsFacet.length > 1 && <PanelGroup title="Letovisko">{resortOptions}</PanelGroup>}
      {sources.length > 1 && <PanelGroup title="Cestovka">{sourceOptions}</PanelGroup>}
      <PanelGroup title="Nabídka">{discountOption}</PanelGroup>
    </>
  )

  const appliedRow = (
    <div className="flex flex-wrap items-center gap-1.5 text-label">
      {tags.map((t) => (
        <Link
          key={t.label}
          href={href(t.patch)}
          scroll={false}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pr-2 pl-2.5 text-ink hover:bg-surface-2 hover:no-underline"
          aria-label={`Zrušit filtr ${t.label}`}
        >
          {t.label}
          <span aria-hidden="true" className="font-bold text-ink-3">
            ×
          </span>
        </Link>
      ))}
      {hasActiveFilters(filters) && (
        <Link href={href(CLEARED_FILTERS)} scroll={false} className="ml-1 font-semibold">
          Zrušit vše
        </Link>
      )}
      <span className="ml-auto text-ink-3 tabular-nums">{hotelCountLabel(cards.length)}</span>
    </div>
  )

  const results = (
    <>
      {resorts.length > 1 && (
        <div className="mb-8">
          <SectionHeading
            title={`Kam ${genitive}`}
            sub="Nejnižší cena za osobu pro vybraný odlet, termín a délku. Klik vybere letovisko."
          />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-3.5">
            {resorts.map((r) => (
              <li key={r.slug}>
                <Link
                  href={href({ letovisko: [r.slug] })}
                  scroll={false}
                  className="group relative block aspect-[4/3] overflow-hidden rounded-[10px] bg-surface-2 hover:no-underline"
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
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SectionHeading
        title={
          filters.typ === 'poznavaci'
            ? `Poznávací zájezdy ${genitive}`
            : `Nejlevnější zájezdy ${genitive}`
        }
        sub="Každý hotel jednou, s nejlevnějším termínem ve vybraném období. Cena za osobu při obsazení dvěma dospělými."
        aside={
          <span className="text-small text-ink-3 tabular-nums">
            {offerCountLabel(cards.length)}
          </span>
        }
      />
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {shown.map((card) => (
            <li key={card.offer.id}>
              <TourRow card={card} filters={filters} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-surface-quiet px-5 py-6 text-center text-body text-ink-3">
          Tomuhle výběru teď žádný zájezd neodpovídá.{' '}
          {hasActiveFilters(filters) && (
            <Link href={href(CLEARED_FILTERS)} scroll={false}>
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
    </>
  )

  return (
    <section className="w-full bg-white pb-16" aria-labelledby="zajezdy-nadpis">
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        <h2 id="zajezdy-nadpis" className="sr-only">
          Nabídky zájezdů {genitive}
        </h2>
        <DetailsAutoClose />

        {/* Horní panel: odlet + termín a délka + řazení */}
        <div className="grid gap-2.5 md:grid-cols-[1fr_1.6fr_auto] md:items-stretch">
          <details className="group relative" data-autoclose="">
            <summary className="flex h-full cursor-pointer list-none items-center gap-3 rounded-xl border border-line-strong bg-white px-3.5 py-2 select-none group-open:border-brand group-open:ring-[3px] group-open:ring-brand/15 hover:border-brand/40 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block text-caps-sm font-semibold tracking-[0.04em] text-ink-3 uppercase">
                  Odlet
                </span>
                <span className="block truncate text-small font-semibold text-ink">
                  {departureValue}
                </span>
              </span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
                strokeWidth={2.5}
                aria-hidden="true"
              />
            </summary>
            <div className="absolute top-full left-0 z-30 mt-2 w-[18rem] rounded-2xl border border-line bg-white p-3 shadow-[0_14px_40px_rgba(26,63,108,0.18)]">
              <p className="px-1.5 pb-1 text-meta font-semibold text-ink-3">Česko</p>
              {optionList(
                airports.filter((a) => airportBySlug(a.value)?.group === 'cz'),
                (slug) => ({ odlet: toggleAirport(filters, slug) }),
              ).map((node, i) =>
                // Prázdný výběr = všechna česká zaškrtnutá.
                filters.odlet.length === 0
                  ? React.cloneElement(node, { selected: true })
                  : React.cloneElement(node, { key: i }),
              )}
              <p className="px-1.5 pt-2 pb-1 text-meta font-semibold text-ink-3">
                Okolní letiště (často levnější)
              </p>
              {optionList(
                airports.filter((a) => airportBySlug(a.value)?.group === 'near'),
                (slug) => ({ odlet: toggleAirport(filters, slug) }),
              )}
              <div className="mt-2 flex justify-between border-t border-line px-1.5 pt-2 text-label">
                {/* „Jen Praha“ = nejčastější zúžení (ušetří odškrtání ostatních);
                    „Celé Česko“ je návrat k výchozímu, takže jen když se liší. */}
                {filters.odlet.length === 1 && filters.odlet[0] === 'praha' ? (
                  <span className="text-ink-3">Jen Praha</span>
                ) : (
                  <Link href={href({ odlet: ['praha'] })} scroll={false} className="font-semibold">
                    Jen Praha
                  </Link>
                )}
                {filters.odlet.length > 0 && (
                  <Link href={href({ odlet: [] })} scroll={false} className="font-semibold">
                    Celé Česko
                  </Link>
                )}
              </div>
            </div>
          </details>

          <TourDateDialog
            // Změna filtru termínu/délky v adrese = nový stav dialogu (rozpracovaný výběr se zahodí).
            key={JSON.stringify([filters.mesice, filters.od, filters.do, filters.noci])}
            basePath={basePath}
            filters={filters}
            months={months}
            departureDays={days}
            today={today}
          />

          <div className="flex items-center md:justify-end">
            <ChipMenu
              label="Řadit"
              value={SORT_OPTIONS.find((o) => o.value === filters.razeni)?.label ?? 'doporučené'}
              active={false}
              align="right"
            >
              {SORT_OPTIONS.map((o) => (
                <Link
                  key={o.value}
                  href={href({ razeni: o.value })}
                  scroll={false}
                  aria-current={filters.razeni === o.value ? 'true' : undefined}
                  className={`block rounded-lg px-3 py-1.5 text-label whitespace-nowrap hover:bg-surface hover:no-underline ${
                    filters.razeni === o.value ? 'font-semibold text-brand-deep' : 'text-ink'
                  }`}
                >
                  {o.label}
                </Link>
              ))}
            </ChipMenu>
          </div>
        </div>

        <div className="mt-3 mb-5">{appliedRow}</div>
        <div className="grid gap-7 lg:grid-cols-[1fr_250px]">
          <div className="min-w-0">{results}</div>
          <aside className="lg:border-l lg:border-line lg:pl-6">
            {/* Do lg: skládací „Další filtry“ pod výsledky; od lg stálý pravý panel. */}
            <details className="lg:hidden">
              <summary className="mb-3 inline-block cursor-pointer list-none rounded-full border border-line-strong px-4 py-2 text-label font-semibold [&::-webkit-details-marker]:hidden">
                Další filtry
              </summary>
              <div className="mb-4 grid grid-cols-2 gap-x-4">{panelGroups}</div>
            </details>
            <div className="hidden lg:block">{panelGroups}</div>
          </aside>
        </div>

        {/* Cestovky + poznámka */}
        <div className="mt-12">
          <SectionHeading title={`S kým ${genitive}`} sub={`Zájezdy ${genitive} podle cestovky.`} />
          <ul className="flex flex-wrap items-center gap-2.5">
            {sources.map((s) => (
              <li key={s.value}>
                <Link
                  href={href({ ck: [s.value] })}
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
            Ceny zájezdů {genitive} pocházejí z nabídek cestovek
            {sourceNames.length > 0 ? ` (${sourceNames.join(', ')})` : ''} a obnovují se jednou
            denně; během dne se mohou změnit nebo vyprodat, konečnou cenu a volná místa potvrdí
            cestovka{placeTitle ? '' : ''}. Za objednávku přes náš odkaz dostaneme provizi, cena pro
            tebe je stejná.
          </p>
        </div>
      </div>
    </section>
  )
}
