import { describe, expect, it } from 'vitest'
import {
  acceptClass,
  buildDataPoint,
  classifyClient,
  formatOf,
  isDisguisedScraper,
  originBytes,
  widthOf,
  type Sample,
} from '../src/telemetry'

describe('classifyClient', () => {
  it('pozná vyhledávací roboty, Googlebot-Image dřív než obecný Googlebot', () => {
    expect(classifyClient('Googlebot-Image/1.0 (+http://www.google.com/bot.html)')).toEqual({
      client: 'search-bot',
      bot: 'googlebot-image',
    })
    expect(
      classifyClient('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
    ).toEqual({ client: 'search-bot', bot: 'googlebot' })
    expect(classifyClient('Mozilla/5.0 (compatible; bingbot/2.0)')).toEqual({
      client: 'search-bot',
      bot: 'bingbot',
    })
  })

  it('pozná AI roboty dřív než obecné „bot“', () => {
    expect(classifyClient('Mozilla/5.0 (compatible; GPTBot/1.2)')).toEqual({
      client: 'ai-bot',
      bot: 'gptbot',
    })
    expect(classifyClient('Mozilla/5.0 (compatible; ClaudeBot/1.0)')).toEqual({
      client: 'ai-bot',
      bot: 'claudebot',
    })
    expect(classifyClient('Amazonbot/0.1')).toEqual({ client: 'ai-bot', bot: 'amazonbot' })
  })

  it('ostatní automaty: skripty, náhledy sociálních sítí, cokoliv s „bot“', () => {
    expect(classifyClient('curl/8.4.0')).toEqual({ client: 'other-bot', bot: 'curl' })
    expect(classifyClient('facebookexternalhit/1.1')).toEqual({
      client: 'other-bot',
      bot: 'facebookexternalhit',
    })
    expect(classifyClient('Mozilla/5.0 (compatible; SomethingBot/3.0)')).toEqual({
      client: 'other-bot',
      bot: 'bot',
    })
    expect(classifyClient(null)).toEqual({ client: 'other-bot', bot: 'empty' })
    expect(classifyClient('')).toEqual({ client: 'other-bot', bot: 'empty' })
  })

  it('běžný prohlížeč je browser bez jména', () => {
    expect(
      classifyClient(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ client: 'browser', bot: '' })
  })
})

describe('acceptClass', () => {
  it('avif má přednost před webp, jinak none', () => {
    expect(acceptClass('image/avif,image/webp,image/apng,*/*;q=0.8')).toBe('avif')
    expect(acceptClass('image/webp,*/*;q=0.8')).toBe('webp')
    expect(acceptClass('*/*')).toBe('none')
    expect(acceptClass(null)).toBe('none')
  })
})

describe('widthOf / formatOf', () => {
  it('vytáhne šířku a formát z transformace, chybějící = prázdné / orig', () => {
    expect(widthOf('f_avif,q_auto,c_limit,w_640')).toBe('640')
    expect(widthOf('c_fit,w_790')).toBe('790')
    expect(widthOf('c_fill,g_auto,ar_1:1')).toBe('')
    expect(widthOf(null)).toBe('')
    expect(formatOf('f_avif,q_auto,c_limit,w_640')).toBe('avif')
    expect(formatOf('f_webp,q_auto,c_limit,w_640')).toBe('webp')
    // f_auto po vyjednání bez moderního formátu zmizí → původní soubor
    expect(formatOf('q_auto,c_limit,w_640')).toBe('orig')
    expect(formatOf(null)).toBe('orig')
  })
})

describe('originBytes', () => {
  const base = { outcome: 'cloudinary' as const, bytes: 1000 }
  it('z keše (HIT, podmíněné dotazy) = 0, i malými písmeny / s mezerami', () => {
    for (const status of ['HIT', 'REVALIDATED', 'STALE', 'UPDATING', 'hit', ' HIT ']) {
      expect(originBytes({ ...base, cacheStatus: status })).toBe(0)
    }
  })
  it('stažení (MISS, EXPIRED, BYPASS, DYNAMIC), CHYBĚJÍCÍ hlavička i neznámý stav = celé tělo', () => {
    // '' = stažení: ověřeno 5 dny měření (TTFB '' ≈ MISS, ne HIT), viz komentář v kódu.
    for (const status of ['MISS', 'EXPIRED', 'BYPASS', 'DYNAMIC', '', 'NONE/UNKNOWN', 'novy']) {
      expect(originBytes({ ...base, cacheStatus: status })).toBe(1000)
    }
  })
  it('záloha z R2 ani odmítnutí Cloudinary nestojí', () => {
    expect(originBytes({ outcome: 'fallback', cacheStatus: 'MISS', bytes: 1000 })).toBe(0)
    expect(originBytes({ outcome: 'backup', cacheStatus: 'MISS', bytes: 1000 })).toBe(0)
    expect(originBytes({ outcome: 'rejected', cacheStatus: '', bytes: 20 })).toBe(0)
  })
})

describe('buildDataPoint', () => {
  it('drží schéma blobů/doubles z README (pořadí = smlouva pro SQL dotazy)', () => {
    const sample: Sample = {
      outcome: 'cloudinary',
      cacheStatus: 'MISS',
      transform: 'f_avif,q_auto,c_limit,w_828',
      resourceType: 'image',
      versioned: true,
      status: 200,
      bytes: 54321,
      durationMs: 812,
    }
    expect(
      buildDataPoint(sample, {
        userAgent: 'Googlebot-Image/1.0',
        accept: 'image/avif,image/webp,*/*',
        country: 'US',
        method: 'GET',
      }),
    ).toEqual({
      indexes: ['cloudinary'],
      blobs: [
        'cloudinary',
        'MISS',
        'search-bot',
        'googlebot-image',
        'avif',
        '828',
        'avif',
        'f_avif,q_auto,c_limit,w_828',
        'image',
        'versioned',
        'US',
        'GET',
      ],
      doubles: [200, 54321, 54321, 812],
    })
  })
})

describe('isDisguisedScraper', () => {
  const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
  it('UA prohlížeče bez Accept pro obrázky a bez Sec-Fetch-Dest = scraper', () => {
    expect(isDisguisedScraper({ userAgent: chrome, accept: '*/*', secFetchDest: null })).toBe(true)
    expect(isDisguisedScraper({ userAgent: chrome, accept: null, secFetchDest: null })).toBe(true)
    expect(
      isDisguisedScraper({
        userAgent: chrome,
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        secFetchDest: null,
      }),
    ).toBe(true)
  })
  it('skutečný prohlížeč projde: Accept s image/, nebo Sec-Fetch-Dest (i přímé otevření adresy)', () => {
    expect(
      isDisguisedScraper({
        userAgent: chrome,
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        secFetchDest: 'image',
      }),
    ).toBe(false)
    // staré Safari: jen image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5
    expect(
      isDisguisedScraper({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0) Safari/604.1',
        accept: 'image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5',
        secFetchDest: null,
      }),
    ).toBe(false)
    // navigace na adresu fotky v moderním prohlížeči: Sec-Fetch-Dest: document
    expect(
      isDisguisedScraper({
        userAgent: chrome,
        accept: 'text/html,*/*;q=0.8',
        secFetchDest: 'document',
      }),
    ).toBe(false)
  })
  it('známí roboti se neblokují (řídí je robots.txt), ani náhledy sociálních sítí', () => {
    for (const ua of [
      'Googlebot-Image/1.0',
      'facebookexternalhit/1.1',
      'curl/8.0',
      'GPTBot/1.0',
      '',
    ]) {
      expect(isDisguisedScraper({ userAgent: ua, accept: '*/*', secFetchDest: null })).toBe(false)
    }
  })
})
