import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isValidArticleParent } from '@/lib/utils'

// #21 — „špatný rodič / SEO": článek smí žít jen pod svou mainPage NEBO některou
// z pages. Datová vrstva (fetchArticleBySlug) k článku vrací seznam platných
// rodičů (validParentSlugs); route pak přes isValidArticleParent rozhodne, zda
// cestu uzná (200), nebo je to „duch" (404). Kanonická URL míří na mainPage.
const { findMock } = vi.hoisted(() => ({ findMock: vi.fn() }))

vi.mock('@/lib/db', () => ({
  getDb: async () => ({ find: findMock }),
}))

import { fetchArticleBySlug } from '@/lib/payload'

describe('#21 isValidArticleParent (čistý helper)', () => {
  it('uzná mainPage i vedlejší stránku, odmítne cizí', () => {
    const valid = ['francie', 'anglie', 'festivaly-a-udalosti']
    expect(isValidArticleParent('francie', valid)).toBe(true) // hlavní
    expect(isValidArticleParent('anglie', valid)).toBe(true) // vedlejší
    expect(isValidArticleParent('nemecko', valid)).toBe(false) // „duch"
  })

  it('normalizuje lomítka na obou stranách', () => {
    expect(isValidArticleParent('/anglie/', ['anglie'])).toBe(true)
    expect(isValidArticleParent('evropa/francie', ['evropa/francie'])).toBe(true)
  })

  it('bez platných rodičů (sirotek) odmítne vše', () => {
    expect(isValidArticleParent('cokoliv', [])).toBe(false)
    expect(isValidArticleParent('cokoliv', undefined)).toBe(false)
  })
})

describe('#21 fetchArticleBySlug: validParentSlugs (mainPage + pages)', () => {
  beforeEach(() => {
    findMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('vrátí normalizované slugy všech rodičů a mainPage jako kanonický', async () => {
    findMock.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'articles') {
        return {
          docs: [
            {
              id: 1,
              slug: 'karneval-v-benatkach',
              title: 'Karneval v Benátkách',
              text: null,
              mainPage: 10,
              pages: [20, 30],
            },
          ],
        }
      }
      if (args.collection === 'pages') {
        // Pořadí schválně jiné než v článku — validParentSlugs nesmí na pořadí záviset.
        return {
          docs: [
            { id: 20, title: 'Anglie', fullSlug: '/anglie' },
            { id: 10, title: 'Francie', fullSlug: '/francie' },
            { id: 30, title: 'Festivaly a události', fullSlug: '/festivaly-a-udalosti' },
          ],
        }
      }
      return { docs: [] }
    })

    const { data } = await fetchArticleBySlug('karneval-v-benatkach')

    expect([...data.validParentSlugs].sort()).toEqual(
      ['anglie', 'festivaly-a-udalosti', 'francie'].sort(),
    )
    // mainPage (Francie) je kanonický rodič → z něj se skládá canonical URL.
    expect(data.articles[0].mainPage).toMatchObject({ fullSlug: '/francie' })
  })

  it('článek bez rodičů → prázdné validParentSlugs (route dá 404 všude)', async () => {
    findMock.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'articles') {
        return { docs: [{ id: 2, slug: 'sirotek', title: 'Sirotek', text: null, pages: [] }] }
      }
      return { docs: [] }
    })

    const { data } = await fetchArticleBySlug('sirotek')
    expect(data.validParentSlugs).toEqual([])
  })
})
