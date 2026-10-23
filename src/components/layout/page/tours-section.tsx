import React from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { TourOffer } from '@/types/payload'
import { BOARD_LABELS } from '@/lib/sdovolena'
import { TOUR_AIRPORTS, airportBySlug } from '@/lib/tour-airports'
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
  cardDeparture,
  departureDays,
  hotelTerms,
  formatDay,
  hasActiveFilters,
  kindFacet,
  monthFacet,
  resortFacet,
  sourceFacet,
  starsFacet,
  toggleValue,
  tourFiltersHref,
  type FacetOption,
  type TourFilters,
} from '@/lib/tour-filters'
import { nightCount, priceCzk } from './deals-section'
import { DealCardImage } from './deal-card-image'
import { TourDateDialog } from './tour-date-dialog'
import { DetailsAutoClose } from './details-auto-close'
import { loadMorePillClass, loadMorePillIconClass } from '@/components/features/load-more-pill'
import { TourRow, Stars } from './tour-row'
import { TourMapButton, TourMapPanel, type TourMapHotel } from './tour-map'

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

/** Nadpis seznamu podle řazení a typu („Nejlevnější zájezdy do Egypta“, „… s největší slevou“). */
function listTitle(f: TourFilters, genitive: string): string {
  const what = f.typ === 'poznavaci' ? 'Poznávací zájezdy' : 'Zájezdy'
  switch (f.razeni) {
    case 'cena':
      return `Nejlevnější ${what.toLowerCase()} ${genitive}`
    case 'sleva':
      return `${what} ${genitive} s největší slevou`
    case 'odlet':
      return `${what} ${genitive} podle data odletu`
    default:
      return `Doporučené ${what.toLowerCase()} ${genitive}`
  }
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
      className={`flex items-center gap-2.5 rounded-md px-1.5 py-1 text-small hover:bg-surface hover:no-underline ${
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

function PanelGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="mb-0.5 font-heading text-label font-semibold text-ink">{title}</h3>
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

export function ToursSection({ offers, filters, basePath, genitive, today }: ToursSectionProps) {
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

  // Mapa: celý výběr po filtru (ne jen načtená stránka), jen hotely se souřadnicemi.
  const mapHotels: TourMapHotel[] = cards.flatMap((card) => {
    const { offer } = card
    if (offer.lat === null || offer.lng === null) return []
    return [
      {
        id: offer.id,
        title: offer.title,
        stars: offer.stars,
        meta: [
          offer.area || offer.place || null,
          BOARD_LABELS[offer.board] ?? null,
          nightCount(card.nights),
          `odlet ${formatDay(card.date)} ${cardDeparture(card, filters).label}`,
        ]
          .filter(Boolean)
          .join(' · '),
        price: card.price,
        originalPrice: card.originalPrice,
        source: tourSourceById(offer.source)?.label ?? offer.source,
        photoUrl: offer.photoUrl,
        lat: offer.lat,
        lng: offer.lng,
        href: `/go/zajezd/${offer.id}`,
        area: offer.area || offer.place || null,
        inviaUrl: offer.inviaUrl,
      },
    ]
  })
  const filtersSummary = tags.map((t) => t.label).join(' · ')

  // Pás letovisek jen bez filtru letoviska a mimo čistě poznávací výběr.
  const resorts =
    filters.typ !== 'poznavaci' && filters.letovisko.length === 0 ? buildResorts(cards) : []

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
    // Maketa 5 (23. 10. 2026): každý řádek ikony + krátký text, ať se nemíchá
    // řádek jen s hvězdami a řádek s textem; „bez kategorie“ = šedé hvězdy.
    (o) => (
      <span className="inline-flex items-center gap-1.5">
        {o.value === 0 ? (
          <Stars count={5} muted label="bez kategorie" />
        ) : (
          <Stars count={o.value} />
        )}
        <span>
          {o.value === 5
            ? '5 hvězd'
            : o.value === 4
              ? '4 hvězdy'
              : o.value === 3
                ? '3 a méně'
                : 'bez kategorie'}
        </span>
      </span>
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
    </div>
  )

  const results = (
    <>
      {/* Poctivá poznámka k cenám — nad obsahem vedle panelu, nenápadně (vzor
          Cestujlevně); znění uživatele 23. 10. 2026, bez čísla frekvence
          a bez věty o provizi. */}
      <p className="mb-6 text-label leading-relaxed text-ink-3">
        Ceny se pravidelně obnovují; během dne se mohou změnit nebo vyprodat, konečnou cenu a volná
        místa potvrdí cestovka.
      </p>
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

      {/* Nadpis seznamu se mění s řazením a řazení stojí přímo nad seznamem —
          týká se jen jeho, ne pásu letovisek (rozhodnutí uživatele 23. 10. 2026). */}
      <SectionHeading
        title={listTitle(filters, genitive)}
        sub="Každý hotel jednou, s nejlevnějším termínem ve vybraném období. Cena za osobu při obsazení dvěma dospělými."
        aside={
          <span className="text-small text-ink-3 tabular-nums">
            {offerCountLabel(cards.length)}
          </span>
        }
      />
      {/* Řazení bez popisku — aktivní volba a nadpis seznamu říkají dost. */}
      <div
        className="-mt-1 mb-4 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-label"
        aria-label="Řazení"
        role="group"
      >
        {SORT_OPTIONS.map((o) => {
          const active = filters.razeni === o.value
          return (
            <Link
              key={o.value}
              href={href({ razeni: o.value })}
              scroll={false}
              aria-current={active ? 'true' : undefined}
              className={`rounded-full px-3 py-1 hover:no-underline ${
                active
                  ? 'bg-brand-tint font-semibold text-brand-deep'
                  : 'text-ink-2 hover:bg-surface hover:text-brand'
              }`}
            >
              {o.label}
            </Link>
          )
        })}
      </div>
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {shown.map((card) => (
            <li key={card.offer.id}>
              <TourRow card={card} filters={filters} terms={hotelTerms(offers, card, filters)} />
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
            className={`${loadMorePillClass} hover:no-underline`}
          >
            Načíst další nabídky
            <ChevronDown className={loadMorePillIconClass} strokeWidth={2.5} aria-hidden="true" />
          </Link>
        </div>
      )}
    </>
  )

  return (
    <section className="w-full bg-white pt-5 pb-16" aria-labelledby="zajezdy-nadpis">
      <div className="mx-auto max-w-7xl px-4 md:px-12">
        <h2 id="zajezdy-nadpis" className="sr-only">
          Nabídky zájezdů {genitive}
        </h2>
        <DetailsAutoClose />

        {/* Pruh log cestovek, které stránka srovnává (jen ty s nabídkami):
            NAD hledáním (rozhodnutí uživatele 23. 10. 2026 — nejdřív „kdo“, pak
            „co hledám“), vystředěný, jednobarevný, se stejnou optickou váhou
            log — vzor důvěryhodnostních pruhů (Invia, Cestujlevně). Jména
            i počty cestovek nese filtr Cestovka; loga jsou dekorace. */}
        {/* Stejná mezera nad logy (pt-5 sekce pod linkou menu) i pod nimi (pb-5 nad linkou). */}
        <div className="mb-6 border-b border-line pb-5 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            <span className="text-caps-sm font-semibold tracking-[0.1em] text-ink-3 uppercase">
              Hledáme nejlepší nabídky od
            </span>
            {TOUR_SOURCES.filter((src) => sources.some((f) => f.value === src.id)).map((src) =>
              src.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src.id}
                  src={src.logo}
                  alt={src.label}
                  className={`w-auto opacity-55 grayscale transition hover:opacity-100 hover:grayscale-0 ${src.logoHeight ?? 'h-6'}`}
                />
              ) : (
                <span key={src.id} className="font-heading text-small font-semibold text-ink-2">
                  {src.label}
                </span>
              ),
            )}
          </div>
        </div>

        {/* Horní panel: odlet + termín a délka */}
        <div className="grid gap-2.5 md:grid-cols-[1fr_1.6fr] md:items-stretch">
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
        </div>

        {/* Řádek použitých filtrů jen když nějaké jsou — prázdný řádek s počtem
            vypadal jako díra; počet nabídek je u nadpisu seznamu. */}
        {tags.length > 0 && <div className="mt-3">{appliedRow}</div>}

        <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_250px]">
          <div className="min-w-0">{results}</div>
          <aside className="lg:border-l lg:border-line lg:pl-6">
            <details className="lg:hidden">
              <summary className="mb-3 inline-block cursor-pointer list-none rounded-full border border-line-strong px-4 py-2 text-label font-semibold [&::-webkit-details-marker]:hidden">
                Další filtry
              </summary>
              <div className="mb-4 grid grid-cols-2 gap-x-4">{panelGroups}</div>
            </details>
            {mapHotels.length > 0 && (
              <TourMapButton className="mb-3 ml-2 inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2 text-label font-semibold text-ink hover:no-underline lg:hidden" />
            )}
            {/* Od lg přilepený pod sekundárním menu (obyčejné CSS sticky jako
                obsah u článků) — panel je záměrně hustý, aby se vešel na výšku
                okna; řešení podle směru scrollu skákalo (zkoušeno 23. 10. 2026). */}
            <div className="hidden lg:sticky lg:top-pod-listou lg:block">
              <TourMapPanel
                hotels={mapHotels}
                genitive={genitive}
                filtersSummary={filtersSummary}
              />
              {panelGroups}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
