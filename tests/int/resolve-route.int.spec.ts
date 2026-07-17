import { describe, it, expect, beforeEach, vi } from 'vitest'

// #1 — TVRDÝ 404: rozhodnutí „stránka / článek / 404" je vytažené do
// resolveSlugRoute, aby ho mohl sdílet layout segmentu (autoritativní check nad
// loading kostrou → skutečný HTTP 404) i page.tsx (render). Tenhle test hlídá
// právě tu rozhodovací logiku; fetche z datové vrstvy jsou zamockované.
const { fetchPageByFullSlug, fetchArticleBySlug } = vi.hoisted(() => ({
  fetchPageByFullSlug: vi.fn(),
  fetchArticleBySlug: vi.fn(),
}))

vi.mock('@/lib/payload', () => ({ fetchPageByFullSlug, fetchArticleBySlug }))

import { resolveSlugRoute } from '@/lib/resolve-route'

const noPage = { data: { pages: [] } }
const noArticle = { data: { articles: [], validParentSlugs: [] } }

describe('#1 resolveSlugRoute (stránka / článek / 404)', () => {
  beforeEach(() => {
    fetchPageByFullSlug.mockReset()
    fetchArticleBySlug.mockReset()
  })

  it('existující stránka → kind "page"', async () => {
    fetchPageByFullSlug.mockResolvedValue({
      data: { pages: [{ id: 1, fullSlug: '/norsko/jidlo' }] },
    })
    fetchArticleBySlug.mockResolvedValue(noArticle)

    const r = await resolveSlugRoute('norsko/jidlo')
    expect(r.kind).toBe('page')
    // článek se vůbec nedohledává, když cesta sedí na stránku
    expect(fetchArticleBySlug).not.toHaveBeenCalled()
  })

  it('článek pod platným rodičem → kind "article" (i pod vedlejším)', async () => {
    fetchPageByFullSlug.mockResolvedValue(noPage)
    fetchArticleBySlug.mockResolvedValue({
      data: {
        articles: [{ id: 9, slug: 'karneval', title: 'Karneval' }],
        validParentSlugs: ['francie', 'evropa'],
      },
    })

    // vedlejší rodič „evropa" je v validParentSlugs → uznáno
    const r = await resolveSlugRoute('evropa/karneval')
    expect(r.kind).toBe('article')
    if (r.kind === 'article') expect(r.parentSlug).toBe('evropa')
  })

  it('článek pod cizím rodičem („duch") → kind "notFound"', async () => {
    fetchPageByFullSlug.mockResolvedValue(noPage)
    fetchArticleBySlug.mockResolvedValue({
      data: {
        articles: [{ id: 9, slug: 'karneval', title: 'Karneval' }],
        validParentSlugs: ['francie', 'evropa'],
      },
    })

    // „nemecko" NENÍ mezi platnými rodiči → 404
    const r = await resolveSlugRoute('nemecko/karneval')
    expect(r.kind).toBe('notFound')
  })

  it('nic (ani stránka, ani článek) → kind "notFound"', async () => {
    fetchPageByFullSlug.mockResolvedValue(noPage)
    fetchArticleBySlug.mockResolvedValue(noArticle)

    const r = await resolveSlugRoute('uplny-nesmysl-xyz')
    expect(r.kind).toBe('notFound')
    // jednosegmentová cesta se jako článek nedohledává (článek = rodič + slug)
    expect(fetchArticleBySlug).not.toHaveBeenCalled()
  })
})
