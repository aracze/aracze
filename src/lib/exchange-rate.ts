import { cache } from 'react'
import type { ExchangeRates, RateSource } from './currency-amounts'

/**
 * Kurzy měn jako JEDNA tabulka „Kč za jednotku měny“ pro všechny stránky:
 * kartu kurzu v panelu, blok „Aktuální měna“ i přepočet částek v textu
 * (currency-amounts.ts), kde se na jedné stránce potkává měna země s eurem
 * či dolarem. K číslu jde i datum platnosti (do bubliny u částky) a zdroj.
 *
 * Zdroje (všechny bez klíče, cache 24 h — externí API mimo CMS, v dev povolená):
 * 1. ČNB denní kurzovní lístek (31 měn, vyhlašuje se v pracovní dny ve 14:30).
 * 2. ČNB kurzy ostatních měn (měsíční, ~150 měn: EGP, MAD, VND, PEN, LKR, KGS…).
 *    Doplňují jen to, co v denním lístku není.
 * 3. Frankfurter (data ECB, 29 měn) — záloha, když ČNB denní lístek nejde načíst.
 *
 * Řádky ČNB: první řádek `18.09.2026 #181`, druhý hlavička, dál
 * `země|měna|množství|kód|kurz`; kurz je za `množství` jednotek (JPY, HUF,
 * IDR… po 100), desetinná čárka. Web tak ukazuje oficiální kurz ČNB, který
 * český čtenář zná z banky i ze zpráv.
 */

const CNB_DAILY_URL =
  'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt'
const CNB_OTHER_URL =
  'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-ostatnich-men/kurzy-ostatnich-men/kurzy.txt'
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest'

/**
 * Volby fetchu — POKAŽDÉ nové: `AbortSignal.timeout` začne odpočítávat hned
 * při vytvoření, sdílený signál na úrovni modulu by po 10 s od startu zůstal
 * navždy „aborted“ a každé další stažení by selhalo okamžitě. Timeout chrání
 * render před pomalým upstreamem (abort spadne do catch → null, cache 24 h
 * zůstává zachovaná).
 */
function fetchInit(): RequestInit & { next: { revalidate: number } } {
  return { signal: AbortSignal.timeout(10_000), next: { revalidate: 86400 } }
}

/** Jeden načtený lístek: kurzy a datum platnosti společné pro všechny jeho měny. */
export type RateSheet = { rates: Record<string, number>; date: string | null }

/** „18.09.2026“ i „2026-09-18“ → „18. 9. 2026“ (česky, bez úvodních nul). */
export function formatRateDate(raw: string): string | null {
  const cz = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (cz) return `${Number(cz[1])}. ${Number(cz[2])}. ${cz[3]}`
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${Number(iso[3])}. ${Number(iso[2])}. ${iso[1]}`
  return null
}

/** Text lístku ČNB → kurzy Kč za jednotku + datum z hlavičky. Nečitelný vstup → null. */
export function parseCnbRates(text: string): RateSheet | null {
  const lines = text.split('\n')
  const rates: Record<string, number> = {}
  // První řádek je datum a číslo lístku, druhý hlavička sloupců.
  for (const line of lines.slice(2)) {
    const cols = line.trim().split('|')
    if (cols.length < 5) continue
    const amount = Number(cols[2])
    const code = cols[3]
    const rate = Number(cols[4].replace(',', '.'))
    if (!/^[A-Z]{3}$/.test(code) || !(amount > 0) || !(rate > 0)) continue
    rates[code] = rate / amount
  }
  if (Object.keys(rates).length === 0) return null
  return { rates, date: formatRateDate(lines[0]?.trim() ?? '') }
}

async function fetchCnbRates(url: string): Promise<RateSheet | null> {
  try {
    const res = await fetch(url, fetchInit())
    if (!res.ok) return null
    return parseCnbRates(await res.text())
  } catch {
    return null
  }
}

interface FrankfurterResponse {
  base: string
  date: string
  rates: Record<string, number>
}

/** Frankfurter kótuje vše k euru — křížem přes CZK/EUR vznikne Kč za jednotku. */
async function fetchFrankfurterRates(): Promise<RateSheet | null> {
  try {
    const res = await fetch(FRANKFURTER_URL, fetchInit())
    if (!res.ok) return null
    const data: FrankfurterResponse = await res.json()
    const czkPerEur = data.rates?.CZK
    if (!czkPerEur) return null
    const rates: Record<string, number> = { EUR: czkPerEur }
    for (const [code, perEur] of Object.entries(data.rates)) {
      if (code === 'CZK' || !(perEur > 0)) continue
      rates[code] = czkPerEur / perEur
    }
    return { rates, date: formatRateDate(String(data.date ?? '')) }
  } catch {
    return null
  }
}

/**
 * Slije lístky do tabulky; pozdější lístek v pořadí přepisuje dřívější.
 * Datum i zdroj jdou s každou měnou zvlášť (měsíční lístek ČNB má jiné datum
 * než denní a při záloze ECB zůstávají jeho měny ČNB).
 */
export function mergeRateSheets(
  sheets: { sheet: RateSheet | null; source: RateSource }[],
): ExchangeRates | null {
  const table: ExchangeRates = { rates: {}, dates: {}, sources: {} }
  for (const { sheet, source } of sheets) {
    if (!sheet) continue
    for (const [code, rate] of Object.entries(sheet.rates)) {
      table.rates[code] = rate
      table.sources[code] = source
      if (sheet.date) table.dates[code] = sheet.date
      else delete table.dates[code]
    }
  }
  return Object.keys(table.rates).length > 0 ? table : null
}

async function fetchExchangeRatesRaw(): Promise<ExchangeRates | null> {
  const [daily, other] = await Promise.all([
    fetchCnbRates(CNB_DAILY_URL),
    fetchCnbRates(CNB_OTHER_URL),
  ])
  const monthly = { sheet: other, source: 'ČNB' as const }
  if (daily) return mergeRateSheets([monthly, { sheet: daily, source: 'ČNB' }])
  // Bez denního lístku ČNB: ECB jako hlavní, měsíční „ostatní měny“ ČNB doplní zbytek.
  const ecb = await fetchFrankfurterRates()
  return mergeRateSheets([monthly, { sheet: ecb, source: 'ECB' }])
}

export const fetchExchangeRates = cache(fetchExchangeRatesRaw)

/** Kurz jedné měny (Kč za jednotku). Pro CZK a měny mimo tabulku null. */
export async function fetchExchangeRate(
  currencyCode: string,
): Promise<{ rate: number; base: string } | null> {
  if (!currencyCode || currencyCode === 'CZK') return null
  const rate = (await fetchExchangeRates())?.rates[currencyCode]
  return rate ? { rate, base: currencyCode } : null
}
