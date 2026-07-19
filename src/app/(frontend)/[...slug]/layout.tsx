import { notFound } from 'next/navigation'
import { resolveSlugRoute } from '@/lib/resolve-route'

/**
 * Autoritativní 404 pro obsahové cesty (/[...slug]).
 *
 * Proč layout a ne až page.tsx: `notFound()` nastaví HTTP status 404 jen dokud
 * odpověď nezačala streamovat. Jakmile se flushne první Suspense boundary
 * (loading.tsx), status je zamčený na 200 a `notFound()` z page.tsx pak dá jen
 * „soft-404" (200 + stránka nenalezeno). Kontrola tady proto běží v layoutu,
 * takže neexistující cesta vrátí skutečný 404.
 *
 * PODMÍNKA: nad tímto layoutem NESMÍ být žádná loading.tsx (proto bylo
 * `(frontend)/loading.tsx` odstraněno) — jinak by se stream flushnul dřív a byli
 * bychom zpátky u soft-404. Aktuálně žádná loading.tsx neexistuje: kostry
 * nahradil <NavigationProgress /> v kořenovém layoutu (progress bar místo
 * probliknutí kostry) — viz src/components/layout/navigation-progress.tsx.
 *
 * Cena: `resolveSlugRoute` je React-cache sdílené s page.tsx, takže se DB dotazy
 * neopakují — jen se posunuly nad boundary.
 */
export default async function SlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const resolution = await resolveSlugRoute(slug.join('/'))
  if (resolution.kind === 'notFound') notFound()
  return <>{children}</>
}
