import 'dotenv/config'
import { getPayload, type PayloadRequest } from 'payload'
import configPromise from '../src/payload.config'

/**
 * Jednorázové sloučení duplikátu (rozhodnutí uživatele 19. 9. 2026): Islandské
 * národní muzeum v Reykjavíku existovalo jako dva turistické cíle — dvě autorky
 * o něm napsaly nezávisle (2014 a 2016), starý web srážku adres vyřešil časovým
 * razítkem ve slugu (`islandske-narodni-muzeum1715030766227`). Stejná budova,
 * stejná adresa (Suðurgata 41), stejné souřadnice.
 *
 * Zůstává novější text (legacy id 3305, „živější", 615 znaků); starší stránka
 * (legacy id 906) se maže. Její fotka se před smazáním připojí na konec textu
 * zůstávající stránky jako blok contentImage, ať se neztratí — když ji připojit
 * nejde (text bez kořene), skript skončí a nic nesmaže. Obě operace běží
 * v jedné transakci: buď se fotka připojí A stránka smaže, nebo nic. Na stránku 906
 * neodkazují články ani komentáře (ověřeno FK), jen dvě položky historie bodů
 * autorky (transactions_rels) — ty FK smaže kaskádou, záznamy transakcí zůstávají.
 *
 * Slug zůstávající stránky se tu NEMĚNÍ: přejmenování na `islandske-narodni-
 * muzeum` (a 301 ze staré adresy s razítkem) dělá hned potom obecný
 * `pnpm seo:slugy-diakritika` — do jeho běhu byl tenhle pár jediná kolize, kvůli
 * které stránku vynechával.
 *
 *   pnpm merge:islandske-muzeum            # dry-run
 *   pnpm merge:islandske-muzeum -- --apply # provede
 *
 * Idempotentní: když stránka 906 už neexistuje, skript jen ohlásí stav. Po běhu
 * na PRODUKCI následuje `pnpm seo:slugy-diakritika -- --apply` a force-recreate cms.
 */

const APPLY = process.argv.includes('--apply')
const LEGACY_KEEP = 3305
const LEGACY_DROP = 906

type LexicalBlock = {
  type: 'block'
  fields: Record<string, unknown>
  format: string
  version: number
}
type LexicalNode = { [k: string]: unknown; type?: string; version?: number }
type LexicalRoot = { root: { children: LexicalNode[]; [k: string]: unknown } }

const relationId = (v: unknown): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number(v.id) : null

async function main() {
  const payload = await getPayload({ config: configPromise })

  const byLegacy = async (legacyPageId: number) => {
    const res = await payload.find({
      collection: 'pages',
      overrideAccess: true,
      where: { legacyPageId: { equals: legacyPageId } },
      depth: 0,
      limit: 2,
      select: { title: true, slug: true, fullSlug: true, text: true, featuredImage: true },
      joins: false,
    })
    if (res.docs.length > 1)
      throw new Error(`legacyPageId ${legacyPageId} má ${res.docs.length} stránek`)
    return (res.docs[0] ?? null) as unknown as {
      id: number
      title: string
      slug: string
      fullSlug: string
      text: LexicalRoot | null
      featuredImage?: { image?: unknown } | null
    } | null
  }

  const keep = await byLegacy(LEGACY_KEEP)
  const drop = await byLegacy(LEGACY_DROP)
  if (!keep) throw new Error(`Chybí stránka, která má zůstat (legacy ${LEGACY_KEEP})`)
  console.log(`zůstává  #${keep.id} „${keep.title}" ${keep.fullSlug}`)
  if (!drop) {
    console.log(`stránka legacy ${LEGACY_DROP} už neexistuje — sloučeno dřív, není co dělat.`)
    process.exit(0)
  }
  console.log(`maže se  #${drop.id} „${drop.title}" ${drop.fullSlug}`)

  // Fotka mazané stránky → blok na konec textu zůstávající (pokud tam ještě není).
  const dropImage = relationId(drop.featuredImage?.image)
  const keepText = keep.text
  const alreadyThere =
    dropImage != null && JSON.stringify(keepText ?? {}).includes(`"image":${dropImage}`)
  const willAddImage = dropImage != null && !!keepText?.root && !alreadyThere
  console.log(
    dropImage == null
      ? 'fotka: mazaná stránka žádnou nemá'
      : alreadyThere
        ? `fotka ${dropImage}: v textu zůstávající už je`
        : `fotka ${dropImage}: ${willAddImage ? 'přidá se na konec textu' : 'NELZE přidat (text bez root)'}`,
  )
  if (dropImage != null && !alreadyThere && !willAddImage) {
    console.error(
      'Fotku není kam připojit — mazat se nebude. Doplň text zůstávající stránky v adminu.',
    )
    process.exit(1)
  }

  if (!APPLY) {
    console.log('\nDry-run hotov (nic nezapsáno).')
    process.exit(0)
  }

  // Jedna transakce: připojení fotky a smazání duplikátu buď obojí, nebo nic
  // (jinak by po pádu mezi kroky zůstaly obě stránky a kolize adres dál).
  const transactionID = await payload.db.beginTransaction()
  const req = (transactionID ? { transactionID } : {}) as PayloadRequest
  try {
    if (willAddImage && keepText) {
      const block: LexicalBlock = {
        type: 'block',
        fields: {
          id: `merge${LEGACY_DROP}${dropImage}`,
          image: dropImage,
          caption: drop.title,
          blockType: 'contentImage',
        },
        format: '',
        version: 2,
      }
      await payload.update({
        collection: 'pages',
        id: keep.id,
        depth: 0,
        overrideAccess: true,
        req,
        data: {
          text: { root: { ...keepText.root, children: [...keepText.root.children, block] } },
        },
      })
      console.log('fotka přidána')
    }
    await payload.delete({ collection: 'pages', id: drop.id, overrideAccess: true, req })
    if (transactionID) await payload.db.commitTransaction(transactionID)
  } catch (err) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID)
    throw err
  }
  console.log(
    `smazána #${drop.id}. Teď: pnpm seo:slugy-diakritika (dry-run → --apply) přejmenuje #${keep.id}.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
