/**
 * Migrační skript: MySQL feather transakce -> Payload `transactions`.
 *
 * Legacy je dvojité účetnictví (`transaction`): každá operace = CREDIT + DEBIT pár.
 * Bereme jen UŽIVATELSKOU stranu (account.user_id NOT NULL) a stav APPROVED → 1 operace
 * = 1 transakce. Systémový offset (user_id NULL) i reverzní stavy zahazujeme.
 *
 * Kategorie se zachovávají (granularita), SIDE_INFO_UPDATE_REWARD se slévá do
 * TOURIST_POINT_REWARD.
 *
 * relatedTo (přes `txn_info_related_url`):
 *   - page kategorie (vč. practical information) -> Pages
 *   - article_reward   -> Articles
 *   - review/comment   -> konkrétní Comment (dohledáno přes hostitelský obsah + autor + typ),
 *                         fallback na hostitelskou stránku/článek
 *
 * Spuštění:
 *   pnpm migrate:transactions -- --dry-run
 *   pnpm migrate:transactions
 *   pnpm migrate:transactions -- --limit=50
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

const OLD_DB_CONFIG = {
  host: process.env.OLD_DB_HOST || 'localhost',
  port: Number(process.env.OLD_DB_PORT || 3306),
  user: process.env.OLD_DB_USER || 'root',
  password: process.env.OLD_DB_PASSWORD || '',
  database: process.env.OLD_DB_NAME || 'cms',
}

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
let limit: number | null = null
if (limitArg) {
  const parsed = Number(limitArg.split('=')[1])
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`❌ Neplatný --limit: "${limitArg.split('=')[1]}".`)
    process.exit(1)
  }
  limit = parsed
}

type NewCategory =
  | 'tourist_point_reward'
  | 'place_to_visit_reward'
  | 'practical_information_reward'
  | 'article_reward'
  | 'review_reward'
  | 'comment_reward'
  | 'bonus'
  | 'withdrawal'

const CATEGORY_MAP: Record<string, NewCategory> = {
  TOURIST_POINT_REWARD: 'tourist_point_reward',
  SIDE_INFO_UPDATE_REWARD: 'tourist_point_reward', // slití – side info nebude existovat
  PLACE_TO_VISIT_REWARD: 'place_to_visit_reward',
  PRACTICAL_INFORMATION_REWARD: 'practical_information_reward',
  ARTICLE_REWARD: 'article_reward',
  REVIEW_REWARD: 'review_reward',
  COMMENT_REWARD: 'comment_reward',
  BONUS: 'bonus',
  WITHDRAWAL: 'withdrawal',
}

const PAGE_CATEGORIES = new Set<NewCategory>([
  'tourist_point_reward',
  'place_to_visit_reward',
  'practical_information_reward',
])

// Transakce k trvalému vynechání (junk / rozbitý neexistující cíl) — nezaloží se ani
// při přemigrování. #6631 = odměna za `destinace` (osiřelá draft stránka, smazaná).
const SKIP_LEGACY_TX_IDS = new Set<number>([6631])

// Ruční mapa pro transakce se STAROU (dnes nevalidní) URL, kterou nejde automaticky
// dohledat (názvy přeložené do češtiny, překlepy). Klíč = normalizovaná legacy
// related_url, hodnota = fullSlug existující cílové stránky. Doplněno ručně.
const MANUAL_RELATED_URL: Record<string, string> = {
  'italie/agrigento/valle-dei-templi': 'italie/sicilie/agrigento/udoli-chramu',
  'italie/agrigento/scala-dei-turchi': 'italie/sicilie/agrigento/turecke-schody',
  'italie/agrigento/riserva-naturale-di-punta-bianca':
    'italie/sicilie/agrigento/prirodni-rezervace-punta-bianca',
  'italie/palermo/catacombe-dei-cappuccini':
    'italie/sicilie/palermo/kapucinsky-klaster-a-katakomby',
  'italie/palermo/giardino-inglese': 'italie/sicilie/palermo/anglicke-zahrady',
  'italie/palermo/orto-botanico-di-palermo': 'italie/sicilie/palermo/botanicke-zahrady-palermo',
  'italie/palermo/palazzo-dei-normanni':
    'italie/sicilie/palermo/kralovsky-palac-palazzo-dei-normanni',
  'italie/palermo/quattro-canti': 'italie/sicilie/palermo/namesti-quattro-canti',
  'italie/palermo/riserva-di-capo-gallo': 'italie/sicilie/palermo/rezervace-capo-gallo',
  'italie/palermo/spiaggia-di-mondello': 'italie/sicilie/palermo/plaz-mondello',
  'italie/taormina/giardini-della-villa-comunale':
    'italie/sicilie/taormina/verejne-zahrady-v-taormine',
  'italie/taormina/playa-sole-luna': 'italie/sicilie/taormina/plaz-sole-luna',
  'lotyssko/riga/chram-zvestovani-z-nejsvatejsi-nasi-pani':
    'lotyssko/riga/chram-zvestovani-s-nejsvatejsi-nasi-pani',
  'paraguay/ciudad-del-este/hito-del-las-fronteras':
    'paraguay/ciudad-del-este/hito-del-las-3-fronteras',
  'recko/nidri/nidri-dimossari-waterfalls': 'recko/lefkada/nidri/dimossari-waterfalls',
  'vietnam/ho-ci-minovo-mesto/ustredni-posta': 'vietnam/ho-ci-minovo-mesto/stredni-posta',
  'kazachstan/astana/muzeum-prvniho-rezdenta-republiky-kazachstan':
    'kazachstan/astana/muzeum-prvniho-prezidenta-republiky-kazachstan',
  'ceska-republika/brno/vila-tugenhat': 'ceska-republika/brno/vila-tugendhat',
  'slovensko/vysoke-tatry/sklanate-pleso': 'slovensko/vysoke-tatry/skalnate-pleso',
  'malta/ir-rabat': 'malta/rabat',
  'slovensko/sisska-nova-ves': 'slovensko/spisska-nova-ves',
  'slovinsko/cejle': 'slovinsko/celje',
}

const normalizeSlug = (url: string): string =>
  url.trim().toLowerCase().replace(/^\/+|\/+$/g, '')

const lastSegment = (url: string): string => {
  const parts = normalizeSlug(url).split('/')
  return parts[parts.length - 1] || ''
}

// Legacy slugy mívají na konci timestamp (např. `...-sauny1668463247415`); pro shodu ho odřízneme.
const stripTs = (seg: string): string => seg.replace(/\d{10,}$/, '')

type Payload = Awaited<ReturnType<typeof getPayload>>

async function fetchAll(
  payload: Payload,
  collection: 'articles' | 'pages' | 'users' | 'comments',
  select: Record<string, true>,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection,
      depth: 0,
      limit: 500,
      page,
      overrideAccess: true,
      pagination: true,
      select,
    })
    out.push(...(res.docs as Record<string, unknown>[]))
    if (!res.hasNextPage) break
    page += 1
  }
  return out
}

type CommentRel = { relationTo: 'pages' | 'articles'; value: number }
type RelatedTo =
  | { relationTo: 'pages'; value: number }
  | { relationTo: 'articles'; value: number }
  | { relationTo: 'comments'; value: number }

async function run() {
  console.log(`\n🚀 Migrace transactions${isDryRun ? ' (DRY RUN)' : ''}`)
  if (limit) console.log(`   Limit: ${limit}`)

  const conn = await mysql.createConnection(OLD_DB_CONFIG)
  console.log(`✅ MySQL: ${OLD_DB_CONFIG.database}@${OLD_DB_CONFIG.host}`)
  const payload = await getPayload({ config: configPromise })
  console.log('✅ Payload inicializován')

  // --- Mapy ---
  const users = await fetchAll(payload, 'users', { legacyUserId: true })
  const usersByLegacyId = new Map<number, number>()
  for (const u of users) {
    if (typeof u.legacyUserId === 'number') usersByLegacyId.set(u.legacyUserId, u.id as number)
  }

  const pages = await fetchAll(payload, 'pages', {
    slug: true,
    fullSlug: true,
    legacyPageId: true,
  })
  const pagesByFullSlug = new Map<string, number>()
  const pageIdByLegacyId = new Map<number, number>()
  // Koncový slug → kandidáti (s fullSlug segmenty pro rozlišení duplicit přes překryv rodičů).
  const pagesBySlug = new Map<string, { id: number; segments: string[] }[]>()
  for (const p of pages) {
    if (typeof p.fullSlug === 'string') pagesByFullSlug.set(normalizeSlug(p.fullSlug), p.id as number)
    if (typeof p.legacyPageId === 'number') pageIdByLegacyId.set(p.legacyPageId, p.id as number)
    if (typeof p.slug === 'string' && typeof p.fullSlug === 'string') {
      const arr = pagesBySlug.get(p.slug) ?? []
      arr.push({ id: p.id as number, segments: normalizeSlug(p.fullSlug).split('/') })
      pagesBySlug.set(p.slug, arr)
    }
  }
  // Legacy unique_url → payload page id (řeší zkrácené/změněné cesty).
  const pagesByLegacyUrl = new Map<string, number>()
  const [pageRows] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT `id`, `unique_url` FROM `page`',
  )
  for (const row of pageRows) {
    const pid = pageIdByLegacyId.get(Number(row.id))
    const url = typeof row.unique_url === 'string' ? row.unique_url : ''
    if (pid && url) pagesByLegacyUrl.set(normalizeSlug(url), pid)
  }

  const articles = await fetchAll(payload, 'articles', { slug: true })
  const articlesBySlug = new Map<string, number | 'AMBIGUOUS'>()
  for (const a of articles) {
    if (typeof a.slug !== 'string') continue
    articlesBySlug.set(a.slug, articlesBySlug.has(a.slug) ? 'AMBIGUOUS' : (a.id as number))
  }

  // Komentáře pro dohledání konkrétní recenze/komentáře: klíč = host+autor+typ.
  const comments = await fetchAll(payload, 'comments', {
    relatedTo: true,
    author: true,
    type: true,
  })
  const commentByKey = new Map<string, number | 'AMBIGUOUS'>()
  const commentKey = (rel: CommentRel, authorId: number, type: string) =>
    `${rel.relationTo}:${rel.value}:${authorId}:${type}`
  for (const c of comments) {
    const rel = c.relatedTo as CommentRel | undefined
    const author = typeof c.author === 'number' ? c.author : null
    if (!rel || author == null) continue
    const key = commentKey(rel, author, c.type as string)
    commentByKey.set(key, commentByKey.has(key) ? 'AMBIGUOUS' : (c.id as number))
  }

  console.log(
    `📚 Mapy: users=${usersByLegacyId.size}, pages=${pagesByFullSlug.size}, articles=${articlesBySlug.size}, comments=${comments.length}`,
  )

  // Stránka: přesný fullSlug → legacy unique_url → koncový slug (vč. odstřižení timestampu).
  // Duplicity slugu rozlišíme podle překryvu rodičovských segmentů s related_url.
  const resolvePage = (url: string): number | null => {
    const norm = normalizeSlug(url)
    const manual = MANUAL_RELATED_URL[norm]
    if (manual) {
      const mid = pagesByFullSlug.get(normalizeSlug(manual))
      if (mid) return mid
    }
    const exact = pagesByFullSlug.get(norm) ?? pagesByLegacyUrl.get(norm)
    if (exact) return exact
    const urlSegs = norm.split('/')
    const urlSet = new Set(urlSegs)
    const last = urlSegs[urlSegs.length - 1] || ''
    for (const seg of [last, stripTs(last)]) {
      if (!seg) continue
      const cands = pagesBySlug.get(seg)
      if (!cands || cands.length === 0) continue
      if (cands.length === 1) return cands[0].id
      let best: { id: number } | null = null
      let bestScore = -1
      let tie = false
      for (const cand of cands) {
        const score = cand.segments.filter((s) => urlSet.has(s)).length
        if (score > bestScore) {
          bestScore = score
          best = cand
          tie = false
        } else if (score === bestScore) {
          tie = true
        }
      }
      if (best && !tie && bestScore >= 2) return best.id
    }
    return null
  }

  const resolveArticle = (url: string): number | null => {
    const last = lastSegment(url)
    for (const seg of [last, stripTs(last)]) {
      const a = articlesBySlug.get(seg)
      if (a && a !== 'AMBIGUOUS') return a
    }
    return null
  }

  // Resolver hostitelského obsahu z related_url → page | article
  const resolveHost = (url: string): CommentRel | null => {
    const page = resolvePage(url)
    if (page) return { relationTo: 'pages', value: page }
    const art = resolveArticle(url)
    if (art) return { relationTo: 'articles', value: art }
    return null
  }

  // --- Transakce ---
  const limitClause = limit ? `LIMIT ${limit}` : ''
  const [rows] = await conn.query<mysql.RowDataPacket[]>(`
    SELECT t.id AS tx_id, a.user_id, t.cash_amount, t.category, t.date_created,
           t.txn_info_related_url AS related_url, t.txn_info_txn_text AS txn_text,
           t.txn_info_admin_note AS admin_note
    FROM transaction t
    JOIN account a ON a.id = t.account_id
    WHERE a.user_id IS NOT NULL AND t.state = 'APPROVED'
    ORDER BY t.id
    ${limitClause}
  `)
  console.log(`📦 Transakcí (user-side, APPROVED): ${rows.length}\n`)

  const stats = {
    created: 0,
    updated: 0,
    dryRun: 0,
    skippedNoUser: 0,
    skippedNoCategory: 0,
    skippedManual: 0,
    errors: 0,
    linkedPage: 0,
    linkedArticle: 0,
    linkedComment: 0,
    linkedFallbackHost: 0,
    noRelation: 0,
  }
  const unresolved: string[] = []

  for (const row of rows as any[]) {
    if (SKIP_LEGACY_TX_IDS.has(Number(row.tx_id))) {
      stats.skippedManual++
      continue
    }
    const userId = row.user_id != null ? usersByLegacyId.get(Number(row.user_id)) : undefined
    if (userId == null) {
      stats.skippedNoUser++
      continue
    }
    const category = CATEGORY_MAP[row.category as string]
    if (!category) {
      stats.skippedNoCategory++
      continue
    }

    const url = typeof row.related_url === 'string' ? row.related_url.trim() : ''
    let relatedTo: RelatedTo | null = null

    if (category === 'review_reward' || category === 'comment_reward') {
      const host = url ? resolveHost(url) : null
      const type = category === 'review_reward' ? 'review' : 'comment'
      if (host) {
        const c = commentByKey.get(commentKey(host, userId, type))
        if (c && c !== 'AMBIGUOUS') {
          relatedTo = { relationTo: 'comments', value: c }
          stats.linkedComment++
        } else {
          relatedTo = host // fallback na hostitelský obsah
          stats.linkedFallbackHost++
        }
      }
    } else if (category === 'article_reward') {
      const art = url ? resolveArticle(url) : null
      if (art) {
        relatedTo = { relationTo: 'articles', value: art }
        stats.linkedArticle++
      }
    } else if (PAGE_CATEGORIES.has(category)) {
      const pid = url ? resolvePage(url) : null
      if (pid) {
        relatedTo = { relationTo: 'pages', value: pid }
        stats.linkedPage++
      }
    }
    // bonus / withdrawal → relatedTo null

    if (!relatedTo && category !== 'bonus' && category !== 'withdrawal') {
      stats.noRelation++
      if (url) unresolved.push(`#${row.tx_id} [${category}] ${url}`)
    }

    const note =
      (typeof row.txn_text === 'string' && row.txn_text.trim()) ||
      (typeof row.admin_note === 'string' && row.admin_note.trim()) ||
      undefined
    const transactedAt = row.date_created
      ? new Date(row.date_created).toISOString()
      : undefined

    const data = {
      user: userId,
      category,
      amount: Number(row.cash_amount ?? 0),
      relatedTo: relatedTo ?? null,
      note,
      transactedAt,
      legacyTransactionId: Number(row.tx_id),
    }

    const existing = await payload.find({
      collection: 'transactions',
      where: { legacyTransactionId: { equals: Number(row.tx_id) } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })

    if (isDryRun) {
      stats.dryRun++
      continue
    }
    try {
      if (existing.totalDocs > 0) {
        await payload.update({
          collection: 'transactions',
          id: existing.docs[0].id,
          data,
          overrideAccess: true,
        })
        stats.updated++
      } else {
        await payload.create({ collection: 'transactions', data, overrideAccess: true })
        stats.created++
      }
    } catch (error) {
      console.error(`❌ #${row.tx_id}:`, error)
      stats.errors++
    }
  }

  await conn.end()

  console.log('\n══════════════════════════════════════════')
  console.log('📊 Výsledky migrace transactions:')
  console.log(`   Vytvořeno:              ${stats.created}`)
  console.log(`   Aktualizováno:          ${stats.updated}`)
  console.log(`   Dry-run:                ${stats.dryRun}`)
  console.log(`   Napojeno na stránku:    ${stats.linkedPage}`)
  console.log(`   Napojeno na článek:     ${stats.linkedArticle}`)
  console.log(`   Napojeno na komentář:   ${stats.linkedComment}`)
  console.log(`   Fallback na hostitele:  ${stats.linkedFallbackHost}`)
  console.log(`   Bez vazby (očekávané u bonus/withdrawal/practical): ${stats.noRelation}`)
  console.log(`   Přeskočeno (chybí user): ${stats.skippedNoUser}`)
  console.log(`   Přeskočeno (kategorie): ${stats.skippedNoCategory}`)
  console.log(`   Přeskočeno (skip-list): ${stats.skippedManual}`)
  console.log(`   Chyby:                  ${stats.errors}`)
  console.log('══════════════════════════════════════════')
  if (unresolved.length > 0) {
    console.log(`\n⚠️  Nenapojený obsah (${unresolved.length}):`)
    unresolved.slice(0, 40).forEach((u) => console.log(`   ${u}`))
    if (unresolved.length > 40) console.log(`   … a dalších ${unresolved.length - 40}`)
  }
  console.log()
  process.exit(stats.errors > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error('💥 Fatální chyba:', error)
  process.exit(1)
})
