import { cache } from 'react'
import type { ExchangeRates } from './currency-amounts'

/**
 * Kurzy měn jako JEDNA tabulka „Kč za jednotku měny“ pro všechny stránky:
 * kartu kurzu v panelu, blok „Aktuální měna“ i přepočet částek v textu
 * (currency-amounts.ts), kde se na jedné stránce potkává měna země s eurem
 * či dolarem.
 *
 * Zdroje (všechny bez klíče, cache 24 h — externí API mimo CMS, v dev povolená):
 * 1. ČNB denní kurzovní lístek (31 měn, vyhlašuje se v pracovní dny ve 14:30).
 * 2. ČNB kurzy ostatních měn (měsíční, ~150 měn: EGP, MAD, VND, PEN, LKR, KGS…).
 *    Doplňují jen to, co v denním lístku není.
 * 3. Frankfurter (data ECB, 29 měn) — záloha, když ČNB denní lístek nejde načíst.
 *
 * Řádky ČNB: `země|měna|množství|kód|kurz`, kurz je za `množství` jednotek
 * (JPY, HUF, IDR… po 100), desetinná čárka. Web tak ukazuje oficiální kurz ČNB,
 * který český čtenář zná z banky i ze zpráv.
 */

const CNB_DAILY_URL =
  'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt'
const CNB_OTHER_URL =
  'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-ostatnich-men/kurzy-ostatnich-men/kurzy.txt'
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest'

const FETCH_INIT: RequestInit & { next: { revalidate: number } } = {
  // Timeout, ať se render nezasekne na pomalém/nedostupném upstreamu —
  // abort spadne do catch a vrátí null (cache 24h zůstává zachovaná).
  signal: AbortSignal.timeout(10_000),
  next: { revalidate: 86400 },
}

/** Text lístku ČNB → tabulka Kč za jednotku. Prázdný/nečitelný vstup → null. */
export function parseCnbRates(text: string): ExchangeRates | null {
  const table: ExchangeRates = {}
  // První řádek je datum a číslo lístku, druhý hlavička sloupců.
  for (const line of text.split('\n').slice(2)) {
    const cols = line.trim().split('|')
    if (cols.length < 5) continue
    const amount = Number(cols[2])
    const code = cols[3]
    const rate = Number(cols[4].replace(',', '.'))
    if (!/^[A-Z]{3}$/.test(code) || !(amount > 0) || !(rate > 0)) continue
    table[code] = rate / amount
  }
  return Object.keys(table).length > 0 ? table : null
}

async function fetchCnbRates(url: string): Promise<ExchangeRates | null> {
  try {
    const res = await fetch(url, FETCH_INIT)
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
async function fetchFrankfurterRates(): Promise<ExchangeRates | null> {
  try {
    const res = await fetch(FRANKFURTER_URL, FETCH_INIT)
    if (!res.ok) return null
    const data: FrankfurterResponse = await res.json()
    const czkPerEur = data.rates?.CZK
    if (!czkPerEur) return null
    const table: ExchangeRates = { EUR: czkPerEur }
    for (const [code, perEur] of Object.entries(data.rates)) {
      if (code === 'CZK' || !(perEur > 0)) continue
      table[code] = czkPerEur / perEur
    }
    return table
  } catch {
    return null
  }
}

async function fetchExchangeRatesRaw(): Promise<ExchangeRates | null> {
  const [daily, other] = await Promise.all([
    fetchCnbRates(CNB_DAILY_URL),
    fetchCnbRates(CNB_OTHER_URL),
  ])
  const primary = daily ?? (await fetchFrankfurterRates())
  if (!primary && !other) return null
  // Denní lístek má přednost před měsíčním (u měn, které jsou v obou).
  return { ...(other ?? {}), ...(primary ?? {}) }
}

export const fetchExchangeRates = cache(fetchExchangeRatesRaw)

/** Kurz jedné měny (Kč za jednotku). Pro CZK a měny mimo tabulku null. */
export async function fetchExchangeRate(
  currencyCode: string,
): Promise<{ rate: number; base: string } | null> {
  if (!currencyCode || currencyCode === 'CZK') return null
  const rate = (await fetchExchangeRates())?.[currencyCode]
  return rate ? { rate, base: currencyCode } : null
}
