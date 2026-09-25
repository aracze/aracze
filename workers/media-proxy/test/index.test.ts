import { describe, expect, it } from 'vitest'
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
    expect(points[1].doubles).toEqual([400, 0, 0])
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
    }
    expect(sample.outcome).toBe('robots')
  })
})
