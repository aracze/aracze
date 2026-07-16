import { cache } from 'react'

interface FrankfurterResponse {
  base: string
  date: string
  rates: Record<string, number>
}

async function fetchExchangeRateRaw(
  currencyCode: string,
): Promise<{ rate: number; base: string } | null> {
  if (!currencyCode || currencyCode === 'CZK') return null

  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${encodeURIComponent(currencyCode)}&to=CZK`,
      { next: { revalidate: 86400 } }, // cache for 24h
    )
    if (!res.ok) return null

    const data: FrankfurterResponse = await res.json()
    const rate = data.rates?.CZK
    if (!rate) return null

    return { rate, base: currencyCode }
  } catch {
    return null
  }
}

export const fetchExchangeRate = cache(fetchExchangeRateRaw)
