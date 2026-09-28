import { afterEach, describe, expect, it, vi } from 'vitest'
import mediaProxy, { type Env } from '../src/index'
import { robotsTxt } from '../src/media-path'
import type { Sample } from '../src/telemetry'

// /robots.txt se obslouží před parsováním cesty a bez sítě i R2 — prázdný Env stačí.
const env = {} as Env
const call = (method: string, path: string) =>
  mediaProxy.fetch(new Request(`https://media.ara.cz${path}`, { method }), env)

describe('media proxy: /robots.txt', () => {
  it('GET vrátí text robots.txt s hlavičkami a denní keší', async () => {
    const response = await call('GET', '/robots.txt')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe(robotsTxt())
  })

  it('HEAD vrátí stejné hlavičky a prázdné tělo', async () => {
    const response = await call('HEAD', '/robots.txt')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')
    expect(response.body).toBeNull()
  })

  it('query string ani jiná metoda robots.txt neobslouží jinak než web', async () => {
    // Query se u fotek zahazuje; u robots.txt platí totéž (boti ho nepřidávají).
    expect((await call('GET', '/robots.txt?x=1')).status).toBe(200)
    expect((await call('POST', '/robots.txt')).status).toBe(405)
  })
})

describe('media proxy: měření (Analytics Engine)', () => {
  // Falešný binding: posbírá datové body, ať jde ověřit schéma bez sítě.
  const points: { indexes?: unknown[]; blobs?: unknown[]; doubles?: number[] }[] = []
  const statsEnv = {
    STATS: { writeDataPoint: (point: (typeof points)[number]) => void points.push(point) },
  } as unknown as Env

  it('zapíše vzorek i pro robots.txt a odmítnuté cesty (bez subrequestu)', async () => {
    points.length = 0
    const robots = await mediaProxy.fetch(
      new Request('https://media.ara.cz/robots.txt', { headers: { 'user-agent': 'GPTBot/1.0' } }),
      statsEnv,
    )
    expect(robots.status).toBe(200)
    const rejected = await mediaProxy.fetch(
      new Request('https://media.ara.cz/image/upload/w_3840/v1/x.jpg', {
        headers: { 'user-agent': 'curl/8.0', accept: 'image/avif,*/*' },
      }),
      statsEnv,
    )
    expect(rejected.status).toBe(400)

    expect(points).toHaveLength(2)
    expect(points[0].indexes).toEqual(['robots'])
    expect(points[0].blobs?.slice(0, 4)).toEqual(['robots', '', 'ai-bot', 'gptbot'])
    expect(points[0].doubles?.[0]).toBe(200)
    expect(points[1].indexes).toEqual(['rejected'])
    expect(points[1].blobs?.slice(0, 6)).toEqual(['rejected', '', 'other-bot', 'curl', 'avif', ''])
    expect(points[1].doubles).toEqual([400, 0, 0, 0])
  })

  describe('cesta přes Cloudinary (fetch podvržený)', () => {
    afterEach(() => vi.unstubAllGlobals())
    const mediaEnv = {
      ...statsEnv,
      CLOUDINARY_ORIGIN: 'https://res.cloudinary.com/test',
      BACKUP_HOST: 'backup.example',
      BACKUP: { head: async () => null },
    } as unknown as Env
    const imageUrl =
      'https://media.ara.cz/image/upload/f_auto,q_auto,c_limit,w_640/v1753093400/abc.jpg'
    const browser = { 'user-agent': 'Mozilla/5.0 Safari', accept: 'image/avif,image/webp,*/*' }

    it('zapíše stav keše subrequestu, TTFB a bajty; HIT = 0 bajtů z Cloudinary', async () => {
      points.length = 0
      vi.stubGlobal('fetch', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return new Response('x'.repeat(10), {
          status: 200,
          headers: {
            'content-type': 'image/avif',
            'content-length': '10',
            'cf-cache-status': 'HIT',
          },
        })
      })
      const response = await mediaProxy.fetch(new Request(imageUrl, { headers: browser }), mediaEnv)
      expect(response.status).toBe(200)
      expect(response.headers.get('x-upstream-cache')).toBe('HIT')
      expect(points).toHaveLength(1)
      const [point] = points
      expect(point.blobs?.slice(0, 8)).toEqual([
        'cloudinary',
        'HIT',
        'browser',
        '',
        'avif',
        '640',
        'avif',
        'f_avif,q_auto,c_limit,w_640',
      ])
      expect(point.blobs?.slice(8, 10)).toEqual(['image', 'versioned'])
      const [status, bytes, originBytes, durationMs] = point.doubles ?? []
      expect([status, bytes, originBytes]).toEqual([200, 10, 0])
      expect(durationMs).toBeGreaterThanOrEqual(1)
    })

    it('MISS počítá bajty jako stažené z Cloudinary', async () => {
      points.length = 0
      vi.stubGlobal(
        'fetch',
        async () =>
          new Response('x'.repeat(10), {
            status: 200,
            headers: { 'content-length': '10', 'cf-cache-status': 'MISS' },
          }),
      )
      await mediaProxy.fetch(new Request(imageUrl, { headers: browser }), mediaEnv)
      expect(points[0].blobs?.[1]).toBe('MISS')
      expect(points[0].doubles?.slice(0, 3)).toEqual([200, 10, 10])
    })

    it('ne-2xx upstream bez zálohy: stav keše se zapíše i tak, výsledek unavailable', async () => {
      points.length = 0
      vi.stubGlobal(
        'fetch',
        async () => new Response('nope', { status: 404, headers: { 'cf-cache-status': 'HIT' } }),
      )
      const response = await mediaProxy.fetch(new Request(imageUrl, { headers: browser }), mediaEnv)
      expect(response.status).toBe(404)
      expect(points[0].blobs?.slice(0, 2)).toEqual(['unavailable', 'HIT'])
      expect(points[0].doubles?.[2]).toBe(0)
    })
  })

  it('chyba měření neshodí odpověď', async () => {
    const broken = {
      STATS: {
        writeDataPoint: () => {
          throw new Error('limit')
        },
      },
    } as unknown as Env
    const response = await mediaProxy.fetch(new Request('https://media.ara.cz/robots.txt'), broken)
    expect(response.status).toBe(200)
  })

  it('bez bindingu se nic neměří a vše funguje jako dřív', async () => {
    const response = await mediaProxy.fetch(new Request('https://media.ara.cz/robots.txt'), env)
    expect(response.status).toBe(200)
  })

  it('typ Sample odpovídá tomu, co Worker plní (kompilační kontrola)', () => {
    const sample: Sample = {
      outcome: 'robots',
      cacheStatus: '',
      transform: null,
      resourceType: '',
      versioned: false,
      status: 200,
      bytes: 0,
      durationMs: 0,
    }
    expect(sample.outcome).toBe('robots')
  })
})
