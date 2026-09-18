/**
 * Časové okno klouzavého průměru klimatu a jeho rozdělení na dotazy Meteostatu.
 *
 * Leží v `lib` bez závislosti na Payloadu, aby šlo rozdělení jednotkově testovat:
 * počet dotazů na místo rozhoduje o měsíční kvótě RapidAPI (500), takže chyba
 * v tomhle výpočtu tiše spálí kvótu pro celý zbytek měsíce.
 */

/** Délka klouzavého okna v letech (posledních N UKONČENÝCH let). */
export const WINDOW_YEARS = 20
/** Meteostat pouští nejvýš 3 650 dní na jeden dotaz → okno se dělí na části. */
export const MAX_DAYS_PER_REQUEST = 3650
/**
 * Kolik dotazů smí jedno místo stát. Dvacet let je 7 305 dní (přestupné roky),
 * tedy o pár dní víc než dva plné dotazy — třetí dotaz by kvůli 5 dnům
 * zdvojnásobil… resp. o polovinu zvedl spotřebu kvóty (18. 9. 2026: 174 míst
 * × 3 = 522 > 500, posledních 15 míst skončilo na 429). Začátek okna se proto
 * o ty dny posune; leden prvního roku pak nemá 90 % dní a do průměru se
 * nepočítá — ten měsíc je z 19 let místo 20, což je v šumu dat.
 */
export const MAX_REQUESTS_PER_PLACE = 2

const DAY_MS = 86_400_000

export const ymd = (d: Date): string => d.toISOString().slice(0, 10)

export type DateRange = { start: string; end: string }

/**
 * Okno končí POSLEDNÍM UKONČENÝM rokem — probíhající rok by měl jen část
 * měsíců a zkreslil by průměry (v srpnu chybí celá zima). Začátek je 1. leden
 * prvního roku okna, posunutý tak, aby se okno vešlo do MAX_REQUESTS_PER_PLACE.
 */
export function climateWindow(now: Date): {
  from: Date
  to: Date
  firstYear: number
  lastYear: number
} {
  const lastYear = now.getUTCFullYear() - 1
  const firstYear = lastYear - WINDOW_YEARS + 1
  const to = new Date(Date.UTC(lastYear, 11, 31))
  const nominalFrom = new Date(Date.UTC(firstYear, 0, 1))
  const earliestFrom = new Date(
    to.getTime() - (MAX_REQUESTS_PER_PLACE * MAX_DAYS_PER_REQUEST - 1) * DAY_MS,
  )
  const from = nominalFrom < earliestFrom ? earliestFrom : nominalFrom
  return { from, to, firstYear, lastYear }
}

/** Rozsahy dní pokrývající okno, každý pod limitem API (včetně obou krajů). */
export function requestRanges(from: Date, to: Date): DateRange[] {
  const ranges: DateRange[] = []
  const cursor = new Date(from)
  while (cursor <= to) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + MAX_DAYS_PER_REQUEST - 1)
    ranges.push({ start: ymd(cursor), end: ymd(chunkEnd < to ? chunkEnd : to) })
    cursor.setUTCDate(cursor.getUTCDate() + MAX_DAYS_PER_REQUEST)
  }
  return ranges
}
