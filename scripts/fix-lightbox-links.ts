/**
 * Jednorázový úklid: rozbalí legacy „lightbox" kotvy kolem obrázků v článcích.
 *
 * Migrace obrázky převedla na ContentImage/upload bloky, ale ponechala kolem nich
 * původní <a href="…/full.jpg"> obal → link uzel obalující blok. To je nevalidní
 * (blok uvnitř inline linku) a na frontendu se serializuje jako prázdný <a> kolem
 * obrázku. Skript takové obaly zahodí a blok povýší na jejich místo.
 *
 * Bezpečné: mění jen link uzly, jejichž VŠECHNY děti jsou block/upload (žádný text).
 *
 * Spuštění:
 *   pnpm fix:lightbox -- --dry-run
 *   pnpm fix:lightbox
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import configPromise from '../src/payload.config'

const isDryRun = process.argv.includes('--dry-run')

// Rozbalí link uzly obalující výhradně block/upload. Vrací počet rozbalených obalů.
function unwrapBlockLinks(node: any): number {
  if (!node || typeof node !== 'object' || !Array.isArray(node.children)) return 0
  let count = 0
  const next: any[] = []
  for (const child of node.children) {
    if (
      child?.type === 'link' &&
      Array.isArray(child.children) &&
      child.children.length > 0 &&
      child.children.every((c: any) => c?.type === 'block' || c?.type === 'upload')
    ) {
      next.push(...child.children)
      count++
    } else {
      next.push(child)
    }
  }
  node.children = next
  for (const child of next) count += unwrapBlockLinks(child)
  return count
}

async function run() {
  console.log(`\n🧹 Úklid lightbox obalů${isDryRun ? ' (DRY RUN)' : ''}`)
  const payload = await getPayload({ config: configPromise })

  const all: any[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'articles',
      depth: 0, // vztahy (interní odkazy) nechat jako ID, ať se při update nepoškodí
      limit: 200,
      page,
      overrideAccess: true,
      pagination: true,
    })
    all.push(...res.docs)
    if (!res.hasNextPage) break
    page += 1
  }
  console.log(`📦 Načteno článků: ${all.length}\n`)

  let changedArticles = 0
  let totalUnwrapped = 0
  let errors = 0

  for (const article of all) {
    const text = article.text
    if (!text?.root) continue

    const unwrapped = unwrapBlockLinks(text.root)
    if (unwrapped === 0) continue

    changedArticles++
    totalUnwrapped += unwrapped
    console.log(
      `${isDryRun ? '📋 DRY' : '✅'} #${article.id} "${article.title}" — rozbaleno ${unwrapped}`,
    )

    if (isDryRun) continue

    try {
      await payload.update({
        collection: 'articles',
        id: article.id,
        data: { text },
        depth: 0,
        overrideAccess: true,
      })
    } catch (error) {
      console.error(`   ❌ Chyba u #${article.id}:`, error)
      errors++
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`Dotčených článků: ${changedArticles}`)
  console.log(`Rozbaleno obalů:  ${totalUnwrapped}`)
  console.log(`Chyby:            ${errors}`)
  console.log('══════════════════════════════════════════\n')

  process.exit(errors > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error('💥 Fatální chyba:', error)
  process.exit(1)
})
