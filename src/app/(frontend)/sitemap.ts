import type { MetadataRoute } from 'next'
import { fetchSitemapEntries } from '@/lib/payload'
import { getSiteURL } from '@/lib/utils'

// Regenerace jednou za hodinu (ISR) — sitemap se sestavuje z Payloadu za běhu.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteURL()

  // Sitemap se prerenderuje i při buildu. Když CMS není dostupné (např. build
  // obrazu v GitHub Actions), nespadneme — vrátíme aspoň homepage a zbytek se
  // doplní při další regeneraci (ISR) za běhu, kdy už CMS běží.
  let pages: Awaited<ReturnType<typeof fetchSitemapEntries>>['pages'] = []
  let articles: Awaited<ReturnType<typeof fetchSitemapEntries>>['articles'] = []
  try {
    ;({ pages, articles } = await fetchSitemapEntries())
  } catch (err) {
    console.error(`Sitemap: CMS nedostupné, vracím jen homepage. Detail: ${err}`)
    return [{ url: site, changeFrequency: 'daily', priority: 1 }]
  }

  const toUrl = (path: string) => `${site}${path.startsWith('/') ? path : `/${path}`}`

  const entries: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: 'daily', priority: 1 },
    ...pages.map((p) => ({
      url: toUrl(p.path),
      lastModified: p.lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...articles.map((a) => ({
      url: toUrl(a.path),
      lastModified: a.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]

  // Deduplikace podle URL (kdyby se cesta stránky a článku shodovala).
  const seen = new Set<string>()
  return entries.filter((e) => {
    if (seen.has(e.url)) return false
    seen.add(e.url)
    return true
  })
}
