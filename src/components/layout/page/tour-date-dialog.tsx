'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DEFAULT_NIGHTS,
  NIGHTS_PRESETS,
  dateSummary,
  formatMonth,
  nightsEqual,
  nightsSummary,
  tourFiltersHref,
  type FacetOption,
  type TourFilters,
} from '@/lib/tour-filters'

/**
 * Pole „Termín a délka“ v horním panelu filtrů zájezdů (makety D/E): jediný
 * dialog pro KDY (měsíce jedním klepnutím, nebo přesný rozsah dnů
 * v kalendáři s tečkami u dní s odletem) a JAK DLOUHO (předvolby délky
 * + posuvník). Výsledek se potvrzuje tlačítkem „Použít“, které jen navede
 * na novou adresu — filtr zůstává v URL jako u všech ostatních.
 *
 * Klientská komponenta jen kvůli interakci (výběr rozsahu klikáním, posuvník);
 * data (měsíce s počty, dny odletů) počítá server a posílá v props.
 */

interface Props {
  basePath: string
  filters: TourFilters
  /** Měsíce dnes + 12 s počtem hotelů při ostatních filtrech. */
  months: FacetOption<string>[]
  /** Dny s odletem (YYYY-MM-DD) při ostatních filtrech — tečky v kalendáři. */
  departureDays: string[]
  /** Dnešek v Praze (YYYY-MM-DD) — minulé dny jsou šedé. */
  today: string
}

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

function ymOf(iso: string): string {
  return iso.slice(0, 7)
}
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
/** Dny měsíce rozložené do týdnů od pondělí (null = prázdné pole). */
function monthGrid(ym: string): (string | null)[] {
  const [y, m] = ym.split('-').map(Number)
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return cells
}

export function TourDateDialog({ basePath, filters, months, departureDays, today }: Props) {
  const router = useRouter()
  const id = useId()
  const [open, setOpen] = useState(false)
  // Rozpracovaný výběr — do adresy jde až po „Použít“.
  const [mesice, setMesice] = useState<string[]>(filters.mesice)
  const [od, setOd] = useState<string | null>(filters.od)
  const [doDate, setDoDate] = useState<string | null>(filters.do)
  const [noci, setNoci] = useState<[number, number] | null>(filters.noci)
  const [view, setView] = useState<string>(
    filters.od ? ymOf(filters.od) : (filters.mesice[0] ?? ymOf(today)),
  )
  const rootRef = useRef<HTMLDivElement>(null)

  // Nová adresa (jiný filtr) nuluje rozpracovaný stav tím, že rodič mění `key`
  // komponenty (viz ToursSection) — žádný effect se setState.
  // Zavřít klikem mimo a klávesou Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const days = useMemo(() => new Set(departureDays), [departureDays])
  const draft: TourFilters = { ...filters, mesice, od, do: doDate, noci }

  const pickDay = (iso: string) => {
    // První klik = začátek, druhý = konec (dřívější datum vždy začátek); třetí začíná znovu.
    if (!od || (od && doDate)) {
      setOd(iso)
      setDoDate(null)
    } else if (iso < od) {
      setDoDate(od)
      setOd(iso)
    } else {
      setDoDate(iso)
    }
    setMesice([])
  }
  const toggleMonth = (ym: string) => {
    setOd(null)
    setDoDate(null)
    setMesice((prev) => (prev.includes(ym) ? prev.filter((m) => m !== ym) : [...prev, ym].sort()))
  }
  const anytime = mesice.length === 0 && !od
  const apply = () => {
    setOpen(false)
    router.push(tourFiltersHref(basePath, filters, { mesice, od, do: doDate, noci }), {
      scroll: false,
    })
  }
  const inRange = (iso: string) => {
    if (od && doDate) return iso >= od && iso <= doDate
    if (od) return iso === od
    return mesice.includes(ymOf(iso))
  }

  const summary = `${dateSummary(filters)} · ${nightsSummary(filters.noci)}`
  const minYm = ymOf(today)
  const maxYm = addMonths(minYm, 11)

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className={`flex w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-2 text-left transition-colors ${
          open
            ? 'border-brand ring-[3px] ring-brand/15'
            : 'border-line-strong hover:border-brand/40'
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-caps-sm font-semibold tracking-[0.04em] text-ink-3 uppercase">
            Termín a délka
          </span>
          <span className="block truncate text-small font-semibold text-ink">{summary}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={2.5} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={`${id}-panel`}
          role="dialog"
          aria-label="Termín a délka pobytu"
          className="absolute top-full left-0 z-30 mt-2 w-[min(880px,calc(100vw-32px))] rounded-2xl md:right-0 md:left-auto border border-line bg-white p-5 shadow-[0_14px_40px_rgba(26,63,108,0.18)]"
        >
          <div className="grid gap-6 md:grid-cols-[1fr_1fr_250px]">
            {[view, addMonths(view, 1)].map((ym, i) => (
              <div key={ym}>
                <div className="mb-2 flex items-center justify-between">
                  {i === 0 ? (
                    <button
                      type="button"
                      onClick={() => setView(addMonths(view, -1))}
                      disabled={view <= minYm}
                      aria-label="Předchozí měsíc"
                      className="rounded-full p-1 text-ink-3 hover:bg-surface disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="w-6" />
                  )}
                  <span className="font-heading text-label font-semibold tracking-[0.06em] text-ink-2 uppercase">
                    {formatMonth(ym)}
                  </span>
                  {i === 1 ? (
                    <button
                      type="button"
                      onClick={() => setView(addMonths(view, 1))}
                      disabled={addMonths(view, 1) >= maxYm}
                      aria-label="Další měsíc"
                      className="rounded-full p-1 text-ink-3 hover:bg-surface disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="w-6" />
                  )}
                </div>
                <div className="grid grid-cols-7 gap-0.5 text-center text-label">
                  {WEEKDAYS.map((w) => (
                    <span key={w} className="py-1 text-meta text-ink-3">
                      {w}
                    </span>
                  ))}
                  {monthGrid(ym).map((iso, idx) =>
                    iso ? (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => pickDay(iso)}
                        disabled={iso < today}
                        aria-pressed={inRange(iso)}
                        className={`relative rounded-md py-1.5 tabular-nums disabled:text-line-strong ${
                          iso === od || iso === doDate
                            ? 'bg-brand font-bold text-white'
                            : inRange(iso)
                              ? 'bg-brand-tint text-brand-deep'
                              : days.has(iso)
                                ? 'bg-surface text-ink hover:bg-brand-tint'
                                : 'text-ink-2 hover:bg-surface'
                        }`}
                      >
                        {Number(iso.slice(8))}
                        {days.has(iso) && iso >= today && (
                          <span
                            aria-hidden="true"
                            className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                              iso === od || iso === doDate ? 'bg-white' : 'bg-ok'
                            }`}
                          />
                        )}
                      </button>
                    ) : (
                      <span key={`e${idx}`} />
                    ),
                  )}
                </div>
              </div>
            ))}

            <div>
              <p className="mb-2 font-heading text-label font-semibold tracking-[0.06em] text-ink-2 uppercase">
                Kdy
              </p>
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {months.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => toggleMonth(m.value)}
                    disabled={m.count === 0}
                    aria-pressed={mesice.includes(m.value)}
                    title={`${formatMonth(m.value)} · ${m.count} hotelů`}
                    className={`rounded-lg border px-1 py-1.5 text-label disabled:text-line-strong ${
                      mesice.includes(m.value)
                        ? 'border-brand-tint bg-brand-tint font-semibold text-brand-deep'
                        : 'border-line-strong text-ink hover:border-brand/40'
                    }`}
                  >
                    {formatMonth(m.value, true)}
                  </button>
                ))}
              </div>
              <label className="mb-4 flex cursor-pointer items-center gap-2 text-label text-ink-2">
                <input
                  type="checkbox"
                  checked={anytime}
                  onChange={() => {
                    setMesice([])
                    setOd(null)
                    setDoDate(null)
                  }}
                  className="h-4 w-4 accent-brand"
                />
                Kdykoliv (bez omezení)
              </label>

              <p className="mb-2 font-heading text-label font-semibold tracking-[0.06em] text-ink-2 uppercase">
                Délka pobytu
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {NIGHTS_PRESETS.map((p) => {
                  const active = nightsEqual(noci, p.value)
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setNoci(p.value)}
                      aria-pressed={active}
                      className={`rounded-lg border px-1 py-1.5 text-center leading-tight ${
                        active
                          ? 'border-brand-tint bg-brand-tint text-brand-deep'
                          : 'border-line-strong text-ink hover:border-brand/40'
                      }`}
                    >
                      <span className="block text-label font-semibold">{p.label}</span>
                      <span className={`block text-meta ${active ? 'text-brand' : 'text-ink-3'}`}>
                        {p.sub}
                      </span>
                    </button>
                  )
                })}
              </div>
              <NightsSlider value={noci} onChange={setNoci} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-label text-ink-3">
            <span>
              Tečka = den s odletem. Vybráno:{' '}
              <b className="text-ink">
                {dateSummary(draft)} · {nightsSummary(noci)}
              </b>
            </span>
            <span className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setMesice([])
                  setOd(null)
                  setDoDate(null)
                  setNoci(DEFAULT_NIGHTS)
                }}
                className="font-semibold text-brand"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={apply}
                className="rounded-full bg-brand px-5 py-2 font-heading text-label font-bold text-white hover:bg-brand-deep"
              >
                Použít
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Dvojitý posuvník nocí (2–21) nad předvolbami — doladění přesného rozsahu. */
function NightsSlider({
  value,
  onChange,
}: {
  value: [number, number] | null
  onChange: (v: [number, number] | null) => void
}) {
  const [lo, hi] = value ?? [2, 21]
  const min = 2
  const max = 21
  const pct = (n: number) => ((Math.min(n, max) - min) / (max - min)) * 100
  return (
    <div className="mt-3">
      <div className="relative h-7">
        <div className="absolute top-3 right-0 left-0 h-1 rounded bg-surface-2" />
        <div
          className="absolute top-3 h-1 rounded bg-brand"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={Math.min(lo, max)}
          aria-label="Nejméně nocí"
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          className="range-thumb absolute top-0 left-0 h-7 w-full"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={Math.min(hi, max)}
          aria-label="Nejvíce nocí"
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          className="range-thumb absolute top-0 left-0 h-7 w-full"
        />
      </div>
      <div className="flex justify-between text-meta text-ink-3 tabular-nums">
        <span>{lo} nocí</span>
        <span>{hi >= max ? `${max}+ nocí` : `${hi} nocí`}</span>
      </div>
    </div>
  )
}
