/**
 * Odkazy na recenze hotelů u zájezdů — krok 1 (23. 10. 2026): odkaz na
 * vyhledávání Tripadvisoru podle názvu hotelu a letoviska. Bez API, bez
 * ukládání čehokoli z Tripadvisoru (jeho podmínky dovolují uchovat jen
 * Location ID) — návštěvník přistane na výsledcích hledání, u většiny hotelů
 * je první výsledek ten správný. Krok 2 (přímý odkaz přes Location ID,
 * zdarma do 1 000 položek) až podle zájmu v GA4.
 *
 * Invia zatím není: hotel nemá veřejné hledání podle názvu a odhad adresy
 * `/hotel/egypt/<letovisko>/<hotel>/` selhal u 10 z 16 zkoušených hotelů
 * (23. 10. 2026) — odkazy na 404 by byly horší než žádné. Řešení do
 * budoucna: spárovat hotely s adresami z feedu Invie při denním syncu.
 */
/**
 * Hodnocení na Mapách Google přes oficiální „Maps URLs“ (hledání podle
 * názvu a letoviska) — bez klíče, bez API a bez podmínek na ukládání.
 * Jednoznačná shoda otevře rovnou místo s recenzemi, jinak výsledky hledání.
 */
export function googleMapsSearchUrl(title: string, area: string | null): string {
  const q = [title.trim(), area?.trim()].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function tripadvisorSearchUrl(title: string, area: string | null): string {
  const q = [title.trim(), area?.trim()].filter(Boolean).join(' ')
  return `https://www.tripadvisor.cz/Search?q=${encodeURIComponent(q)}`
}

/**
 * Stránka hotelu u Invie z adresy zájezdu ve feedu
 * (`…/hotel/egypt/<letovisko>/<hotel>/zajezd/?s_offer_id=…&aid=…`): bez
 * části termínu, s partnerským `aid` a kotvou na recenze (`#recenze-hotelu`
 * je id sekce na stránce hotelu a je v prvním HTML, takže prohlížeč na ni
 * sjede hned; `#recenze-ubytovani` z přehledu /hotely/ tam neexistuje —
 * stránka pak zůstala nahoře, 23. 10. 2026). Mimo invia.cz vrací null.
 */
export function inviaHotelReviewsUrl(offerUrl: string, aid: string): string | null {
  try {
    const u = new URL(offerUrl)
    if (u.hostname !== 'www.invia.cz' && u.hostname !== 'invia.cz') return null
    const m = /^(\/hotel\/[^/]+\/[^/]+\/[^/]+\/)/.exec(u.pathname)
    if (!m) return null
    return `https://www.invia.cz${m[1]}?aid=${encodeURIComponent(aid)}#recenze-hotelu`
  } catch {
    return null
  }
}
