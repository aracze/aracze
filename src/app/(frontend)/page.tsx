import { fetchRootPages } from '@/lib/payload'
import { Homepage } from '@/components/layout/homepage/homepage'

// Stránka se cachuje a na pozadí obnovuje po 5 min (ISR). Při publikaci obsahu
// ji CMS obnoví okamžitě přes /api/cache (revalidateTag). Prefetch i navigace
// tak dostávají hotovou verzi z cache místo drahého re-renderu při každém
// požadavku. Podstránky (/[...slug]) se generují on-demand, takže build CMS
// nepotřebuje; homepage se prerenderuje s odolným fetchem (viz lib/payload).
export const revalidate = 300

export default async function Home() {
  const { data } = await fetchRootPages()

  return <Homepage homepage={data?.homepage} />
}
