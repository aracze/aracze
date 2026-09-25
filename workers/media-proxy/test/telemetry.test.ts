import { describe, expect, it } from 'vitest'
import {
  acceptClass,
  buildDataPoint,
  classifyClient,
  formatOf,
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
  it('HIT a podmíněné dotazy nestahují tělo, MISS/EXPIRED/bez hlavičky ano', () => {
    expect(originBytes({ ...base, cacheStatus: 'HIT' })).toBe(0)
    expect(originBytes({ ...base, cacheStatus: 'REVALIDATED' })).toBe(0)
    expect(originBytes({ ...base, cacheStatus: 'MISS' })).toBe(1000)
    expect(originBytes({ ...base, cacheStatus: 'EXPIRED' })).toBe(1000)
    expect(originBytes({ ...base, cacheStatus: '' })).toBe(1000)
  })
  it('záloha z R2 ani odmítnutí Cloudinary nestojí', () => {
    expect(originBytes({ outcome: 'fallback', cacheStatus: '', bytes: 1000 })).toBe(0)
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
      doubles: [200, 54321, 54321],
    })
  })
})
