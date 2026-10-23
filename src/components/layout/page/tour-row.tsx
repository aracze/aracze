'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, MapPin } from 'lucide-react'
import { BOARD_LABELS } from '@/lib/sdovolena'
import { airportByName } from '@/lib/tour-airports'
import { tourSourceById } from '@/lib/tour-sources'
import {
  cardDeparture,
  discountPercent,
  formatDay,
  formatMonth,
  type HotelTerm,
  type TourCard,
  type TourFilters,
} from '@/lib/tour-filters'
import { nightCount, priceCzk } from './deals-section'
import { DealCardImage } from './deal-card-image'
import { ReviewChips } from './review-chips'

/**
 * Řádková karta zájezdu (každý hotel jednou, nejlevnější termín po filtru)
 * a její rozbalení termínů. Klientská komponenta kvůli rozbalení; velký
 * markup karet v klientu zároveň šetří HTML (v RSC by byl dvakrát).
 * Rozvržení karty podle makety E5, rozbalení podle makety A + B
 * (rozhodnutí uživatele 23. 10. 2026): klik na „nejlevnější z N termínů“
 * vysune pod kartu tabulku termínů (odlet, délka, letiště, cena), nejlevnější
 * podbarvený, přepínač „podle filtru / všechny“; nad 12 termínů se nejdřív
 * vyberou měsíce s cenou od (B). Řádek vede na stránku hotelu u cestovky
 * (/go/zajezd) — odkaz na konkrétní termín feedy nesou, ale neukládáme ho.
 */

/** Práh, od kterého se termíny nejdřív skládají po měsících (maketa B). */
const MONTHS_THRESHOLD = 12
/** Nejvíc řádků tabulky najednou. */
const MAX_ROWS = 40
const WEEKDAYS = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so']

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function weekday(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? ''
}
/** „so 31. 10. – so 7. 11. 2026“ (rok jen na konci; při přelomu roku u obou). */
function termRange(t: HotelTerm): string {
  const end = addDays(t.date, t.nights)
  const sameYear = t.date.slice(0, 4) === end.slice(0, 4)
  const start = formatDay(t.date)
  return `${weekday(t.date)} ${sameYear ? start.replace(/ \d{4}$/, '') : start} – ${weekday(end)} ${formatDay(end)}`
}
function airportsLabel(airports: string[]): string {
  return airports.map((a) => airportByName(a)?.name ?? a).join(', ')
}

/** Hvězdy hotelu — maska `.star-glyph` jako u hodnocení. */
export function Stars({
  count,
  muted = false,
  label,
}: {
  count: number
  /** Šedé hvězdy — „bez kategorie“ ve filtru (stejný rytmus řádku, jiný význam). */
  muted?: boolean
  label?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-px align-[1px] ${muted ? 'text-line-strong' : 'text-star'}`}
      aria-label={label ?? `${count} hvězd`}
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

function termCountLabel(count: number): string {
  if (count <= 1) return ''
  if (count <= 4) return `${count} termíny`
  return `${count} termínů`
}

export function TourRow({
  card,
  filters,
  terms,
}: {
  card: TourCard
  filters: TourFilters
  terms: { all: HotelTerm[]; filtered: HotelTerm[] }
}) {
  const [open, setOpen] = useState(false)
  const termsId = `terms-${card.offer.id}`
  const { offer } = card
  const discount = discountPercent(card)
  const departure = cardDeparture(card, filters)
  const place = offer.area || offer.place || null
  const onMap = offer.lat !== null && offer.lng !== null
  // Rozvržení podle makety E5 (23. 10. 2026): řádek „kde“ (letovisko + Na mapě),
  // řádek „co“ (strava · noci · odlet), krátká linka a chipy recenzí; údaje
  // termínu („nejlevnější z N termínů“) u ceny, které se týkají. Karta je
  // <article> s odkazem roztaženým přes celou plochu (after:inset-0): uvnitř
  // <a> by další odkazy nebyly platný HTML.
  return (
    <article className="group relative grid grid-cols-[132px_1fr] gap-x-4 gap-y-2 rounded-xl border border-line bg-white p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(26,63,108,0.12)] md:grid-cols-[196px_1fr_auto] md:items-center md:gap-x-5">
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
          <a
            href={`/go/zajezd/${offer.id}`}
            target="_blank"
            rel="nofollow sponsored noopener"
            className="text-ink after:absolute after:inset-0 after:rounded-xl hover:no-underline"
          >
            {offer.title}
          </a>
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
        {(place || onMap) && (
          <p className="flex flex-wrap items-center gap-x-2 text-small text-ink-2">
            {place && <span>{place}</span>}
            {place && onMap && (
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>
            )}
            {onMap && (
              <a
                href={`#hotel-${offer.id}`}
                className="relative z-10 inline-flex items-center gap-1 text-brand"
                aria-label={`${offer.title} na mapě`}
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Na mapě
              </a>
            )}
          </p>
        )}
        <p className="text-small text-ink-2">
          {[
            BOARD_LABELS[offer.board] ?? null,
            nightCount(card.nights),
            `odlet ${formatDay(card.date)} ${departure.label}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          {departure.near && (
            <span className="ml-1.5 inline-block rounded-md bg-surface-2 px-1.5 py-0.5 align-[1px] text-meta font-semibold text-ink-2">
              okolní letiště
            </span>
          )}
        </p>
        <span aria-hidden="true" className="mt-1.5 mb-0.5 block h-px w-10 bg-line-strong" />
        <ReviewChips title={offer.title} area={place} inviaUrl={offer.inviaUrl} />
      </div>
      <div className="col-span-2 flex items-center gap-3 border-t border-line pt-2 tabular-nums md:col-span-1 md:flex-col md:items-end md:gap-0.5 md:border-0 md:pt-0 md:pl-2">
        {discount > 0 && <DiscountBadge percent={discount} className="shrink-0 md:mb-1" />}
        {/* Na mobilu drží cena, původní cena a termíny pohromadě ve sloupci
            vedle tlačítka; od md se blok rozpustí (contents) do pravého sloupce. */}
        <div className="flex min-w-0 flex-col gap-0.5 md:contents">
          <span className="font-heading text-title leading-none font-semibold whitespace-nowrap text-brand-deep transition-colors group-hover:text-brand">
            {priceCzk(card.price)}
          </span>
          {card.originalPrice && (
            <s className="text-label whitespace-nowrap text-ink-3">
              {priceCzk(card.originalPrice)}
            </s>
          )}
          {terms.all.length > 1 ? (
            // Rozbalení termínů (maketa A, u mnoha termínů po měsících — B):
            // tlačítko stojí nad roztaženým odkazem karty (z-10).
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={termsId}
              className="relative z-10 inline-flex items-center gap-1 text-label text-brand hover:underline"
            >
              nejlevnější z{' '}
              {termCountLabel((terms.filtered.length > 0 ? terms.filtered : terms.all).length)}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className="text-label text-ink-3">za osobu</span>
          )}
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-brand px-4 py-2 font-heading text-label font-bold whitespace-nowrap text-white md:mt-2 md:ml-0">
          Zobrazit zájezd
        </span>
      </div>
      {open && (
        <TermsPanel
          id={termsId}
          card={card}
          terms={terms}
          href={`/go/zajezd/${offer.id}`}
          onClose={() => setOpen(false)}
        />
      )}
    </article>
  )
}

function TermsPanel({
  id,
  card,
  terms,
  href,
  onClose,
}: {
  id: string
  card: TourCard
  terms: { all: HotelTerm[]; filtered: HotelTerm[] }
  href: string
  onClose: () => void
}) {
  const hasFiltered = terms.filtered.length > 0 && terms.filtered.length < terms.all.length
  const [mode, setMode] = useState<'filter' | 'all'>(terms.filtered.length > 0 ? 'filter' : 'all')
  const list = mode === 'filter' && terms.filtered.length > 0 ? terms.filtered : terms.all
  const byMonth = useMemo(() => {
    const m = new Map<string, { from: number; count: number }>()
    for (const t of list) {
      const ym = t.date.slice(0, 7)
      const cur = m.get(ym)
      if (cur) {
        cur.count++
        cur.from = Math.min(cur.from, t.price)
      } else m.set(ym, { from: t.price, count: 1 })
    }
    return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
  }, [list])
  const grouped = list.length > MONTHS_THRESHOLD
  const [month, setMonth] = useState<string>(card.date.slice(0, 7))
  const activeMonth = byMonth.some(([ym]) => ym === month) ? month : (byMonth[0]?.[0] ?? '')
  const monthRows = grouped ? list.filter((t) => t.date.slice(0, 7) === activeMonth) : list
  // Blue Style vypisuje odlety denně v délkách 3–14 nocí (stovky kombinací):
  // tabulka se omezí a zbytek si návštěvník zúží filtrem délky nebo u cestovky.
  const rows = monthRows.slice(0, MAX_ROWS)
  const hiddenRows = monthRows.length - rows.length
  const isBest = (t: HotelTerm) => t.date === card.date && t.price === card.price

  return (
    // relative z-10: celý panel leží NAD roztaženým odkazem karty (after:inset-0),
    // jinak by kliky na přepínače otevíraly zájezd.
    <div id={id} className="relative z-10 col-span-2 mt-3 border-t border-line pt-3 md:col-span-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-label text-ink-3">
        <span>
          <b className="font-semibold text-ink">{termCountLabel(list.length) || '1 termín'}</b> ·
          ceny za osobu při dvou dospělých
        </span>
        <span className="flex items-center gap-2">
          {hasFiltered && (
            <span
              className="inline-flex rounded-full border border-line p-0.5"
              role="group"
              aria-label="Rozsah termínů"
            >
              {(
                [
                  ['filter', `Podle filtru (${terms.filtered.length})`],
                  ['all', `Všechny (${terms.all.length})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`rounded-full px-2.5 py-0.5 text-meta ${
                    mode === value
                      ? 'bg-brand-tint font-semibold text-brand-deep'
                      : 'text-ink-2 hover:text-brand'
                  }`}
                >
                  {label}
                </button>
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="relative z-10 text-meta text-ink-3 hover:text-brand"
            aria-label="Sbalit termíny"
          >
            Sbalit
          </button>
        </span>
      </div>
      {grouped && (
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Měsíc odletu">
          {byMonth.map(([ym, { from, count }]) => (
            <button
              key={ym}
              type="button"
              onClick={() => setMonth(ym)}
              aria-pressed={ym === activeMonth}
              className={`relative z-10 rounded-[10px] border px-3 py-1.5 text-left ${
                ym === activeMonth
                  ? 'border-brand bg-brand-tint'
                  : 'border-line hover:border-line-strong'
              }`}
            >
              <span
                className={`block font-heading text-label font-semibold ${ym === activeMonth ? 'text-brand-deep' : 'text-ink'}`}
              >
                {formatMonth(ym)}
              </span>
              <span className="text-meta text-ink-3">
                od {priceCzk(from)} · {termCountLabel(count) || '1 termín'}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-small tabular-nums">
          <thead>
            <tr className="text-left text-caps-sm font-semibold tracking-[0.06em] text-ink-3 uppercase">
              <th className="px-2 py-1.5 font-semibold">Odlet</th>
              <th className="px-2 py-1.5 font-semibold">Délka</th>
              <th className="px-2 py-1.5 font-semibold">Letiště</th>
              <th className="px-2 py-1.5 text-right font-semibold">Cena</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const best = isBest(t)
              return (
                <tr
                  key={`${t.date}|${t.nights}|${t.price}`}
                  className={`border-t border-line ${best ? 'bg-brand-tint' : ''}`}
                >
                  <td className="px-2 py-1.5 whitespace-nowrap text-ink">
                    {termRange(t)}
                    {best && (
                      <span className="ml-2 rounded-full bg-ok-bg px-1.5 py-0.5 align-[1px] text-caps-sm font-semibold tracking-[0.06em] text-ok uppercase">
                        nejlevnější
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-ink-2">
                    {nightCount(t.nights)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-ink-2">
                    {airportsLabel(t.airports)}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <span className="font-heading text-body font-semibold text-brand-deep">
                      {priceCzk(t.price)}
                    </span>
                    {t.originalPrice && (
                      <s className="ml-2 text-label text-ink-3">{priceCzk(t.originalPrice)}</s>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <a
                      href={href}
                      target="_blank"
                      rel="nofollow sponsored noopener"
                      className="relative z-10 inline-block rounded-full border border-line-strong px-2.5 py-1 font-heading text-meta font-bold text-brand hover:border-brand hover:no-underline"
                    >
                      Vybrat
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {hiddenRows > 0 && (
          <p className="px-2 pt-2 text-label text-ink-3">
            … a dalších {termCountLabel(hiddenRows) || '1 termín'} v tomto měsíci. Zúžit je jde
            filtrem „Termín a délka“ nahoře, nebo rovnou u cestovky.
          </p>
        )}
      </div>
    </div>
  )
}
