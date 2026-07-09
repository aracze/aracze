/**
 * Backfill „praktických informací" míst/turistických cílů do Payload Pages.
 * Zatím jen webová stránka (z legacy `page.practical_information_more_info`, kde je
 * uložená jako <a href>). Doplní se do `detail.website` u migrovaných stránek přes
 * `legacyPageId`. Ostatní pole detailu se zachovají (merge).
 *
 * Spuštění:
 *   pnpm migrate:practical-info -- --dry-run
 *   pnpm migrate:practical-info
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

// První href z <a href="…"> (v more_info je 100 % odkaz).
function extractUrl(html: string): string | null {
  const m = html.match(/href\s*=\s*["']([^"']+)["']/i)
  return m ? m[1].trim() : null
}

async function run() {
  console.log(`\n🚀 Backfill praktických informací (web)${isDryRun ? ' (DRY RUN)' : ''}`)
  const conn = await mysql.createConnection(OLD_DB_CONFIG)
  console.log(`✅ MySQL: ${OLD_DB_CONFIG.database}@${OLD_DB_CONFIG.host}`)
  const payload = await getPayload({ config: configPromise })
  console.log('✅ Payload inicializován')

  // Legacy: legacy page id → website
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT id, practical_information_more_info AS more FROM page
     WHERE practical_information_more_info IS NOT NULL AND practical_information_more_info <> ''`,
  )
  const websiteByLegacyId = new Map<number, string>()
  for (const r of rows as any[]) {
    const url = extractUrl(String(r.more))
    if (url) websiteByLegacyId.set(Number(r.id), url)
  }
  await conn.end()
  console.log(`📦 Legacy stránek s webem: ${websiteByLegacyId.size}`)

  // Payload: legacy page id → { id, detail }
  const pageByLegacyId = new Map<number, { id: number | string; detail: Record<string, unknown> }>()
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'pages',
      depth: 0,
      limit: 500,
      page,
      overrideAccess: true,
      pagination: true,
      select: { legacyPageId: true, detail: true },
    })
    for (const d of res.docs as any[]) {
      if (typeof d.legacyPageId === 'number') {
        pageByLegacyId.set(d.legacyPageId, { id: d.id, detail: d.detail ?? {} })
      }
    }
    if (!res.hasNextPage) break
    page += 1
  }

  let updated = 0
  let unchanged = 0
  let noMatch = 0
  let errors = 0

  for (const [legacyId, website] of websiteByLegacyId) {
    const target = pageByLegacyId.get(legacyId)
    if (!target) {
      noMatch++
      continue
    }
    if (target.detail?.website === website) {
      unchanged++
      continue
    }
    if (isDryRun) {
      updated++
      continue
    }
    try {
      await payload.update({
        collection: 'pages',
        id: target.id,
        data: { detail: { ...target.detail, website } },
        overrideAccess: true,
      })
      updated++
    } catch (e) {
      console.error(`❌ page (legacy ${legacyId}):`, e)
      errors++
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`   Doplněn web:            ${updated}`)
  console.log(`   Beze změny (už mají):   ${unchanged}`)
  console.log(`   Bez odpovídající stránky: ${noMatch}`)
  console.log(`   Chyby:                  ${errors}`)
  console.log('══════════════════════════════════════════\n')
  process.exit(errors > 0 ? 1 : 0)
}

run().catch((e) => {
  console.error('💥 Fatální chyba:', e)
  process.exit(1)
})
