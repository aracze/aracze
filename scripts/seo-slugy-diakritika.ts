import 'dotenv/config'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'
import { buildPageUrl } from '../src/lib/page-url'
import { slugify } from '../src/utilities/formatSlug'

/**
 * Doběh (poprvé 19. 9. 2026): slugy stránek ošizené o písmena, která starý web
 * (a první verze hooku slugField) neuměl přepsat a prostě smazal — „Malmö" →
 * `malm`, „Schönbrunn" → `schnbrunn`, „Þjóðmenningarhúsið" → `jomenningarhusi`.
 * Pravidlo uživatele: adresa se rovná názvu, takže se slug přepočítá opravenou
 * `slugify` (src/utilities/formatSlug.ts) a stará adresa dostane 301.
 *
 * POZOR, kritérium je „slug ≠ slugify(název)", ne jen diakritika: skript srovná
 * KAŽDÝ slug s názvem. Slug nastavený v adminu ručně (jiný než z názvu) by při
 * dalším běhu přepsal a přesměroval — proto se pouští vědomě, po přečtení
 * dry-runu, ne jako pravidelná údržba.
 *
 * Co skript dělá:
 *  1. Načte všechny stránky, spočítá `slugify(title)` a vybere PUBLIKOVANÉ, kde
 *     se liší od uloženého slugu. Koncepty vynechá: plugin nested-docs u konceptu
 *     nepřepočítává potomky a jejich stará adresa se nikdy neservírovala.
 *  2. Ze stromu stránek spočítá NOVÉ celé adresy (stejným `buildPageUrl`, jaký
 *     používá plugin — i potomkům přejmenovaných míst) a ověří, že žádná nová
 *     adresa nekoliduje s jinou stránkou. Kandidáty v kolizi vynechá a vypíše.
 *  3. Zapíše `redirects/slugy-diakritika.mjs` pro next.config.mjs: pro každou
 *     přejmenovanou stránku jedno prefixové pravidlo `/stará/:rest*` → `/nová/:rest*`
 *     (`:rest*` bere i holou adresu, takže pokryje stránku, podstránky i články),
 *     seřazené od NEJHLUBŠÍ adresy — Next bere první shodu a potomek s vlastní
 *     změnou musí předběhnout pravidlo svého předka. Nová pravidla se SLUČUJÍ
 *     s těmi, která v souboru už jsou (podle zdrojové adresy), takže další běh
 *     dřívější přesměrování nezahodí. Soubor se přeformátuje prettierem.
 *  4. S `--apply` zapíše nové slugy přes Local API, od kořene ke listům a
 *     SEKVENČNĚ (plugin při uložení sahá i na předky/potomky — souběh = deadlock,
 *     viz README „čtyři pasti"). Stránku s rozpracovaným konceptem přeskočí:
 *     `update` bez `draft: true` staví z POSLEDNÍ verze, takže by koncept
 *     publikoval. Nakonec porovná adresy v DB s předpočítanými.
 *
 *   pnpm seo:slugy-diakritika            # dry-run + přegeneruje soubor redirectů
 *   pnpm seo:slugy-diakritika -- --apply # zapíše do CMS
 *
 * Idempotentní: stránka, jejíž slug už názvu odpovídá, není kandidát. Na PRODUKCI
 * jsou pravidla už zapečená v nasazeném buildu (soubor je v repu) — skript tam
 * mění jen databázi; dry-run musí ukázat stejnou sadu kandidátů jako v repu,
 * jinak nasazený build přesměrování nemá. Po běhu `docker compose up -d
 * --force-recreate cms` (cache mimo hooky).
 */

const APPLY = process.argv.includes('--apply')
const REDIRECTS_FILE = resolve(process.cwd(), 'redirects/slugy-diakritika.mjs')

type Row = {
  id: number
  title: string
  slug: string
  fullSlug: string
  parent: number | null
  category: string | null
  includeInChildUrlPaths: boolean | null
  _status: 'draft' | 'published' | null
}

type Rule = { source: string; destination: string; permanent: true }

const relationId = (v: unknown): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number(v.id) : null

const PREFIX = '/:rest*'
const depth = (path: string) => path.split('/').length

/** Prefixové pravidlo pokrývá cestu → cíl, který by pro ni složilo (null = nepokrývá). */
function coveredBy(rule: Rule, path: string): string | null {
  if (!rule.source.endsWith(PREFIX)) return null
  const base = rule.source.slice(0, -PREFIX.length)
  if (path !== base && !path.startsWith(`${base}/`)) return null
  return rule.destination.slice(0, -PREFIX.length) + path.slice(base.length)
}

/**
 * Sloučí pravidla: prefixová od nejhlubšího zdroje; přesná (bez `:rest*`) jen
 * pokud je žádné prefixové nereprodukuje — přesně tak se dá starší soubor
 * s dvojími pravidly zmenšit bez změny chování.
 */
function normalizeRules(rules: Rule[]): Rule[] {
  const bySource = new Map(rules.map((r) => [r.source, r]))
  const prefixes = [...bySource.values()]
    .filter((r) => r.source.endsWith(PREFIX))
    .sort((a, b) => depth(b.source) - depth(a.source) || a.source.localeCompare(b.source))
  const exact = [...bySource.values()]
    .filter((r) => !r.source.endsWith(PREFIX))
    .filter((r) => {
      const hit = prefixes.find((p) => coveredBy(p, r.source) != null)
      return !hit || coveredBy(hit, r.source) !== r.destination
    })
    .sort((a, b) => a.source.localeCompare(b.source))
  return [...exact, ...prefixes]
}

async function loadExistingRules(): Promise<Rule[]> {
  if (!existsSync(REDIRECTS_FILE)) return []
  const mod = (await import(pathToFileURL(REDIRECTS_FILE).href)) as { default?: Rule[] }
  return Array.isArray(mod.default) ? mod.default : []
}

function writeRules(rules: Rule[]) {
  const line = (x: Rule) =>
    `  { source: ${JSON.stringify(x.source)}, destination: ${JSON.stringify(x.destination)}, permanent: true },`
  const file = [
    '// GENEROVÁNO skriptem scripts/seo-slugy-diakritika.ts — needitovat ručně, další',
    '// běh skriptu obsah sloučí (podle zdrojové adresy) a přepíše.',
    '// Slugy stránek ošizené o písmena bez NFD rozkladu (Malmö → malm, Schönbrunn →',
    '// schnbrunn) dostaly 19. 9. 2026 tvar podle názvu; tohle jsou 301 ze starých adres.',
    '// Prefixová pravidla `/stará/:rest*` pokrývají stránku (`:rest*` bere i nula',
    '// segmentů), její podstránky i články; řazená od NEJHLUBŠÍ adresy, protože Next',
    '// bere první shodu a potomek s vlastní změnou musí předběhnout pravidlo předka.',
    '',
    '/** @type {import("next").Redirect[]} */',
    'const slugyDiakritika = [',
    ...rules.map(line),
    ']',
    '',
    'export default slugyDiakritika',
    '',
  ].join('\n')
  mkdirSync(dirname(REDIRECTS_FILE), { recursive: true })
  writeFileSync(REDIRECTS_FILE, file)
  execSync(`pnpm exec prettier --write "${REDIRECTS_FILE}"`, { stdio: 'ignore' })
}

async function main() {
  const payload = await getPayload({ config: configPromise })

  const res = await payload.find({
    collection: 'pages',
    overrideAccess: true,
    depth: 0,
    limit: 10000,
    pagination: false,
    select: {
      title: true,
      slug: true,
      fullSlug: true,
      parent: true,
      category: true,
      includeInChildUrlPaths: true,
      _status: true,
    },
    joins: false,
  })
  const rows: Row[] = (res.docs as unknown as Array<Record<string, unknown>>).map((d) => ({
    id: Number(d.id),
    title: String(d.title ?? ''),
    slug: String(d.slug ?? ''),
    fullSlug: String(d.fullSlug ?? ''),
    parent: relationId(d.parent),
    category: (d.category as string | null) ?? null,
    includeInChildUrlPaths: (d.includeInChildUrlPaths as boolean | null) ?? null,
    _status: (d._status as Row['_status']) ?? null,
  }))
  const byId = new Map(rows.map((r) => [r.id, r]))

  // ── 1. Kandidáti (jen publikované) ─────────────────────────────────────────
  const newSlug = new Map<number, string>()
  const draftsSkipped: Row[] = []
  for (const r of rows) {
    const s = slugify(r.title)
    if (!s || s === r.slug) continue
    if (r._status !== 'published') {
      draftsSkipped.push(r)
      continue
    }
    newSlug.set(r.id, s)
  }

  // ── 2. Nové adresy celého stromu + kolize ──────────────────────────────────
  const chainOf = (r: Row): Row[] => {
    const chain: Row[] = []
    let cur: Row | undefined = r
    const seen = new Set<number>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      chain.unshift(cur)
      cur = cur.parent != null ? byId.get(cur.parent) : undefined
    }
    return chain
  }
  const depthOf = (r: Row) => chainOf(r).length
  const expectedUrl = (r: Row) =>
    buildPageUrl(
      chainOf(r).map((a) => ({
        slug: newSlug.get(a.id) ?? a.slug,
        category: a.category,
        includeInChildUrlPaths: a.includeInChildUrlPaths,
      })),
    )

  // Kolize: dvě stránky by měly stejnou adresu (typicky duplikát ze starého
  // webu, kde srážku řešilo časové razítko ve slugu — „islandske-narodni-
  // muzeum1715030766227"). Které z nich patří adresa, je obsahové rozhodnutí,
  // ne věc skriptu: kandidáti v kolizi se VYNECHAJÍ a vypíšou, zbytek jede dál.
  // Opakuje se, dokud kolize nezmizí (vynechání může změnit adresy potomků).
  const expected = new Map<number, string>()
  const skipped: string[] = []
  for (;;) {
    expected.clear()
    for (const r of rows) expected.set(r.id, expectedUrl(r))
    const byUrl = new Map<string, number[]>()
    for (const [id, url] of expected) byUrl.set(url, [...(byUrl.get(url) ?? []), id])
    const collisions = [...byUrl.entries()].filter(([, ids]) => ids.length > 1)
    if (collisions.length === 0) break
    for (const [url, ids] of collisions) {
      const culprits = ids.filter((id) => newSlug.has(id))
      if (culprits.length === 0) {
        console.error(`KOLIZE už v DB (bez mé změny): ${url} ← #${ids.join(', #')}`)
        process.exit(1)
      }
      for (const id of culprits) {
        skipped.push(
          `${url} ← #${ids.map((i) => `${i} „${byId.get(i)?.title}" (${byId.get(i)?.slug})`).join(', #')}`,
        )
        newSlug.delete(id)
      }
    }
  }
  if (skipped.length > 0) {
    console.warn('VYNECHÁNO kvůli kolizi adres (rozhodnout ručně — duplikát?):')
    for (const s of skipped) console.warn(`  ${s}`)
    console.warn('')
  }
  if (draftsSkipped.length > 0) {
    console.warn('VYNECHÁNO — koncept (slug se srovná s názvem, až ho někdo publikuje):')
    for (const r of draftsSkipped) console.warn(`  #${r.id} „${r.title}" ${r.fullSlug}`)
    console.warn('')
  }

  const moved = rows.filter((r) => expected.get(r.id) !== r.fullSlug)
  const renamed = rows.filter((r) => newSlug.has(r.id)).sort((a, b) => depthOf(a) - depthOf(b))

  console.log(
    `stránek: ${rows.length}, přejmenovaných slugů: ${renamed.length}, změněných adres celkem: ${moved.length}\n`,
  )
  for (const r of renamed) {
    const kids = rows.filter((k) => k.parent === r.id).length
    console.log(
      `${APPLY ? 'ZAPISUJI  ' : 'dry-run   '} „${r.title}"  ${r.slug} → ${newSlug.get(r.id)}` +
        `   ${r.fullSlug} → ${expected.get(r.id)}` +
        (kids ? `   (+${kids} podstránek)` : ''),
    )
  }

  // ── 3. Soubor redirectů (sloučit s existujícím) ────────────────────────────
  const fresh: Rule[] = renamed.map((r) => ({
    source: `${r.fullSlug}${PREFIX}`,
    destination: `${expected.get(r.id)}${PREFIX}`,
    permanent: true,
  }))
  const existing = await loadExistingRules()
  if (existing.length > 0 || fresh.length > 0) {
    const merged = normalizeRules([...existing, ...fresh])
    writeRules(merged)
    console.log(
      `\nredirecty: ${fresh.length} nových, ${merged.length} celkem → ${REDIRECTS_FILE}` +
        (existing.length ? ` (sloučeno s ${existing.length} dosavadními)` : ''),
    )
  }

  if (!APPLY) {
    console.log('\nDry-run hotov (nic nezapsáno).')
    process.exit(0)
  }

  // ── 4. Zápis: od kořene k listům, po jednom ────────────────────────────────
  let written = 0
  const pendingDrafts: Row[] = []
  for (const r of renamed) {
    // Rozpracovaný koncept publikované stránky: poslední verze je draft. `update`
    // bez `draft: true` by ho vzal za základ a publikoval — radši přeskočit.
    const latest = await payload.findVersions({
      collection: 'pages',
      where: { and: [{ parent: { equals: r.id } }, { latest: { equals: true } }] },
      limit: 1,
      depth: 0,
    })
    const latestStatus = (latest.docs[0] as { version?: { _status?: string } } | undefined)?.version
      ?._status
    if (latestStatus === 'draft') {
      pendingDrafts.push(r)
      continue
    }
    await payload.update({
      collection: 'pages',
      id: r.id,
      depth: 0,
      overrideAccess: true,
      data: { slug: newSlug.get(r.id) },
    })
    written++
  }
  if (pendingDrafts.length > 0) {
    console.warn('\nPŘESKOČENO — rozpracovaný koncept (přejmenovat v adminu při publikaci):')
    for (const r of pendingDrafts) console.warn(`  #${r.id} „${r.title}" ${r.fullSlug}`)
    // Přesměrování na ně už v souboru je; než se publikují, míří na 404 — neškodí,
    // stará adresa dál funguje (slug se nezměnil) a pravidlo se uplatní až po změně.
    for (const r of pendingDrafts) newSlug.delete(r.id)
    expected.clear()
    for (const r of rows) expected.set(r.id, expectedUrl(r))
  }
  console.log(`\nZapsáno ${written} stránek. Kontrola adres v DB…`)

  const check = await payload.find({
    collection: 'pages',
    overrideAccess: true,
    depth: 0,
    limit: 10000,
    pagination: false,
    select: { fullSlug: true },
    joins: false,
  })
  const wrong = (check.docs as unknown as Array<{ id: number; fullSlug: string }>).filter(
    (d) => expected.get(Number(d.id)) !== d.fullSlug,
  )
  if (wrong.length > 0) {
    console.error(`NESEDÍ ${wrong.length} adres (plugin nepřepočítal potomky?):`)
    for (const w of wrong.slice(0, 30)) {
      console.error(`  #${w.id} v DB ${w.fullSlug}, čekáno ${expected.get(Number(w.id))}`)
    }
    process.exit(1)
  }
  console.log(`Všech ${check.docs.length} adres sedí s předpočtem. Hotovo.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
