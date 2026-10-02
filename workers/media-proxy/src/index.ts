// Media proxy (media.ara.cz). Dva zdroje fotek (MEDIA_SOURCE):
//   cloudinary — proxy na Cloudinary s dlouhou edge keší; při výpadku záloha z R2
//                zmenšená přes Cloudflare Image Transformations (krátká keš).
//   backup     — záloha z R2 + Image Transformations jako HLAVNÍ zdroj s dlouhou
//                keší; Cloudinary se vůbec nevolá (pauza kvůli kreditům, 10/2026).
// Čistá logika cest je v media-path.ts, tady jen síť a hlavičky.

import {
  cfImageOptions,
  deriveR2Keys,
  negotiateFormat,
  parsePath,
  robotsTxt,
  signTransform,
} from './media-path'
import { buildDataPoint, isDisguisedScraper, type Outcome, type Sample } from './telemetry'

export interface Env {
  /** R2 bucket se zálohou originálů médií (plní hook v src/collections/Media.ts). */
  BACKUP: R2Bucket
  /** Např. https://res.cloudinary.com/ara — testy fallbacku podvrhnou neplatný host. */
  CLOUDINARY_ORIGIN: string
  /** Custom doména R2 bucketu — zdroj pro Image Transformations (bez rekurze na sebe). */
  BACKUP_HOST: string
  /**
   * API secret Cloudinary účtu (wrangler secret) — podpis transformací pro
   * režim Strict transformations. Bez něj jdou adresy nepodepsané (funguje
   * jen s vypnutým strict režimem).
   */
  CLOUDINARY_API_SECRET?: string
  /**
   * Workers Analytics Engine — měření provozu (kdo chce jaké varianty a co
   * z toho jde na Cloudinary). Volitelný: bez bindingu se nic neměří.
   */
  STATS?: AnalyticsEngineDataset
  /**
   * Hlavní zdroj fotek: `cloudinary` (výchozí) nebo `backup` (R2 + Image
   * Transformations, Cloudinary se nevolá). Přepíná se v wrangler.jsonc + deploy.
   */
  MEDIA_SOURCE?: 'cloudinary' | 'backup'
}

const YEAR_SECONDS = 31_536_000
const DAY_SECONDS = 86_400
/** Verzované adresy jsou obsahově adresované → klidně navždy. */
const IMMUTABLE_CACHE = `public, max-age=${YEAR_SECONDS}, immutable`
/** Bez verze (legacy adresy) by výměna fotky pod stejným jménem zůstala v keši. */
const UNVERSIONED_CACHE = `public, max-age=${DAY_SECONDS}`
/** Nouzový režim jen krátce — po oživení Cloudinary se rychle vrátí zmenšeniny. */
const FALLBACK_CACHE = 'public, max-age=300'
const FALLBACK_TTL = 300
/**
 * Fotka bez transformace (adresy originálů z RSC payloadu a starých indexů)
 * má 1,5–3 MB a v 9/2026 dělala ~40 % přenosu z Cloudinary — stahovali je
 * Googlebot-Image a scrapeři. Originál se proto vždy stropuje na šířku hlavní
 * fotky, stejným tvarem jako next/image loader (sdílí už existující
 * odvozeniny). `raw` (SVG) se nestropuje.
 */
const ORIGINAL_CAP_TRANSFORM = 'f_auto,q_auto,c_limit,w_1920'
/**
 * robots.txt: hlavička je pro keše botů (Google si ho drží až 24 h), ne pro edge —
 * custom doména Workeru volá Worker vždy a odpověď bez subrequestu se na edge
 * nekešuje. Pár požadavků denně, řešit to Cache API by bylo víc kódu než užitku.
 */
const ROBOTS_CACHE = `public, max-age=${DAY_SECONDS}`

/** Z upstreamu kopírujeme jen tohle; x-cld-error a spol. ven nepatří. */
const COPIED_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified']

function buildResponse(upstream: Response, cacheControl: string, isHead: boolean): Response {
  const headers = new Headers()
  for (const name of COPIED_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('cache-control', cacheControl)
  headers.set('vary', 'Accept')
  headers.set('x-content-type-options', 'nosniff')
  // Ladicí viditelnost: stav edge keše SUBREQUESTU (HIT = Cloudinary už
  // o požadavku neví). Vnější cf-cache-status tu neexistuje — custom
  // doména Workeru volá Worker vždy.
  const upstreamCache = upstream.headers.get('cf-cache-status')
  if (upstreamCache) headers.set('x-upstream-cache', upstreamCache)
  // U HEAD tělo nečteme — uvolnit, ať nedrží spojení.
  if (isHead) void upstream.body?.cancel()
  return new Response(isHead ? null : upstream.body, { status: 200, headers })
}

/** Země z metadat Cloudflare (`request.cf` je v typech `any`, proto ruční kontrola). */
function countryOf(request: Request): string {
  const cf = request.cf as { country?: unknown } | undefined
  return typeof cf?.country === 'string' ? cf.country : ''
}

/** Zapíše vzorek do Analytics Engine; měření nikdy nesmí shodit obsluhu fotky. */
function record(request: Request, env: Env, sample: Sample): void {
  if (!env.STATS) return
  try {
    env.STATS.writeDataPoint(
      buildDataPoint(sample, {
        userAgent: request.headers.get('user-agent'),
        accept: request.headers.get('accept'),
        country: countryOf(request),
        method: request.method,
      }),
    )
  } catch {
    // limit datových bodů / chyba bindingu — obsluha jede dál
  }
}

/** Doplní do vzorku, jak požadavek dopadl; volá se na každém výstupu z obsluhy. */
function finish(sample: Sample, response: Response, outcome: Outcome): Response {
  sample.outcome = outcome
  sample.status = response.status
  sample.bytes = Number(response.headers.get('content-length')) || 0
  return response
}

/** Odpověď + vzorek pro měření (outcome se doplní podle toho, kudy požadavek prošel). */
function serve(request: Request, env: Env, sample: Sample): Promise<Response> | Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return finish(
      sample,
      new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } }),
      'method',
    )
  }
  const isHead = request.method === 'HEAD'
  const url = new URL(request.url)
  // Vlastní robots.txt pro doménu fotek — bez něj Cloudflare podává jen
  // komentářový managed robots.txt bez jediného zákazu (viz TRAINING_BOTS).
  if (url.pathname === '/robots.txt') {
    return finish(
      sample,
      new Response(isHead ? null : robotsTxt(), {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': ROBOTS_CACHE,
          'x-content-type-options': 'nosniff',
        },
      }),
      'robots',
    )
  }
  const parsed = parsePath(url.pathname)
  if (!parsed.ok) {
    return finish(
      sample,
      new Response(parsed.status === 400 ? 'Invalid transformation' : 'Not found', {
        status: parsed.status,
      }),
      'rejected',
    )
  }
  const { resourceType, version, key } = parsed.path
  // Maskované scrapery (UA prohlížeče bez Accept pro obrázky) fotky nedostanou —
  // viz isDisguisedScraper. Krátká keš odpovědi, ať se pravidlo dá rychle vrátit.
  if (
    resourceType === 'image' &&
    isDisguisedScraper({
      userAgent: request.headers.get('user-agent'),
      accept: request.headers.get('accept'),
      secFetchDest: request.headers.get('sec-fetch-dest'),
    })
  ) {
    return finish(
      sample,
      new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } }),
      'blocked',
    )
  }
  const requested =
    parsed.path.transform ?? (resourceType === 'image' ? ORIGINAL_CAP_TRANSFORM : null)
  // f_auto → konkrétní formát dle Accept (Cloudflare keš ignoruje Vary).
  const transform = negotiateFormat(requested, request.headers.get('accept') ?? '')
  sample.transform = transform
  sample.resourceType = resourceType
  sample.versioned = version !== ''
  return serveMedia({ env, isHead, resourceType, version, key, transform, sample })
}

interface MediaContext {
  env: Env
  isHead: boolean
  resourceType: string
  version: string
  key: string
  transform: string | null
  sample: Sample
}

async function serveMedia(ctx: MediaContext): Promise<Response> {
  const { env, isHead, resourceType, version, key, transform, sample } = ctx
  // Roční keš jen pro verzované adresy — u legacy adres bez v123 by keš
  // po výměně fotky pod stejným public_id držela starou verzi až rok.
  const versioned = version !== ''
  const longCache = {
    cacheControl: versioned ? IMMUTABLE_CACHE : UNVERSIONED_CACHE,
    cacheTtl: versioned ? YEAR_SECONDS : DAY_SECONDS,
  }

  if (env.MEDIA_SOURCE === 'backup') {
    const served = await serveFromBackup(ctx, { ...longCache, outcome: 'backup' })
    if (served instanceof Response) return served
    // Chyba R2 (výjimka bindingu) není totéž co chybějící objekt: 503 bez keše,
    // ať se klient (i edge) zkusí znovu a 404 zůstane vyhrazené pro „opravdu není".
    return finish(
      sample,
      served === 'error'
        ? new Response('Backup unavailable', {
            status: 503,
            headers: { 'cache-control': 'no-store' },
          })
        : new Response('Image unavailable', { status: 404 }),
      'unavailable',
    )
  }

  // Query string se zahazuje (Cloudinary ho ignoruje, jen by kazil keš).
  // Upstream dostává holý GET bez klientských hlaviček — URL po vyjednání
  // formátu plně určuje bajty. Keš je klíčovaná URL subrequestu.
  // Transformace se podepisuje (Strict transformations na účtu); originál
  // bez transformace podpis nepotřebuje a strict režim ho neblokuje.
  const signature =
    transform && env.CLOUDINARY_API_SECRET
      ? `${await signTransform(transform, key, env.CLOUDINARY_API_SECRET)}/`
      : ''
  const upstreamUrl = `${env.CLOUDINARY_ORIGIN}/${resourceType}/upload/${signature}${
    transform ? `${transform}/` : ''
  }${version}${key}`

  let upstream: Response | undefined
  const started = Date.now()
  try {
    upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(10_000),
      cf: { cacheEverything: true, cacheTtl: longCache.cacheTtl },
    })
  } catch {
    upstream = undefined
  }
  // Měření: TTFB subrequestu (tělo se streamuje až po záznamu) + stav keše
  // i pro ne-2xx odpovědi (kešované 404 apod.), ať '' znamená jen „hlavička chybí".
  sample.durationMs = Date.now() - started
  sample.cacheStatus = upstream?.headers.get('cf-cache-status') ?? ''
  if (upstream?.ok) {
    return finish(sample, buildResponse(upstream, longCache.cacheControl, isHead), 'cloudinary')
  }
  // Tělo neúspěšné (nebo u HEAD nečtené) odpovědi uvolnit, ať nedrží spojení.
  void upstream?.body?.cancel()

  // Nouzový režim: deaktivovaný účet = 401, chybějící asset = 404, výpadek
  // = 5xx/timeout → záloha z R2 s krátkou keší.
  const served = await serveFromBackup(ctx, {
    cacheControl: FALLBACK_CACHE,
    cacheTtl: FALLBACK_TTL,
    outcome: 'fallback',
  })
  if (served instanceof Response) return served

  // Není ani na Cloudinary, ani v záloze → propagovat stav upstreamu.
  return finish(
    sample,
    new Response('Image unavailable', { status: upstream?.status ?? 502 }),
    'unavailable',
  )
}

interface BackupOptions {
  cacheControl: string
  cacheTtl: number
  outcome: 'backup' | 'fallback'
}

/**
 * Záloha z R2: pokud možno zmenšená přes Cloudflare Image Transformations
 * (zdroj = custom doména bucketu), jinak surový originál. `raw` (SVG) se podává
 * tak, jak je. Vrací 'missing', když objekt v záloze není, a 'error', když R2
 * selhalo (výjimka bindingu) — volající rozhodne o 404 vs. 503.
 */
async function serveFromBackup(
  ctx: MediaContext,
  options: BackupOptions,
): Promise<Response | 'missing' | 'error'> {
  const { env, isHead, resourceType, key, transform, sample } = ctx
  const { cacheControl, cacheTtl, outcome } = options
  const imageOptions = resourceType === 'image' ? cfImageOptions(transform) : null
  let r2Error = false
  const r2Failed = () => {
    r2Error = true
    return null
  }
  for (const r2Key of deriveR2Keys(key)) {
    // Chyba R2 bindingu (výjimka, ne jen miss) nesmí shodit celý požadavek —
    // radši řízená odpověď níž než neodchycená 1101.
    const exists = await env.BACKUP.head(r2Key).catch(r2Failed)
    if (!exists) continue

    if (imageOptions) {
      const started = Date.now()
      try {
        const resized = await fetch(`https://${env.BACKUP_HOST}/${encodeURI(r2Key)}`, {
          signal: AbortSignal.timeout(10_000),
          cf: { image: imageOptions, cacheEverything: true, cacheTtl },
        })
        // V režimu backup je tohle „ten" subrequest — měří se jako u Cloudinary.
        if (outcome === 'backup') {
          sample.durationMs = Date.now() - started
          sample.cacheStatus = resized.headers.get('cf-cache-status') ?? ''
        }
        if (resized.ok) return finish(sample, buildResponse(resized, cacheControl, isHead), outcome)
        void resized.body?.cancel()
      } catch {
        // zmenšování nedostupné (kvóta/vypnuto) → poslední záchrana níž
      }
    }

    // Poslední záchrana: surový originál přímo z bucketu.
    // HEAD obsloužíme z metadat (exists), ať se tělo z R2 zbytečně nestahuje.
    const object = isHead ? exists : await env.BACKUP.get(r2Key).catch(r2Failed)
    if (!object) continue
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    if (!headers.get('content-type')) headers.set('content-type', 'application/octet-stream')
    headers.set('content-length', String(object.size))
    headers.set('cache-control', cacheControl)
    headers.set('vary', 'Accept')
    headers.set('x-content-type-options', 'nosniff')
    const body = !isHead && 'body' in object ? (object.body as ReadableStream) : null
    return finish(sample, new Response(body, { status: 200, headers }), outcome)
  }
  return r2Error ? 'error' : 'missing'
}

const mediaProxy = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const sample: Sample = {
      outcome: 'unavailable',
      cacheStatus: '',
      transform: null,
      resourceType: '',
      versioned: false,
      status: 0,
      bytes: 0,
      durationMs: 0,
    }
    try {
      return await serve(request, env, sample)
    } finally {
      record(request, env, sample)
    }
  },
}

export default mediaProxy
