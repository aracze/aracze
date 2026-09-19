import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

/**
 * Jednorázový doběh (19. 9. 2026) ke dvěma nálezům z Google Search Console:
 *
 * 1. „Duplicate without user-selected canonical" — články bez vyplněné HLAVNÍ
 *    STRÁNKY. Článek visí pod několika místy a je dostupný na všech jejich
 *    adresách; canonical se bere z `mainPage` (src/app/(frontend)/[...slug]/
 *    page.tsx) a bez ní každá adresa označila za originál sama sebe.
 *    Kam který článek patří, rozhodl uživatel: cestopis pod svou zemi,
 *    ostatní pod rubriku, která ho tematicky drží.
 *
 * 2. „Not found (404)" u 15 turistických cílů. Starý web měl ploché adresy,
 *    kde jméno místa bylo součástí slugu („konstanz-minster"); migrace prefix
 *    uřízla, protože ho nová hierarchie dodá z rodiče. Pravidlo uživatele:
 *    adresa se má rovnat názvu cíle, takže se u cílů, jejichž název jméno
 *    místa obsahuje, vrací původní (legacy) slug. Vedlejší efekt: adresy se
 *    vrací na ty, které má Google zaindexované, takže je netřeba přesměrovávat.
 *
 * Slug se zapisuje přes Local API, aby plugin nested-docs přepočítal `fullSlug`
 * i `breadcrumbs` (u cíle samotného i u případných potomků) — ruční SQL by
 * muselo sahat do čtyř tabulek a verzí.
 *
 *   pnpm seo:canonical-slugs            # dry-run: vypíše, co by zapsal
 *   pnpm seo:canonical-slugs -- --apply # zapíše do CMS
 *
 * Idempotentní: co už je nastavené, skript přeskočí. Po běhu na PRODUKCI
 * `docker compose up -d --force-recreate cms` (cache mimo hooky, viz README).
 */

const APPLY = process.argv.includes('--apply')

/** Článek (slug) → hlavní stránka (fullSlug), ze které bude canonical. */
const ARTICLE_MAIN_PAGES: Record<string, string> = {
  // Cestopis ze Srí Lanky visí pod šesti tamními městy; domovem je země.
  // Zároveň spraví 404 na /sri-lanka/clanky/… ze starého webu — ta adresa
  // padala právě proto, že článek pod samotnou Srí Lanku přiřazený nebyl.
  'sri-lanka-3-tydny-v-upocenem-raji': '/sri-lanka',
  // Celosvětové výběry → rubrika Top ze světa.
  '10-uzasnych-mist-k-navsteve-pred-tim-nez-zmizi': '/top-ze-sveta',
  'vyber-nejlepsich-mest-pro-surfovani': '/top-ze-sveta',
  // Tematické rubriky sedí líp než Top ze světa (rozhodnutí uživatele).
  'nejkrasnejsi-ledove-sochy-a-jejich-vystavy': '/festivaly-a-udalosti',
  'svetova-tradicni-vanocni-jidla': '/chute-sveta',
}

/** Turistický cíl (dnešní fullSlug) → slug, pod kterým ho zná starý web a Google. */
const TARGET_SLUGS: Record<string, string> = {
  '/anglie/windsor/castle': 'windsor-castle',
  '/kypr/paphos/acropolis': 'paphos-acropolis',
  '/recko/lefkada/nidri/dimossari-waterfalls': 'nidri-dimossari-waterfalls',
  '/severni-irsko/armagh/gaol': 'armagh-gaol',
  '/severni-irsko/armagh/county-museum': 'armagh-county-museum',
  '/tunisko/djerba/explore-park': 'djerba-explore-park',
  '/belorusko/brest/fortress': 'brest-fortress',
  '/novy-zeland/hokitika/gorge': 'hokitika-gorge',
  '/recko/santorini/foto-safari': 'santorini-foto-safari',
  '/chorvatsko/ostrov-krk/baska/akvarium': 'baska-akvarium',
  '/nemecko/konstanz/minster': 'konstanz-minster',
  '/usa/fairbanks/ice-museum': 'fairbanks-ice-museum',
  '/polsko/lodz/pohadkova-lodz-bajkowa': 'lodz-pohadkova-lodz-bajkowa',
  '/thajsko/chiang-mai/grand-canyon': 'chiang-mai-grand-canyon',
  '/myanmar/mingun/pahtodawgyi-pagoda': 'mingun-pahtodawgyi-pagoda',
}

async function main() {
  const payload = await getPayload({ config: configPromise })

  // ── 1. Hlavní stránka článků ───────────────────────────────────────────────
  const pageSlugs = [...new Set(Object.values(ARTICLE_MAIN_PAGES))]
  const pagesRes = await payload.find({
    collection: 'pages',
    overrideAccess: true,
    where: { fullSlug: { in: pageSlugs } },
    depth: 0,
    limit: pageSlugs.length,
    select: { title: true, fullSlug: true },
    joins: false,
  })
  const pageBySlug = new Map(
    (pagesRes.docs as unknown as { id: number; title: string; fullSlug: string }[]).map((d) => [
      d.fullSlug,
      d,
    ]),
  )

  let articlesWritten = 0
  for (const [articleSlug, pageSlug] of Object.entries(ARTICLE_MAIN_PAGES)) {
    const page = pageBySlug.get(pageSlug)
    if (!page) {
      console.warn(`CHYBÍ stránka ${pageSlug} — článek ${articleSlug} přeskočen`)
      continue
    }
    const found = await payload.find({
      collection: 'articles',
      overrideAccess: true,
      where: { slug: { equals: articleSlug } },
      depth: 0,
      limit: 2,
      select: { title: true, slug: true, mainPage: true, pages: true },
      joins: false,
    })
    // `slug` není v kolekci articles unikátní — při dvou shodách nelze poznat,
    // kterému článku hlavní stránka patří, tak radši nic (CodeRabbit, PR #116).
    if (found.docs.length > 1) {
      console.warn(`NEJEDNOZNAČNÉ: slug ${articleSlug} má ${found.docs.length} článků — přeskočeno`)
      continue
    }
    const article = found.docs[0] as unknown as
      | { id: number; title: string; mainPage?: number | { id: number } | null; pages?: unknown[] }
      | undefined
    if (!article) {
      console.warn(`CHYBÍ článek ${articleSlug} — přeskočeno`)
      continue
    }
    const currentMain =
      typeof article.mainPage === 'object' && article.mainPage !== null
        ? article.mainPage.id
        : (article.mainPage ?? null)
    if (currentMain === page.id) {
      console.log(`beze změny  ${article.title} → už má ${pageSlug}`)
      continue
    }
    console.log(
      `${APPLY ? 'ZAPISUJI  ' : 'dry-run   '} ${article.title} → hlavní stránka ${pageSlug}` +
        (currentMain ? ` (dosud jiná: ${currentMain})` : ' (dosud prázdná)'),
    )
    if (!APPLY) continue
    await payload.update({
      collection: 'articles',
      id: article.id,
      depth: 0,
      overrideAccess: true,
      data: { mainPage: page.id },
    })
    articlesWritten++
  }

  // ── 2. Slugy turistických cílů ─────────────────────────────────────────────
  const targetSlugs = Object.keys(TARGET_SLUGS)
  const targetsRes = await payload.find({
    collection: 'pages',
    overrideAccess: true,
    where: { fullSlug: { in: targetSlugs } },
    depth: 0,
    limit: targetSlugs.length,
    select: { title: true, slug: true, fullSlug: true },
    joins: false,
  })
  const targetBySlug = new Map(
    (
      targetsRes.docs as unknown as { id: number; title: string; slug: string; fullSlug: string }[]
    ).map((d) => [d.fullSlug, d]),
  )

  let slugsWritten = 0
  for (const [fullSlug, newSlug] of Object.entries(TARGET_SLUGS)) {
    const page = targetBySlug.get(fullSlug)
    if (!page) {
      // Buď už přejmenováno (idempotence), nebo stránka chybí — rozlišíme dotazem.
      const already = await payload.find({
        collection: 'pages',
        overrideAccess: true,
        where: { slug: { equals: newSlug } },
        depth: 0,
        limit: 1,
        select: { fullSlug: true },
        joins: false,
      })
      if (already.docs.length > 0) {
        console.log(
          `beze změny  ${fullSlug} → už je ${(already.docs[0] as { fullSlug?: string }).fullSlug}`,
        )
      } else {
        console.warn(`CHYBÍ stránka ${fullSlug} — přeskočeno`)
      }
      continue
    }
    console.log(`${APPLY ? 'ZAPISUJI  ' : 'dry-run   '} ${page.title}: ${page.slug} → ${newSlug}`)
    if (!APPLY) continue
    await payload.update({
      collection: 'pages',
      id: page.id,
      depth: 0,
      overrideAccess: true,
      data: { slug: newSlug },
    })
    slugsWritten++
  }

  console.log(
    APPLY
      ? `Hotovo: ${articlesWritten} článků, ${slugsWritten} adres cílů.`
      : 'Dry-run hotov (nic nezapsáno).',
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
