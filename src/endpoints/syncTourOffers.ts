import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { invalidateTourOffersCache } from '@/lib/tour-offers-cache'
import { pragueToday } from '@/lib/kiwi-deals'
import { parseSdovolenaTour, TourChunker, type TourOfferRow } from '@/lib/sdovolena'
import { fetchCjTravelProducts, mapCjProduct } from '@/lib/cj-travel'
import { matchInviaRows, parseInviaFeed, type ExistingOffer } from '@/lib/invia-tours'
import { inviaHotelReviewsUrl } from '@/lib/tour-reviews'
import {
  INVIA_AID,
  TOUR_SOURCES,
  tourFeedConfig,
  type TourFeedConfig,
  type TourSource,
} from '@/lib/tour-sources'

/**
 * Denní sync kolekce `tour-offers` (podstránky „Zájezdy“): pro každou
 * cestovku s nastaveným feedem (env `<PREFIX>_SFTP_*`, viz tour-sources.ts)
 * stáhne nabídkový XML ve formátu Sdovolená.cz (SFTP u Čedoku, https u TUI)
 * do dočasného souboru — nebo u Fischeru a Eximu přečte produktový katalog
 * CJ přes GraphQL (src/lib/cj-travel.ts) —, PROUDEM ho rozřeže na jednotlivé zájezdy (feed Čedoku má 3,4 GB —
 * do paměti se nikdy nevejde celý) a z každého udělá řádky nabídek (viz
 * `parseSdovolenaTour`). Nabídky
 * zdroje se pak v jedné transakci celé nahradí.
 *
 * Stejný vzor jako /api/sync-affiliate-deals: GitHub Actions cron se sdíleným
 * tajemstvím ANALYTICS_SYNC_SECRET, odpověď hned 202 a práce na pozadí
 * (stahování trvá minuty, Cloudflare utíná spojení po 100 s), zápis přímým
 * SQL mimo hooky (tisíce řádků denně), cache webu se invaliduje ručně
 * štítkem `tour-offers`.
 *
 * Selhání zdroje NEMAŽE jeho minulá data: zdroj, jehož feed se nestáhl nebo
 * nedal žádnou nabídku, se přeskočí a chyba jde do souhrnu. Ostatní zdroje
 * se zapíší normálně.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

const SFTP_READY_TIMEOUT_MS = 30_000
/** Po tomhle čase bez dat se stahování vzdá (feed se jinak může „zaseknout“ napořád). */
const SFTP_STALL_TIMEOUT_MS = 120_000
const INSERT_CHUNK = 500

type SourceResult = {
  source: string
  tours: number
  rows: number
  countries: Record<string, number>
  error: string | null
  /** Jen Invia: řádky přímých partnerů spárované s hotelem Invie (dostaly odkaz na recenze). */
  matched?: number
  /** Jen Invia: feedy, které se nepodařilo stáhnout (ostatní se zpracovaly). */
  warnings?: string[]
}

/**
 * Stažení a rozparsování feedu jednoho zdroje. Soubor se nejdřív stáhne
 * přes SFTP do dočasného souboru (`fastGet` čte paralelně desítky bloků —
 * ~8 MB/s; sekvenční `createReadStream` zvládal ~0,5 MB/s, 3,4 GB by trvalo
 * přes hodinu) a teprve z disku se čte proudem a řeže na zájezdy. Dočasný
 * soubor se vždy smaže. `maxTours` (jen ladění) utne čtení po N zájezdech.
 */
async function fetchSourceRows(
  source: TourSource,
  today: string,
  maxTours: number | null,
): Promise<{ rows: TourOfferRow[]; tours: number }> {
  const config = tourFeedConfig(source)
  if (!config) throw new Error('feed není nastavený (env *_FEED / *_FEED_URL / *_SFTP_*)')
  if (config.kind === 'cj') {
    // Produktový katalog CJ (GraphQL, pár tisíc položek) — bez souboru.
    const products = await fetchCjTravelProducts(config.partnerId, config.token, config.companyId)
    const limited = maxTours !== null ? products.slice(0, maxTours) : products
    const rows: TourOfferRow[] = []
    for (const product of limited) {
      const row = mapCjProduct(product, source, today)
      if (row) rows.push(row)
    }
    return { rows, tours: limited.length }
  }

  const tmpFile = path.join(os.tmpdir(), `aracze-tour-feed-${source.id}-${process.pid}.xml`)
  try {
    await downloadFeed(config, tmpFile)
    return await parseFeedFile(tmpFile, source, today, maxTours)
  } finally {
    await fs.promises.rm(tmpFile, { force: true })
  }
}

async function downloadFeed(config: TourFeedConfig, targetFile: string): Promise<void> {
  if (config.kind === 'https') {
    // Feed po https (TUI veřejný 5 MB, Blue Style 330 MB s HTTP Basic auth)
    // proudem do souboru přes node:https — Next obaluje globální `fetch`
    // (logování/cache) a u 330 MB těla přenos po ~30 s utnul chybou
    // „terminated“ (zkoušeno 23. 10. 2026), mimo Next tentýž fetch prošel.
    // Přihlášení v adrese (`https://user:heslo@host/…`) jde do hlavičky
    // Authorization. Přesměrování se nenásleduje (feed má pevnou adresu).
    const url = new URL(config.url)
    const headers: Record<string, string> = { 'user-agent': 'ara.cz tour-offers sync' }
    if (url.username || url.password) {
      const user = decodeURIComponent(url.username)
      const password = decodeURIComponent(url.password)
      headers.authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
      url.username = ''
      url.password = ''
    }
    const { get } = await import('node:https')
    const res = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
      // Invia generuje feed až při stažení a první bajt může přijít po minutách
      // (23. 10. 2026 padlo na 60 s), proto nečinnost až 5 minut; celkový strop níže.
      const req = get(url, { headers, timeout: 5 * 60_000 }, resolve)
      req.on('timeout', () => req.destroy(new Error('feed: spojení bez odpovědi 5 min')))
      req.on('error', reject)
    })
    if (res.statusCode !== 200) {
      res.resume()
      throw new Error(`feed ${res.statusCode}`)
    }
    // Strop 10 minut na celý přenos kryje i gigabytový feed na pomalé lince.
    const stop = setTimeout(
      () => res.destroy(new Error('feed: stahování přes 10 minut')),
      10 * 60 * 1000,
    )
    try {
      await pipeline(res, fs.createWriteStream(targetFile))
    } finally {
      clearTimeout(stop)
    }
    return
  }
  if (config.kind !== 'sftp') throw new Error('tento zdroj se nestahuje do souboru')
  // ssh2 se importuje líně — mimo sync (web, CLI, generování typů) se vůbec
  // nenačte. Pure-JS implementace stačí (nativní doplňky se nebuildí).
  const { Client } = await import('ssh2')
  const conn = new Client()
  try {
    await new Promise<void>((resolve, reject) => {
      conn
        .once('ready', () => resolve())
        .once('error', (err) => reject(err))
        .connect({
          host: config.host,
          port: config.port,
          username: config.user,
          password: config.password,
          readyTimeout: SFTP_READY_TIMEOUT_MS,
        })
    })
    const sftp = await new Promise<import('ssh2').SFTPWrapper>((resolve, reject) => {
      conn.sftp((err, s) => (err ? reject(err) : resolve(s)))
    })
    await new Promise<void>((resolve, reject) => {
      // Hlídka proti zaseknutému přenosu: bez pokroku po SFTP_STALL_TIMEOUT_MS
      // se spojení zavře a fastGet skončí chybou (jinak by běh visel napořád).
      let stall: ReturnType<typeof setTimeout> | null = null
      const armStall = () => {
        if (stall) clearTimeout(stall)
        stall = setTimeout(() => {
          conn.end()
          reject(new Error(`feed ${SFTP_STALL_TIMEOUT_MS / 1000} s bez dat`))
        }, SFTP_STALL_TIMEOUT_MS)
      }
      armStall()
      sftp.fastGet(
        config.path,
        targetFile,
        { concurrency: 64, chunkSize: 32_768, step: () => armStall() },
        (err) => {
          if (stall) clearTimeout(stall)
          if (err) reject(err)
          else resolve()
        },
      )
    })
  } finally {
    conn.end()
  }
}

async function parseFeedFile(
  file: string,
  source: TourSource,
  today: string,
  maxTours: number | null,
): Promise<{ rows: TourOfferRow[]; tours: number }> {
  const rows: TourOfferRow[] = []
  let tours = 0
  const decoder = new TextDecoder('utf-8')
  const chunker = new TourChunker()
  const stream = fs.createReadStream(file, { highWaterMark: 1 << 20 })
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      for (const tourXml of chunker.push(decoder.decode(chunk, { stream: true }))) {
        tours++
        rows.push(...parseSdovolenaTour(tourXml, source.id, today))
        if (maxTours !== null && tours >= maxTours) return { rows, tours }
      }
    }
    for (const tourXml of chunker.push(decoder.decode())) {
      tours++
      rows.push(...parseSdovolenaTour(tourXml, source.id, today))
    }
  } finally {
    stream.destroy()
  }
  return { rows, tours }
}

type DrizzleTx = { execute: (query: unknown) => Promise<unknown> }
type DrizzleLike = DrizzleTx & {
  transaction: <T>(fn: (tx: DrizzleTx) => Promise<T>) => Promise<T>
}

/** Nahrazení nabídek jednoho zdroje v transakci (smazat staré, vložit nové po dávkách). */
async function replaceSourceRows(
  db: DrizzleLike,
  source: TourSource,
  rows: TourOfferRow[],
  /** Jen tyto země (Invia: země, jejichž feed se stáhl); bez omezení = celý zdroj. */
  onlyCountries?: string[],
) {
  await db.transaction(async (tx) => {
    const lock = (await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${'aracze:sync-tour-offers:' + source.id})) AS acquired`,
    )) as { rows: { acquired: boolean }[] }
    if (!lock.rows[0]?.acquired) {
      throw new Error('Sync tohoto zdroje už běží (souběžný požadavek)')
    }
    if (onlyCountries) {
      await tx.execute(
        sql`DELETE FROM tour_offers WHERE source = ${source.id} AND country_code = ANY(${onlyCountries}::text[])`,
      )
    } else {
      await tx.execute(sql`DELETE FROM tour_offers WHERE source = ${source.id}`)
    }
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK).map((r) => ({
        source: r.source,
        external_id: r.externalId,
        kind: r.kind,
        title: r.title,
        country_code: r.countryCode,
        area: r.area,
        place: r.place,
        stars: r.stars,
        board: r.board,
        departures: r.departures,
        terms: r.terms,
        // Půlnoc UTC explicitně: Payload čte `date` jako timestamptz a web
        // bere jen YYYY-MM-DD, takže se den nesmí posunout časovou zónou.
        term_from: `${r.termFrom}T00:00:00Z`,
        term_to: r.termTo ? `${r.termTo}T00:00:00Z` : null,
        nights: r.nights,
        term_count: r.termCount,
        price: r.price,
        original_price: r.originalPrice,
        photo_url: r.photoUrl,
        detail_url: r.detailUrl,
        lat: r.lat,
        lng: r.lng,
        invia_url: r.inviaUrl ?? null,
      }))
      // Jedna dávka = jeden parametr (JSON) → žádné limity na počet
      // parametrů dotazu a žádné ruční skládání VALUES.
      await tx.execute(sql`
        INSERT INTO tour_offers (
          source, external_id, kind, title, country_code, area, place, stars, board,
          departures, terms, term_from, term_to, nights, term_count, price, original_price,
          photo_url, detail_url, lat, lng, invia_url, created_at, updated_at
        )
        SELECT
          r.source, r.external_id, r.kind, r.title, r.country_code, r.area, r.place, r.stars,
          r.board, r.departures, r.terms, r.term_from::timestamptz, r.term_to::timestamptz, r.nights,
          r.term_count, r.price, r.original_price, r.photo_url, r.detail_url, r.lat, r.lng,
          r.invia_url, now(), now()
        FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS r(
          source text, external_id text, kind text, title text, country_code text,
          area text, place text, stars numeric, board text, departures jsonb, terms jsonb,
          term_from text, term_to text, nights numeric, term_count numeric, price numeric,
          original_price numeric, photo_url text, detail_url text, lat numeric, lng numeric,
          invia_url text
        )
      `)
    }
  })
}

/** Rezervace běhu v paměti procesu — stejný důvod i chování jako u syncAffiliateDeals. */
let syncStartedAt: number | null = null
const SYNC_STALE_MS = 60 * 60 * 1000

function reserveSyncRun(): boolean {
  const now = Date.now()
  if (syncStartedAt !== null && now - syncStartedAt < SYNC_STALE_MS) return false
  syncStartedAt = now
  return true
}

function countByCountry(rows: TourOfferRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.countryCode] = (out[r.countryCode] ?? 0) + 1
  return out
}

/** Jen https feed přímo z affil.invia.cz (adresa je z adminu → bez toho by to byl SSRF vektor). */
function isInviaFeedUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return (
      u.protocol === 'https:' &&
      u.hostname === 'affil.invia.cz' &&
      u.pathname.startsWith('/direct/core/tool_xml-feed/download/')
    )
  } catch {
    return false
  }
}

/**
 * Invia (src/lib/invia-tours.ts): feedy po zemích z publikovaných stránek
 * Zájezdy, hotely se spárují s řádky přímých partnerů — spárované dostanou
 * `invia_url` (recenze), nespárované jdou do nabídky jako zdroj `invia`.
 * Běží jako poslední zdroj, aby párovala proti čerstvým řádkům.
 */
async function syncInvia(
  db: DrizzleLike,
  write: boolean,
  source: TourSource,
  today: string,
  maxTours: number | null,
): Promise<SourceResult> {
  const pages = (await db.execute(sql`
    SELECT tours_country_code AS code, tours_invia_feed_urls AS urls
    FROM pages
    WHERE category = 'Zájezdy' AND _status = 'published'
      AND tours_country_code IS NOT NULL AND tours_invia_feed_urls IS NOT NULL
  `)) as { rows: { code: string; urls: string }[] }
  const feeds = pages.rows.flatMap((p) =>
    p.urls
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && isInviaFeedUrl(l))
      .map((url) => ({ code: p.code, url })),
  )
  if (feeds.length === 0) throw new Error('žádná publikovaná stránka Zájezdy nemá feed Invie')

  let offers = 0
  let okFeeds = 0
  const warnings: string[] = []
  const byCountry = new Map<string, Map<string, TourOfferRow>>()
  for (const feed of feeds) {
    const tmpFile = path.join(os.tmpdir(), `aracze-tour-feed-invia-${process.pid}.xml`)
    try {
      await downloadFeed({ kind: 'https', url: feed.url }, tmpFile)
      const xml = await fs.promises.readFile(tmpFile, 'utf8')
      offers += (xml.match(/<offer>/g) ?? []).length
      const rows = parseInviaFeed(xml, feed.code, today)
      const map = byCountry.get(feed.code) ?? new Map<string, TourOfferRow>()
      for (const row of rows) if (!map.has(row.externalId)) map.set(row.externalId, row)
      byCountry.set(feed.code, map)
      okFeeds++
    } catch (err) {
      // Jeden nedostupný feed nesmí shodit ostatní (země mají feedů víc);
      // teprve bez jediného staženého feedu se nic nepřepisuje.
      warnings.push(
        `${feed.code} ${feed.url.slice(-20)}: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      await fs.promises.rm(tmpFile, { force: true })
    }
  }
  if (okFeeds === 0) throw new Error(`žádný feed Invie se nestáhl: ${warnings.join('; ')}`)

  const unmatchedAll: TourOfferRow[] = []
  const matchedIds = new Set<number>()
  for (const [code, map] of byCountry) {
    let rows = [...map.values()]
    if (maxTours !== null) rows = rows.slice(0, maxTours)
    for (const row of rows) row.inviaUrl = inviaHotelReviewsUrl(row.detailUrl, INVIA_AID)
    const existing = (await db.execute(sql`
      SELECT id, title, lat, lng FROM tour_offers
      WHERE country_code = ${code} AND source <> 'invia'
    `)) as { rows: ExistingOffer[] }
    const { matched, unmatched } = matchInviaRows(
      rows,
      existing.rows.map((e) => ({
        id: Number(e.id),
        title: e.title,
        lat: e.lat === null ? null : Number(e.lat),
        lng: e.lng === null ? null : Number(e.lng),
      })),
    )
    const pairs: { id: number; url: string }[] = []
    for (const m of matched) {
      if (!m.row.inviaUrl) continue
      for (const id of m.ids) {
        pairs.push({ id, url: m.row.inviaUrl })
        matchedIds.add(id)
      }
    }
    unmatchedAll.push(...unmatched)
    if (write) {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE tour_offers SET invia_url = NULL WHERE country_code = ${code} AND source <> 'invia'`,
        )
        if (pairs.length > 0) {
          await tx.execute(sql`
            UPDATE tour_offers t SET invia_url = m.url, updated_at = now()
            FROM jsonb_to_recordset(${JSON.stringify(pairs)}::jsonb) AS m(id int, url text)
            WHERE t.id = m.id
          `)
        }
      })
    }
  }
  // Prázdný seznam je u Invie v pořádku (vše spárováno) — smaže jen včerejší
  // řádky, a jen v zemích, jejichž feed se dnes stáhl; země s nedostupným
  // feedem si nechají včerejší hotely.
  if (write) await replaceSourceRows(db, source, unmatchedAll, [...byCountry.keys()])
  return {
    source: source.id,
    tours: offers,
    rows: unmatchedAll.length,
    countries: countByCountry(unmatchedAll),
    error: null,
    matched: matchedIds.size,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}

async function runSync(
  db: DrizzleLike,
  write: boolean,
  sources: TourSource[],
  maxTours: number | null,
): Promise<SourceResult[]> {
  const today = pragueToday()
  const results: SourceResult[] = []
  // Zdroje sekvenčně — každý je gigabytové stahování, paralelně by si braly
  // pásmo i paměť navzájem.
  for (const source of sources) {
    try {
      if (source.id === 'invia') {
        results.push(await syncInvia(db, write, source, today, maxTours))
        continue
      }
      const { rows, tours } = await fetchSourceRows(source, today, maxTours)
      if (rows.length === 0)
        throw new Error(`feed nedal žádnou leteckou nabídku z ČR (${tours} zájezdů)`)
      if (write) await replaceSourceRows(db, source, rows)
      results.push({
        source: source.id,
        tours,
        rows: rows.length,
        countries: countByCountry(rows),
        error: null,
      })
    } catch (err) {
      results.push({
        source: source.id,
        tours: 0,
        rows: 0,
        countries: {},
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}

export const syncTourOffersEndpoint: Endpoint = {
  path: '/sync-tour-offers',
  method: 'post',
  handler: async (req) => {
    const secret = process.env.ANALYTICS_SYNC_SECRET
    const providedSecret = req.headers.get('x-sync-secret')
    const roles = Array.isArray(req.user?.roles) ? req.user?.roles : []
    const isAdmin = Boolean(req.user) && roles.includes('admin')
    if (!isAdmin && (!secret || !providedSecret || !safeEqual(providedSecret, secret))) {
      throw new APIError('Forbidden', 403)
    }
    const params = new URL(req.url ?? '', 'http://localhost').searchParams
    const dryRun = params.get('dryRun') === '1'
    // `?source=cedok` omezí běh na jeden zdroj (ladění i ruční doběh po
    // doplnění nového feedu); `?maxTours=N` jen s dryRun.
    const onlySource = params.get('source')
    const maxToursRaw = Number(params.get('maxTours'))
    const maxTours = dryRun && Number.isInteger(maxToursRaw) && maxToursRaw > 0 ? maxToursRaw : null

    const sources = TOUR_SOURCES.filter(
      (s) => tourFeedConfig(s) !== null && (!onlySource || s.id === onlySource),
    )
    // Ruční běh jednoho zdroje přepíše jeho řádky bez `invia_url`; Invia se
    // proto přidá vždy za něj, aby odkazy na recenze nezmizely do dalšího rána.
    const invia = TOUR_SOURCES.find((s) => s.id === 'invia')
    if (onlySource && onlySource !== 'invia' && invia && tourFeedConfig(invia)) sources.push(invia)
    if (sources.length === 0) {
      throw new APIError(
        'Žádný zdroj zájezdů nemá nastavený feed (env *_FEED, *_FEED_URL nebo *_SFTP_*)',
        400,
      )
    }

    if (!reserveSyncRun()) {
      throw new APIError('Sync už běží — zkus to za chvíli znovu', 409)
    }

    const db = (req.payload.db as unknown as { drizzle: DrizzleLike }).drizzle
    if (dryRun) {
      try {
        const results = await runSync(db, false, sources, maxTours)
        return Response.json({ ok: true, dryRun: true, results })
      } finally {
        syncStartedAt = null
      }
    }

    const { after } = await import('next/server.js')
    after(async () => {
      try {
        const results = await runSync(db, true, sources, null)
        if (results.some((r) => !r.error)) {
          // Nabídky drží jen paměťová cache procesu (lib/tour-offers-cache.ts,
          // Next cache je neunese kvůli limitu 2 MB) — po zápisu vyprázdnit.
          invalidateTourOffersCache()
        }
        console.log('[sync-tour-offers] hotovo:', JSON.stringify(results))
      } catch (err) {
        console.error('[sync-tour-offers] selhal:', err)
      } finally {
        syncStartedAt = null
      }
    })
    return Response.json(
      { ok: true, accepted: true, sources: sources.map((s) => s.id) },
      { status: 202 },
    )
  },
}
