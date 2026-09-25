// Media proxy (media.ara.cz): normálně proxuje na Cloudinary s dlouhou edge
// keší (kredity za přenos přestanou téct), při výpadku Cloudinary podává
// zálohu z R2 — pokud možno zmenšenou přes Cloudflare Image Transformations.
// Čistá logika cest je v media-path.ts, tady jen síť a hlavičky.

import {
  cfImageOptions,
  deriveR2Keys,
  negotiateFormat,
  parsePath,
  robotsTxt,
  signTransform,
} from './media-path'
import { buildDataPoint, type Outcome, type Sample } from './telemetry'

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
}

const YEAR_SECONDS = 31_536_000
const DAY_SECONDS = 86_400
/** Verzované adresy jsou obsahově adresované → klidně navždy. */
const IMMUTABLE_CACHE = `public, max-age=${YEAR_SECONDS}, immutable`
/** Bez verze (legacy adresy) by výměna fotky pod stejným jménem zůstala v keši. */
const UNVERSIONED_CACHE = `public, max-age=${DAY_SECONDS}`
/** Nouzový režim jen krátce — po oživení Cloudinary se rychle vrátí zmenšeniny. */
const FALLBACK_CACHE = 'public, max-age=300'
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
  // f_auto → konkrétní formát dle Accept (Cloudflare keš ignoruje Vary).
  const transform = negotiateFormat(parsed.path.transform, request.headers.get('accept') ?? '')
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

  // Roční keš jen pro verzované adresy — u legacy adres bez v123 by keš
  // po výměně fotky pod stejným public_id držela starou verzi až rok.
  const versioned = version !== ''
  let upstream: Response | undefined
  try {
    upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(10_000),
      cf: { cacheEverything: true, cacheTtl: versioned ? YEAR_SECONDS : DAY_SECONDS },
    })
  } catch {
    upstream = undefined
  }
  if (upstream?.ok) {
    sample.cacheStatus = upstream.headers.get('cf-cache-status') ?? ''
    return finish(
      sample,
      buildResponse(upstream, versioned ? IMMUTABLE_CACHE : UNVERSIONED_CACHE, isHead),
      'cloudinary',
    )
  }
  // Tělo neúspěšné (nebo u HEAD nečtené) odpovědi uvolnit, ať nedrží spojení.
  void upstream?.body?.cancel()

  // Nouzový režim: deaktivovaný účet = 401, chybějící asset = 404, výpadek
  // = 5xx/timeout → záloha z R2. `raw` (SVG) se podává tak, jak je.
  const imageOptions = resourceType === 'image' ? cfImageOptions(transform) : null
  for (const r2Key of deriveR2Keys(key)) {
    // Chyba R2 bindingu (výjimka, ne jen miss) nesmí shodit celý požadavek —
    // radši řízená odpověď níž než neodchycená 1101.
    const exists = await env.BACKUP.head(r2Key).catch(() => null)
    if (!exists) continue

    if (imageOptions) {
      try {
        const resized = await fetch(`https://${env.BACKUP_HOST}/${encodeURI(r2Key)}`, {
          signal: AbortSignal.timeout(10_000),
          cf: { image: imageOptions, cacheEverything: true, cacheTtl: 300 },
        })
        if (resized.ok)
          return finish(sample, buildResponse(resized, FALLBACK_CACHE, isHead), 'fallback')
        void resized.body?.cancel()
      } catch {
        // zmenšování nedostupné (kvóta/vypnuto) → poslední záchrana níž
      }
    }

    // Poslední záchrana: surový originál přímo z bucketu.
    // HEAD obsloužíme z metadat (exists), ať se tělo z R2 zbytečně nestahuje.
    const object = isHead ? exists : await env.BACKUP.get(r2Key).catch(() => null)
    if (!object) continue
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    if (!headers.get('content-type')) headers.set('content-type', 'application/octet-stream')
    headers.set('content-length', String(object.size))
    headers.set('cache-control', FALLBACK_CACHE)
    headers.set('vary', 'Accept')
    headers.set('x-content-type-options', 'nosniff')
    const body = !isHead && 'body' in object ? (object.body as ReadableStream) : null
    return finish(sample, new Response(body, { status: 200, headers }), 'fallback')
  }

  // Není ani na Cloudinary, ani v záloze → propagovat stav upstreamu.
  return finish(
    sample,
    new Response('Image unavailable', { status: upstream?.status ?? 502 }),
    'unavailable',
  )
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
    }
    try {
      return await serve(request, env, sample)
    } finally {
      record(request, env, sample)
    }
  },
}

export default mediaProxy
