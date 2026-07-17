import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Regrese #22 + #23: výpadek DB se dřív maskoval jako prázdný výsledek → route
// zavolala notFound() → 404. Skutečná chyba tak byla neviditelná. Datová vrstva
// teď chybu DB PROPOUŠTÍ ven (→ error boundary → 500), zatímco úspěšné
// „nenalezeno" (prázdný find) dál vrací prázdné pole (→ legitimní 404).
//
// Mockujeme jen `getDb` — díky tomu se do testu nevtáhne payload.config ani
// žádná reálná DB. V testovém prostředí (NODE_ENV=test) navíc `cached()` v
// payload.ts vrací funkci napřímo (bez unstable_cache), takže testujeme
// skutečnou větev try/catch v exportovaných obalech.
const { findMock } = vi.hoisted(() => ({ findMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
  getDb: async () => ({ find: findMock }),
}))

import { fetchPageByFullSlug, fetchArticleBySlug } from '@/lib/payload'

describe('maskované chyby DB (regrese #22/#23)', () => {
  beforeEach(() => {
    findMock.mockReset()
    // Chybová větev loguje přes console.error — v testu ho ztlumíme.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('#22 fetchPageByFullSlug: výpadek DB PROPADNE (nemaskuje se jako 404)', async () => {
    findMock.mockRejectedValue(new Error('DB spojení selhalo'))
    await expect(fetchPageByFullSlug('/vypadek-db-stranka')).rejects.toThrow('DB spojení selhalo')
  })

  it('#22 fetchPageByFullSlug: úspěšné prázdno vrací [] (skutečné 404 zůstává)', async () => {
    findMock.mockResolvedValue({ docs: [] })
    await expect(fetchPageByFullSlug('/opravdu-neexistuje')).resolves.toEqual({
      data: { pages: [] },
    })
  })

  it('#23 fetchArticleBySlug: výpadek DB PROPADNE (nemaskuje se jako 404)', async () => {
    findMock.mockRejectedValue(new Error('DB spojení selhalo'))
    await expect(fetchArticleBySlug('vypadek-db-clanek')).rejects.toThrow('DB spojení selhalo')
  })

  it('#23 fetchArticleBySlug: úspěšné prázdno vrací [] (skutečné 404 zůstává)', async () => {
    findMock.mockResolvedValue({ docs: [] })
    await expect(fetchArticleBySlug('opravdu-neexistuje')).resolves.toEqual({
      data: { articles: [] },
    })
  })
})
