// Měření provozu media proxy (Workers Analytics Engine) — čisté funkce.
// Cíl: zjistit z reálného provozu, KDO (člověk / robot) chce JAKÉ varianty
// (šířka, formát) a kolik z toho musí Worker skutečně stáhnout z Cloudinary
// (přenos a transformace = placené kredity). Bez těchto čísel se nedá
// rozhodnout, které šířky vyhodit ani zda vypustit WebP.
// Žádné osobní údaje: ukládá se jen třída klienta, země a adresa obrázku.

/** Co se s požadavkem stalo (index pro vzorkování + blob1). */
export type Outcome =
  | 'cloudinary' // odpověď z upstreamu (stav edge keše viz cacheStatus)
  | 'backup' // záloha z R2 jako hlavní zdroj (MEDIA_SOURCE=backup)
  | 'fallback' // záloha z R2 (Cloudinary neodpověděla)
  | 'unavailable' // ani Cloudinary, ani záloha
  | 'rejected' // 400/404 z parsování cesty
  | 'blocked' // 403: „prohlížeč“ bez Accept pro obrázky (maskovaný scraper)
  | 'robots' // /robots.txt
  | 'method' // 405

export type ClientClass = 'browser' | 'search-bot' | 'ai-bot' | 'other-bot'

export interface Sample {
  outcome: Outcome
  /** Hodnota cf-cache-status SUBREQUESTU na Cloudinary ('' = bez subrequestu, nebo hlavička chybí). */
  cacheStatus: string
  transform: string | null
  resourceType: string
  versioned: boolean
  status: number
  /** content-length odpovědi (0 = neznámá). */
  bytes: number
  /** Doba subrequestu na Cloudinary do příchodu hlaviček (TTFB) v ms; 0 = žádný subrequest. */
  durationMs: number
}

/** Vyhledávací roboti — vodí návštěvníky, chceme je vidět zvlášť. */
const SEARCH_BOTS = [
  'googlebot-image',
  'googlebot',
  'bingbot',
  'bingpreview',
  'yandex',
  'duckduckbot',
  'applebot',
  'baiduspider',
  'seznambot',
  'petalbot',
  'qwantbot',
]

/** AI crawleři a asistenti (trénovací jsou v robots.txt zakázaní, ale chodí). */
const AI_BOTS = [
  'gptbot',
  'oai-searchbot',
  'chatgpt-user',
  'claudebot',
  'claude-searchbot',
  'claude-user',
  'anthropic-ai',
  'ccbot',
  'amazonbot',
  'bytespider',
  'meta-externalagent',
  'meta-externalfetcher',
  'perplexitybot',
  'perplexity-user',
  'google-extended',
  'applebot-extended',
  'cohere-ai',
  'diffbot',
  'youbot',
  'mistralai',
]

/** Ostatní automaty — SEO nástroje, náhledy sociálních sítí, skripty, monitoring. */
const OTHER_BOTS = [
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'slackbot',
  'discordbot',
  'pinterestbot',
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'headlesschrome',
  'lighthouse',
  'uptimerobot',
  'pingdom',
  'python-requests',
  'python-urllib',
  'go-http-client',
  'okhttp',
  'curl/',
  'wget/',
  'java/',
  'libwww',
  'crawler',
  'spider',
  'bot',
]

/**
 * Třída klienta + jméno robota z User-Agentu. Heuristika (Bot Management
 * na free plánu není): stačí pro rozhodnutí o variantách, ne pro bezpečnost.
 */
export function classifyClient(userAgent: string | null): { client: ClientClass; bot: string } {
  const ua = (userAgent ?? '').toLowerCase()
  if (ua === '') return { client: 'other-bot', bot: 'empty' }
  // Pořadí záleží: „googlebot-image" před „googlebot", AI před obecným „bot".
  for (const name of SEARCH_BOTS) if (ua.includes(name)) return { client: 'search-bot', bot: name }
  for (const name of AI_BOTS) if (ua.includes(name)) return { client: 'ai-bot', bot: name }
  for (const name of OTHER_BOTS) {
    if (ua.includes(name)) return { client: 'other-bot', bot: name.replace(/\/$/, '') }
  }
  return { client: 'browser', bot: '' }
}

/**
 * Maskovaný scraper: hlásí se jako prohlížeč, ale chová se jinak — skutečný
 * prohlížeč posílá u obrázku `Accept` s `image/…` (Chrome, Firefox, Safari
 * i staré verze) a moderní navíc `Sec-Fetch-Dest`. V 9/2026 dělali takoví
 * klienti (BD, BR, VN, IN…) ~45 % požadavků a ~60 % přenosu. Známí roboti
 * (vyhledávače, náhledy sociálních sítí, curl…) sem nespadají — ty řídí
 * robots.txt. Navigace na adresu fotky (otevření v nové záložce) má Accept
 * s `text/html` — i ve starém Safari bez Sec-Fetch-Dest — a projde; blokuje
 * se jen holé `*\/*` / chybějící Accept, typické pro HTTP knihovny.
 */
export function isDisguisedScraper(facts: {
  userAgent: string | null
  accept: string | null
  secFetchDest: string | null
}): boolean {
  if (classifyClient(facts.userAgent).client !== 'browser') return false
  if (facts.secFetchDest !== null) return false
  const accept = facts.accept ?? ''
  return !/image\//i.test(accept) && !/text\/html/i.test(accept)
}

/** Nejlepší moderní formát, který klient hlásí v Accept (stejná logika jako negotiateFormat). */
export function acceptClass(accept: string | null): 'avif' | 'webp' | 'none' {
  const value = accept ?? ''
  if (/(^|,)\s*image\/avif\s*(;|,|$)/i.test(value)) return 'avif'
  if (/(^|,)\s*image\/webp\s*(;|,|$)/i.test(value)) return 'webp'
  return 'none'
}

/** Šířka z transformace (`w_640` → '640'), '' když transformace šířku nemá. */
export function widthOf(transform: string | null): string {
  const match = transform?.match(/(?:^|,)w_(\d+)(?:,|$)/)
  return match ? match[1] : ''
}

/** Doručený formát po vyjednání: f_avif/f_webp/f_png/f_jpg, jinak původní soubor. */
export function formatOf(transform: string | null): string {
  const match = transform?.match(/(?:^|,)f_([a-z]+)(?:,|$)/)
  return match ? match[1] : 'orig'
}

/**
 * Stavy edge keše, při kterých Worker tělo z Cloudinary NEstahuje: HIT
 * a podmíněné dotazy (REVALIDATED / STALE / UPDATING). Chybějící hlavička
 * se počítá jako STAŽENÍ: 5 dní měření (27. 9.–2. 10. 2026) ukázalo TTFB
 * u '' 480 ms / p90 1 026 ms = stejné jako MISS (566 / 1 127), zatímco HIT má
 * 28 / 50 ms. Takto spočtený přenos sedí s grafem Cloudinary (~300 MB/den).
 * Cokoli neznámého se konzervativně počítá jako stažení.
 */
const CACHE_SERVED_STATUSES = new Set(['HIT', 'REVALIDATED', 'STALE', 'UPDATING'])

/**
 * Bajty, které Worker reálně stáhl z Cloudinary — přesně tohle Cloudinary
 * účtuje jako přenos. Pozor: je to pravidlo zapečené do dat (double3); pro
 * srovnání přes změny pravidla počítej v SQL z blob2 + double2 (viz README).
 */
export function originBytes(sample: Pick<Sample, 'outcome' | 'cacheStatus' | 'bytes'>): number {
  if (sample.outcome !== 'cloudinary') return 0
  return CACHE_SERVED_STATUSES.has(sample.cacheStatus.trim().toUpperCase()) ? 0 : sample.bytes
}

export interface RequestFacts {
  userAgent: string | null
  accept: string | null
  country: string
  method: string
}

/**
 * Sestaví datový bod pro Analytics Engine. Pořadí blobů/doubles je SCHÉMA —
 * dotazy v README na něj odkazují číslem (blob1 = outcome …); neměnit, jen přidávat.
 */
export function buildDataPoint(
  sample: Sample,
  facts: RequestFacts,
): { indexes: string[]; blobs: string[]; doubles: number[] } {
  const { client, bot } = classifyClient(facts.userAgent)
  return {
    indexes: [sample.outcome],
    blobs: [
      sample.outcome, // blob1
      sample.cacheStatus, // blob2
      client, // blob3
      bot, // blob4
      acceptClass(facts.accept), // blob5
      widthOf(sample.transform), // blob6
      formatOf(sample.transform), // blob7
      sample.transform ?? '', // blob8
      sample.resourceType, // blob9
      sample.versioned ? 'versioned' : 'legacy', // blob10
      facts.country, // blob11
      facts.method, // blob12
    ],
    doubles: [
      sample.status, // double1
      sample.bytes, // double2
      originBytes(sample), // double3
      sample.durationMs, // double4
    ],
  }
}
