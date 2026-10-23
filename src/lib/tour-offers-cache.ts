import type { TourOffer } from '@/types/payload'

/**
 * Paměťová cache nabídek zájezdů podle země — SAMOSTATNÝ modul bez závislostí,
 * protože ji sdílí datová vrstva webu (lib/payload.ts) i sync endpoint
 * (endpoints/syncTourOffers.ts, importovaný z payload.config); import
 * lib/payload z endpointu by udělal kruh config → endpoint → lib/payload → db → config.
 *
 * Proč paměť a ne Next data cache: řádky nesou všechny termíny a velké země
 * (Španělsko 4,4 MB, Maledivy 3,2 MB) přesahují limit 2 MB, který Next tiše
 * neuloží. Web běží v jednom kontejneru a sync v témže procesu, takže po
 * zápisu stačí mapu vyprázdnit; TTL je jen pojistka.
 */
const TTL_MS = 6 * 60 * 60 * 1000
const memo = new Map<string, { at: number; offers: TourOffer[] }>()

export function getCachedTourOffers(countryCode: string): TourOffer[] | null {
  const hit = memo.get(countryCode)
  if (!hit || Date.now() - hit.at >= TTL_MS) return null
  return hit.offers
}

export function setCachedTourOffers(countryCode: string, offers: TourOffer[]): void {
  memo.set(countryCode, { at: Date.now(), offers })
}

export function invalidateTourOffersCache(): void {
  memo.clear()
}
