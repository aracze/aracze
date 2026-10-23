/**
 * Zdroje zájezdů pro sekci „Zájezdy“ (podstránka země, kategorie `Zájezdy`).
 *
 * Každá cestovka = jeden zdroj: nabídkový feed ve formátu **Sdovolená.cz**
 * (XML, číselníky viz https://o-seznam.cz/napoveda/sdovolena/pro-inzerenty/ciselnik/)
 * + provizní „click link“ sítě CJ. Odkazy ve feedech vedou přímo na web
 * cestovky BEZ provize — provizi nese až CJ click link s deep-linkem
 * `?url=<cíl>` (ověřeno 16. 10. 2026 u všech pěti cestovek: cíl dorazí
 * s `cjevent`). Deep-link musí vést na EXISTUJÍCÍ stránku cestovky — na 404
 * cestovka přesměruje bez parametrů a provize se ztratí; proto se do něj
 * dávají jen adresy z feedu, ne cesty skládané u nás.
 *
 * Click linky nejsou tajné (jsou vidět v HTML každé stránky), tak žijí
 * v kódu — stejný modul čte sync (bez Next runtime) i web, proto bez
 * závislostí na lib/payload (kruhový import přes payload.config).
 * Přístupové údaje k feedům jsou naopak jen v env (viz `feedEnvPrefix`).
 */

import { AFFILIATE_FALLBACKS } from './affiliate-defaults'

export type TourSourceId = 'cedok' | 'fischer' | 'exim' | 'tui' | 'bluestyle' | 'invia'

export interface TourSource {
  id: TourSourceId
  /** Jméno pro kartu („Čedok“) — bez „CK“ a bez domény. */
  label: string
  /** Doména webu cestovky — kontrola, že deep-link z feedu vede k ní. */
  hosts: string[]
  /** CJ click link (publisher 101533587); u přímého partnera (Invia) obecný odkaz s `aid`. */
  cjClickUrl: string
  /** Id inzerenta v CJ — pro produktový katalog (`<PREFIX>_FEED=cj`); prázdné u přímého partnera. */
  cjPartnerId: string
  /**
   * Přímý partner mimo CJ: deep-link z feedu už nese partnerský parametr,
   * /go/zajezd na něj přesměruje rovnou (Invia, `aid` v adrese).
   */
  direct?: boolean
  /**
   * Logo pro pruh „Zájezdy od“ nad filtry (public/assets/partners, SVG
   * z webu cestovky; v pruhu šedé, barevné až při najetí). Bez loga se
   * cestovka v pruhu vypíše jménem. `logoHeight` = Tailwind výška v pruhu —
   * loga mají různě „těžký“ kresbu (čistě textové Fischer/Exim jsou při stejné
   * výšce opticky větší než Čedok nebo TUI s grafikou).
   */
  logo?: string
  logoHeight?: string
  /**
   * Značky, které se z CJ katalogu berou (velkými písmeny). Katalogy Fischeru
   * a Eximu nesou tytéž hotely obou značek (jedna skupina) — bez filtru by se
   * karty zdvojily. Bez pole se bere celý katalog.
   */
  cjBrands?: string[]
  /**
   * Předpona env proměnných s přístupem k feedu: `<PREFIX>_FEED=cj`
   * (produktový katalog CJ — Fischer, Exim), `<PREFIX>_FEED_URL` (veřejný
   * https feed Sdovolená — TUI), nebo `<PREFIX>_SFTP_HOST/USER/PASSWORD/PATH`
   * (Čedok). Bez toho se zdroj v syncu přeskočí (Blue Style zatím bez feedu).
   */
  feedEnvPrefix: string
}

export const TOUR_SOURCES: readonly TourSource[] = [
  {
    id: 'cedok',
    label: 'Čedok',
    hosts: ['cedok.cz'],
    cjClickUrl: 'https://www.anrdoezrs.net/click-101533587-15686662',
    cjPartnerId: '6179554',
    logo: '/assets/partners/cedok.svg',
    logoHeight: 'h-7',
    feedEnvPrefix: 'CEDOK',
  },
  {
    id: 'fischer',
    label: 'Fischer',
    hosts: ['fischer.cz'],
    cjClickUrl: 'https://www.tkqlhce.com/click-101533587-15041940',
    cjPartnerId: '5905992',
    cjBrands: ['FISCHER'],
    logo: '/assets/partners/fischer.svg',
    logoHeight: 'h-[17px]',
    feedEnvPrefix: 'FISCHER',
  },
  {
    id: 'exim',
    label: 'Exim Tours',
    hosts: ['eximtours.cz'],
    cjClickUrl: 'https://www.kqzyfj.com/click-101533587-15043859',
    cjPartnerId: '5906045',
    cjBrands: ['EXIM TOURS', 'KARTAGO TOURS'],
    logo: '/assets/partners/exim.svg',
    logoHeight: 'h-[19px]',
    feedEnvPrefix: 'EXIM',
  },
  {
    id: 'tui',
    label: 'TUI',
    hosts: ['tui.cz'],
    cjClickUrl: 'https://www.jdoqocy.com/click-101533587-15704921',
    cjPartnerId: '6785595',
    logo: '/assets/partners/tui.svg',
    logoHeight: 'h-8',
    feedEnvPrefix: 'TUI',
  },
  {
    id: 'bluestyle',
    label: 'Blue Style',
    hosts: ['blue-style.cz'],
    cjClickUrl: 'https://www.jdoqocy.com/click-101533587-14358779',
    cjPartnerId: '5605390',
    logo: '/assets/partners/bluestyle.svg',
    logoHeight: 'h-[22px]',
    feedEnvPrefix: 'BLUESTYLE',
  },
  {
    // Agentura, ne cestovka: do nabídky jen hotely, které přímí partneři
    // nemají, jinak odkaz na recenze (src/lib/invia-tours.ts). Poslední
    // v pořadí schválně — sync ji pouští až po ostatních, aby párovala
    // proti čerstvým řádkům. Feedy se nastavují v adminu na stránce Zájezdy.
    id: 'invia',
    label: 'Invia',
    hosts: ['invia.cz'],
    cjClickUrl: AFFILIATE_FALLBACKS.toursUrl,
    cjPartnerId: '',
    direct: true,
    logo: '/assets/partners/invia.svg',
    logoHeight: 'h-[23px]',
    feedEnvPrefix: 'INVIA',
  },
]

/** Partnerské `aid` Invie (z obecného odkazu) — do odkazů na stránky hotelů. */
export const INVIA_AID = new URL(AFFILIATE_FALLBACKS.toursUrl).searchParams.get('aid') ?? ''

export const TOUR_SOURCE_IDS = TOUR_SOURCES.map((s) => s.id) as [TourSourceId, ...TourSourceId[]]

export function tourSourceById(id: string): TourSource | null {
  return TOUR_SOURCES.find((s) => s.id === id) ?? null
}

export function isTourSourceId(value: string): value is TourSourceId {
  return TOUR_SOURCES.some((s) => s.id === value)
}

/** Patří adresa webu dané cestovky (vč. subdomén)? */
export function isSourceHost(source: TourSource, url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return source.hosts.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/**
 * Provizní adresa: CJ click link s deep-linkem na stránku zájezdu. Adresa
 * z feedu, která nevede na web cestovky (chyba dat), se zahodí a klik jde
 * na obecný odkaz — provize zůstane, jen bez konkrétního zájezdu.
 */
export function cjDeepLink(source: TourSource, targetUrl: string | null | undefined): string {
  if (!targetUrl || !/^https:\/\//i.test(targetUrl) || !isSourceHost(source, targetUrl)) {
    return source.cjClickUrl
  }
  if (source.direct) return targetUrl
  return `${source.cjClickUrl}?url=${encodeURIComponent(targetUrl)}`
}

export type TourFeedConfig =
  | { kind: 'sftp'; host: string; port: number; user: string; password: string; path: string }
  | { kind: 'https'; url: string }
  | { kind: 'cj'; partnerId: string; token: string; companyId: string }
  /** Invia: feedy po zemích z adminu (pole `tours.inviaFeedUrls` stránek Zájezdy). */
  | { kind: 'invia' }

/**
 * Odkud brát feed zdroje: `<PREFIX>_FEED_URL` (veřejný https, např. TUI) má
 * přednost, jinak SFTP (`<PREFIX>_SFTP_*`, Čedok). null = zdroj feed nemá
 * a sync ho přeskočí. Adresa se bere z env (ne z adminu), takže tu není
 * riziko SSRF přes editovatelný text; https se přesto vyžaduje.
 */
export function tourFeedConfig(
  source: TourSource,
  env: NodeJS.ProcessEnv = process.env,
): TourFeedConfig | null {
  if (source.direct) return { kind: 'invia' }
  const p = source.feedEnvPrefix
  // `<PREFIX>_FEED=cj` = produktový katalog CJ (Fischer, Exim); potřebuje
  // sdílený CJ_API_TOKEN (osobní token z developers.cj.com) a CJ_COMPANY_ID.
  if (env[`${p}_FEED`]?.trim().toLowerCase() === 'cj') {
    const token = env.CJ_API_TOKEN?.trim()
    const companyId = env.CJ_COMPANY_ID?.trim()
    return token && companyId
      ? { kind: 'cj', partnerId: source.cjPartnerId, token, companyId }
      : null
  }
  const url = env[`${p}_FEED_URL`]?.trim()
  if (url) return url.startsWith('https://') ? { kind: 'https', url } : null
  const host = env[`${p}_SFTP_HOST`]?.trim()
  const user = env[`${p}_SFTP_USER`]?.trim()
  const password = env[`${p}_SFTP_PASSWORD`]
  const path = env[`${p}_SFTP_PATH`]?.trim()
  if (!host || !user || !password || !path) return null
  const port = Number(env[`${p}_SFTP_PORT`] ?? 22) || 22
  return { kind: 'sftp', host, port, user, password, path }
}
