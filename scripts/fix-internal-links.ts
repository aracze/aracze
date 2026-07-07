/**
 * Samostatný post-migrační skript: opraví interní odkazy v už migrovaném obsahu.
 *
 * Legacy těla (stránek i článků) obsahují odkazy na `ara.cz` / `www.ara.cz` v historickém
 * tvaru URL (často "dlouhém", např. `usa/kalifornie/san-francisco/turisticke-cile/zajimavosti/cable-cars`),
 * který v novém webu neexistuje → odkazy jsou rozbité. Tento skript je najde a přepíše:
 *   - cíl = STRÁNKA  → interní relace `{ relationTo: 'pages' }` (frontend ji vyhodnotí na aktuální fullSlug)
 *   - cíl = ČLÁNEK   → oprava `url` na `mainPage.fullSlug + '/' + slug`
 *                      (frontend interní relaci na článek neumí vyhodnotit – nemá fullSlug)
 *   - affiliate `/go/…` a neznámé cíle → ponechány beze změny (a vypsány)
 *
 * NEre-migruje obsah – pouze aktualizuje pole `text` (a u článků `attribution`) přímo v Payloadu.
 * Je idempotentní: už interní odkazy přeskakuje, nenamapované nechává být.
 *
 * ⚠️ Spouštět až PO dokončení migrace všech článků – konverze potřebuje, aby cílová
 *    stránka/článek už v Payloadu existovaly (jinak zůstane odkaz nenamapovaný).
 *
 * Spuštění:
 *   pnpm fix:links -- --dry-run                # jen report, nic nezapisuje
 *   pnpm fix:links                             # ostrý běh nad stránkami i články
 *   pnpm fix:links -- --collection=pages       # jen stránky
 *   pnpm fix:links -- --collection=articles    # jen články
 *   pnpm fix:links -- --limit=20 --verbose
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import mysql from 'mysql2/promise'
import configPromise from '../src/payload.config.js'

const OLD_DB_CONFIG = {
  host: process.env.OLD_DB_HOST || 'localhost',
  port: Number(process.env.OLD_DB_PORT || 3306),
  user: process.env.OLD_DB_USER || 'root',
  password: process.env.OLD_DB_PASSWORD || '',
  database: process.env.OLD_DB_NAME || 'cms',
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI argumenty
// ─────────────────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run')
const isVerbose = process.argv.includes('--verbose')

const ALLOWED_COLLECTIONS = ['all', 'pages', 'articles'] as const
const collectionArg = process.argv.find((a) => a.startsWith('--collection='))
const collection = collectionArg ? collectionArg.split('=')[1] : 'all'
if (!ALLOWED_COLLECTIONS.includes(collection as (typeof ALLOWED_COLLECTIONS)[number])) {
  console.error(
    `❌ Neplatná --collection: "${collection}". Povolené: ${ALLOWED_COLLECTIONS.join(', ')}`,
  )
  process.exit(1)
}
const doPages = collection === 'all' || collection === 'pages'
const doArticles = collection === 'all' || collection === 'articles'

const limitArg = process.argv.find((a) => a.startsWith('--limit='))
let limit: number | null = null
if (limitArg) {
  const parsed = Number(limitArg.split('=')[1])
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`❌ Neplatný --limit: "${limitArg.split('=')[1]}". Musí být kladné celé číslo.`)
    process.exit(1)
  }
  limit = parsed
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver: legacy ara.cz cesta → cílový dokument
// ─────────────────────────────────────────────────────────────────────────────

type Target = { kind: 'page'; id: number | string } | { kind: 'article'; url: string }

type Candidate = {
  segments: string[]
  target: Target
}

function toSegments(path: string): string[] {
  return path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
}

function isAraHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'ara.cz' || h === 'www.ara.cz'
}

function buildResolver(
  pages: any[],
  articles: any[],
  // Legacy `unique_url` (normalizovaná cesta) → payload page id. Mapuje původní legacy
  // cestu přímo na migrovanou stránku přes stabilní legacy_page_id, takže je odolné vůči
  // transformacím slugu (odstranění prefixu rodiče, vynechání kontinentu z URL apod.).
  legacyUrlToPayloadId: Map<string, number | string>,
): (pathname: string) => Target | null {
  // Přesná shoda celé cesty (stránky) a index podle posledního segmentu (slugu).
  const pageByFullSlug = new Map<string, number | string>()
  const byFinalSlug = new Map<string, Candidate[]>()

  const addCandidate = (final: string, c: Candidate) => {
    if (!byFinalSlug.has(final)) byFinalSlug.set(final, [])
    byFinalSlug.get(final)!.push(c)
  }

  // fullSlug rodičovské stránky článku dohledáváme podle ID – dokumenty totiž
  // načítáme na depth 0 (aby vztahy v rich-textu zůstaly jako ID, ne populované objekty).
  const pageFullSlugById = new Map<string, string>()

  for (const page of pages) {
    if (!page?.id) continue
    pageFullSlugById.set(String(page.id), typeof page.fullSlug === 'string' ? page.fullSlug : '')
    const segments = typeof page.fullSlug === 'string' ? toSegments(page.fullSlug) : []
    if (segments.length === 0) continue
    pageByFullSlug.set(segments.join('/'), page.id)
    addCandidate(segments[segments.length - 1], {
      segments,
      target: { kind: 'page', id: page.id },
    })
  }

  const articleByFullPath = new Map<string, string>()
  for (const article of articles) {
    if (!article?.slug) continue
    // mainPage je na depth 0 buď ID, nebo (u ručně vytvořených) objekt – ošetříme obojí.
    const mainPage = article.mainPage
    const mainPageId = mainPage && typeof mainPage === 'object' ? mainPage.id : mainPage
    const parentSlug = mainPageId != null ? pageFullSlugById.get(String(mainPageId)) || '' : ''
    if (!parentSlug) continue // bez rodiče nedokážeme sestavit URL článku
    const segments = [...toSegments(parentSlug), String(article.slug)]
    const url = '/' + segments.join('/')
    articleByFullPath.set(segments.join('/'), url)
    addCandidate(segments[segments.length - 1], {
      segments,
      target: { kind: 'article', url },
    })
  }

  return (pathname: string): Target | null => {
    const linkSegs = toSegments(pathname)
    if (linkSegs.length === 0) return null
    const key = linkSegs.join('/')

    // 1) Přesná shoda celé cesty – nejdřív stránky, pak články.
    const exactPage = pageByFullSlug.get(key)
    if (exactPage) return { kind: 'page', id: exactPage }
    const exactArticle = articleByFullPath.get(key)
    if (exactArticle) return { kind: 'article', url: exactArticle }

    // 2) Shoda přes legacy unique_url (řeší transformace slugu při migraci).
    const byLegacy = legacyUrlToPayloadId.get(key)
    if (byLegacy) return { kind: 'page', id: byLegacy }

    // 3) Shoda podle posledního segmentu (vlastního slugu).
    const candidates = byFinalSlug.get(linkSegs[linkSegs.length - 1])
    if (!candidates || candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0].target

    // Víc kandidátů se stejným slugem: vybereme toho, jehož předci se nejvíc
    // překrývají s cestou odkazu. Vyžadujeme jednoznačného vítěze a skóre ≥ 2.
    const linkSet = new Set(linkSegs)
    let best: Candidate | null = null
    let bestScore = -1
    let tie = false
    for (const cand of candidates) {
      const score = cand.segments.filter((s) => linkSet.has(s)).length
      if (score > bestScore) {
        bestScore = score
        best = cand
        tie = false
      } else if (score === bestScore) {
        tie = true
      }
    }
    if (best && !tie && bestScore >= 2) return best.target
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Konverze odkazů v jednom Lexical stromu
// ─────────────────────────────────────────────────────────────────────────────

function convertLinks(
  lexical: any,
  resolve: (pathname: string) => Target | null,
): { changed: boolean; converted: number; unresolved: string[] } {
  let converted = 0
  let changed = false
  const unresolved: string[] = []

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return

    if (node.type === 'link' && node.fields && typeof node.fields === 'object') {
      const fields = node.fields as Record<string, unknown>
      const linkType = String(fields.linkType || '')
      const url = typeof fields.url === 'string' ? fields.url.trim() : ''

      if (linkType !== 'internal' && url) {
        try {
          const parsed = new URL(url)
          if (isAraHost(parsed.hostname)) {
            const target = resolve(parsed.pathname)
            if (!target) {
              unresolved.push(parsed.pathname)
            } else if (target.kind === 'page') {
              fields.linkType = 'internal'
              fields.doc = { relationTo: 'pages', value: target.id }
              delete fields.url
              converted++
              changed = true
            } else {
              // Článek: opravíme jen URL, necháme jako externí/custom odkaz.
              if (fields.url !== target.url) {
                fields.url = target.url
                converted++
                changed = true
              }
            }
          }
        } catch {
          // malformed URL → nech být
        }
      }
    }

    // Sestup do bloků s vnořeným rich-textem (např. promoBlock.content).
    if (node.type === 'block' && node.fields && typeof node.fields === 'object') {
      for (const value of Object.values(node.fields as Record<string, unknown>)) {
        if (value && typeof value === 'object' && 'root' in (value as any)) {
          visit((value as any).root)
        }
      }
    }

    if (Array.isArray(node.children)) node.children.forEach(visit)
  }

  visit(lexical?.root)
  return { changed, converted, unresolved }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hlavní běh
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🔗 Oprava interních odkazů${isDryRun ? ' (DRY RUN)' : ''}`)
  console.log(`   Kolekce: ${collection}${limit ? ` | limit: ${limit}` : ''}\n`)

  const payload = await getPayload({ config: configPromise })

  const allPages = await payload.find({
    collection: 'pages',
    limit: 0,
    depth: 0,
    pagination: false,
    // Jen pole, která resolver a fixer reálně používají (id se vrací vždy).
    select: { fullSlug: true, legacyPageId: true, title: true, text: true },
  })
  // depth 0 → vztahy v rich-textu (odkazy `doc`, obrázky `upload`) zůstanou jako ID.
  // Při depth > 0 se populují na objekty a zápis zpět skončí chybou validace.
  // fullSlug rodiče článku dohledáme z `allPages` podle mainPage ID.
  const allArticles = await payload.find({
    collection: 'articles',
    limit: 0,
    depth: 0,
    pagination: false,
    select: {
      slug: true,
      mainPage: true,
      title: true,
      text: true,
      attribution: true,
    },
  })

  // Mapa legacy unique_url → payload page id (přes legacy_page_id).
  const payloadIdByLegacyId = new Map<number, number | string>()
  for (const p of allPages.docs as any[]) {
    if (p.legacyPageId != null) payloadIdByLegacyId.set(Number(p.legacyPageId), p.id)
  }
  const legacyUrlToPayloadId = new Map<string, number | string>()
  const conn = await mysql.createConnection(OLD_DB_CONFIG)
  try {
    const [rows] = await conn.execute<any[]>('SELECT `id`, `unique_url` FROM `page`')
    for (const row of rows) {
      const payloadId = payloadIdByLegacyId.get(Number(row.id))
      const url = typeof row.unique_url === 'string' ? row.unique_url : ''
      if (!payloadId || !url) continue
      legacyUrlToPayloadId.set(toSegments(url).join('/'), payloadId)
    }
  } finally {
    await conn.end()
  }

  // Ručně ověřené legacy aliasy, které nesedí na kanonickou `unique_url` – odkaz v těle
  // používal zkrácenou/starou cestu (chybí mezisegment) nebo jiný pravopis. Klíč = přesná
  // cesta z odkazu, hodnota = legacy id cílové stránky (na payload id se přeloží níže).
  const MANUAL_LINK_TO_LEGACY: Record<string, number> = {
    'chorvatsko/baska/baska-akvarium': 2925, // → /chorvatsko/ostrov-krk/baska/akvarium
    'novy-zeland/hokitika/hokitika-gorge': 2763, // → /novy-zeland/jizni-ostrov/hokitika/gorge
    'nizozemsko/amsterdam/turisticke-cile/zajimavosti/muzeum-vangogha': 152, // překlep vangogha→van-gogha
  }
  for (const [path, legacyId] of Object.entries(MANUAL_LINK_TO_LEGACY)) {
    const pid = payloadIdByLegacyId.get(legacyId)
    if (pid) legacyUrlToPayloadId.set(path, pid)
  }

  const resolve = buildResolver(allPages.docs, allArticles.docs, legacyUrlToPayloadId)
  console.log(
    `✅ Resolver připraven: ${allPages.docs.length} stránek, ${allArticles.docs.length} článků, ${legacyUrlToPayloadId.size} legacy URL\n`,
  )

  const stats = {
    docsScanned: 0,
    docsChanged: 0,
    converted: 0,
    unresolved: new Map<string, number>(),
    failed: [] as { coll: string; id: number | string; title: string; reason: string }[],
  }

  const processCollection = async (
    coll: 'pages' | 'articles',
    fields: ('text' | 'attribution')[],
  ) => {
    const docs = coll === 'pages' ? allPages.docs : allArticles.docs
    const slice = limit ? docs.slice(0, limit) : docs
    console.log(`\n── ${coll} (${slice.length}) ──`)

    for (const doc of slice) {
      stats.docsScanned++
      const data: Record<string, unknown> = {}
      let docChanged = false
      let docConverted = 0

      for (const field of fields) {
        const value = (doc as any)[field]
        if (!value || typeof value !== 'object') continue
        const result = convertLinks(value, resolve)
        result.unresolved.forEach((p) =>
          stats.unresolved.set(p, (stats.unresolved.get(p) || 0) + 1),
        )
        if (result.changed) {
          data[field] = value
          docChanged = true
          docConverted += result.converted
        }
      }

      if (!docChanged) continue

      if (isVerbose || isDryRun) {
        console.log(
          `   ${isDryRun ? '[DRY]' : '✏️ '} ${coll}#${doc.id} "${(doc as any).title ?? ''}" – ${docConverted} odkazů`,
        )
      }

      if (!isDryRun) {
        try {
          await payload.update({
            collection: coll,
            id: (doc as any).id,
            data,
            depth: 0,
            overrideAccess: true,
          })
        } catch (err: any) {
          // Jeden vadný dokument nesmí shodit celý běh – zalogujeme a jedeme dál.
          const fieldErrors = (err?.data?.errors || err?.cause?.errors || [])
            .map((e: any) => e?.path || e?.field || e?.message)
            .filter(Boolean)
          stats.failed.push({
            coll,
            id: (doc as any).id,
            title: String((doc as any).title ?? ''),
            reason: fieldErrors.length ? fieldErrors.join(', ') : String(err?.message || err),
          })
          continue
        }
      }

      stats.docsChanged++
      stats.converted += docConverted
    }
  }

  if (doPages) await processCollection('pages', ['text'])
  if (doArticles) await processCollection('articles', ['text', 'attribution'])

  console.log('\n══════════════════════════════════════════')
  console.log(`📊 Výsledky${isDryRun ? ' (DRY RUN – nic nezapsáno)' : ''}:`)
  console.log(`   Prohledáno dokumentů:  ${stats.docsScanned}`)
  console.log(`   Změněno dokumentů:     ${stats.docsChanged}`)
  console.log(`   Převedeno odkazů:      ${stats.converted}`)
  console.log(`   Selhalo při ukládání:  ${stats.failed.length}`)
  console.log(`   Nenamapované (unikát): ${stats.unresolved.size}`)
  if (stats.failed.length > 0) {
    console.log('\n   Dokumenty, které selhaly při ukládání (validace):')
    stats.failed.forEach((f) => console.log(`     ${f.coll}#${f.id} "${f.title}" → ${f.reason}`))
  }
  if (stats.unresolved.size > 0) {
    const sorted = [...stats.unresolved.entries()].sort((a, b) => b[1] - a[1])
    console.log('\n   Nejčastější nenamapované cesty:')
    sorted.slice(0, 20).forEach(([p, n]) => console.log(`     ${n}×  ${p}`))
  }
  console.log('══════════════════════════════════════════\n')

  process.exit(0)
}

run().catch((err) => {
  console.error('❌ Chyba:', err)
  process.exit(1)
})
