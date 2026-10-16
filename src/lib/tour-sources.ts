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

export type TourSourceId = 'cedok' | 'fischer' | 'exim' | 'tui' | 'bluestyle'

export interface TourSource {
  id: TourSourceId
  /** Jméno pro kartu („Čedok“) — bez „CK“ a bez domény. */
  label: string
  /** Doména webu cestovky — kontrola, že deep-link z feedu vede k ní. */
  hosts: string[]
  /** CJ click link (publisher 101533587). */
  cjClickUrl: string
  /**
   * Předpona env proměnných s přístupem k feedu: `<PREFIX>_SFTP_HOST`,
   * `<PREFIX>_SFTP_USER`, `<PREFIX>_SFTP_PASSWORD`, `<PREFIX>_SFTP_PATH`.
   * Bez vyplněného hosta se zdroj v syncu přeskočí (zatím feed jen od Čedoku;
   * ostatní cestovky ho dávají „na vyžádání“ přes VIVnetworks).
   */
  feedEnvPrefix: string
}

export const TOUR_SOURCES: readonly TourSource[] = [
  {
    id: 'cedok',
    label: 'Čedok',
    hosts: ['cedok.cz'],
    cjClickUrl: 'https://www.anrdoezrs.net/click-101533587-15686662',
    feedEnvPrefix: 'CEDOK',
  },
  {
    id: 'fischer',
    label: 'Fischer',
    hosts: ['fischer.cz'],
    cjClickUrl: 'https://www.tkqlhce.com/click-101533587-15041940',
    feedEnvPrefix: 'FISCHER',
  },
  {
    id: 'exim',
    label: 'Exim Tours',
    hosts: ['eximtours.cz'],
    cjClickUrl: 'https://www.kqzyfj.com/click-101533587-15043859',
    feedEnvPrefix: 'EXIM',
  },
  {
    id: 'tui',
    label: 'TUI',
    hosts: ['tui.cz'],
    cjClickUrl: 'https://www.jdoqocy.com/click-101533587-15704921',
    feedEnvPrefix: 'TUI',
  },
  {
    id: 'bluestyle',
    label: 'Blue Style',
    hosts: ['blue-style.cz'],
    cjClickUrl: 'https://www.jdoqocy.com/click-101533587-14358779',
    feedEnvPrefix: 'BLUESTYLE',
  },
]

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
  return `${source.cjClickUrl}?url=${encodeURIComponent(targetUrl)}`
}

/** Přístup k SFTP feedu zdroje z env; null = zdroj nemá feed nastavený. */
export function tourFeedConfig(
  source: TourSource,
  env: NodeJS.ProcessEnv = process.env,
): { host: string; port: number; user: string; password: string; path: string } | null {
  const p = source.feedEnvPrefix
  const host = env[`${p}_SFTP_HOST`]?.trim()
  const user = env[`${p}_SFTP_USER`]?.trim()
  const password = env[`${p}_SFTP_PASSWORD`]
  const path = env[`${p}_SFTP_PATH`]?.trim()
  if (!host || !user || !password || !path) return null
  const port = Number(env[`${p}_SFTP_PORT`] ?? 22) || 22
  return { host, port, user, password, path }
}
