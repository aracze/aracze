/**
 * ⚠️ DŮLEŽITÉ: Tento skript vyžaduje zafixovanou verzi @payloadcms/richtext-lexical (aktuálně 3.76.1).
 * Používá EXPERIMENTAL_TableFeature, jehož schéma se může v novějších verzích změnit a zneplatnit tuto migraci.
 * Před upgrady balíčků vždy ověřte kompatibilitu generovaných Lexical JSON uzlů.
 *
 * Migrační skript: MySQL DB (HTML text) → Payload CMS (Lexical JSON) pro ČLÁNKY.
 * Vychází ze stejného principu jako `migrate-pages.ts`.
 *
 * Vazby na stránky (mainPage / pages) se přebírají z tabulky `url_to_article`
 * a sloupce `article.canonical_page_id`. Legacy ID se ukládá do pole `legacyArticleId`.
 *
 * Prerekvizity (nainstalujte před spuštěním):
 *   pnpm add -D mysql2
 *
 * Spuštění:
 *   pnpm migrate:articles -- --dry-run
 *   pnpm migrate:articles
 *   pnpm migrate:articles -- --limit=10
 *   pnpm migrate:articles -- --id=8        # migrace jednoho článku pro testování komponent
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { getPayload, type Payload } from 'payload'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
// @ts-ignore
import { JSDOM } from 'jsdom'
import configPromise from '../src/payload.config.js'
import { Article } from '../src/payload-types'

// ─────────────────────────────────────────────────────────────────────────────
// KONFIGURACE
// ─────────────────────────────────────────────────────────────────────────────

const OLD_DB_CONFIG = {
  host: process.env.OLD_DB_HOST || 'localhost',
  port: Number(process.env.OLD_DB_PORT || 3306),
  user: process.env.OLD_DB_USER || 'root',
  password: process.env.OLD_DB_PASSWORD || '',
  database: process.env.OLD_DB_NAME || 'cms',
}

// ⚠️ Názvy tabulek a sloupců ze staré DB
const OLD_TABLE = 'article'
const URL_TABLE = 'url_to_article'

// Base URL of the old CMS site — used to convert relative links to absolute
// so convertHTMLToLexical treats them as external links, not internal Payload document links.
const OLD_SITE_BASE_URL = process.env.OLD_SITE_BASE_URL || 'https://www.ara.cz'

// Hostitelé považovaní za „interní" při konverzi odkazů. Odvozeno i z OLD_SITE_BASE_URL,
// aby relativní legacy odkazy (absolutizované přes base URL) byly rozpoznány konzistentně.
const ARA_HOSTS: Set<string> = new Set(
  ['ara.cz', 'www.ara.cz', safeHostname(OLD_SITE_BASE_URL)].filter((h): h is string => Boolean(h)),
)

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
let limit: number | null = null
if (limitArg) {
  const parsed = parseInt(limitArg.split('=')[1], 10)
  if (!isNaN(parsed) && parsed > 0) {
    limit = parsed
  }
}

// Natvrdo migrujeme pouze jeden článek (id=8) – slouží k testování komponent.
// Pro plnou migraci tuto konstantu nastav na null (a případně použij --id=/--limit=).
const DEFAULT_LEGACY_ID: number | null = null

const idArg = process.argv.find((arg) => arg.startsWith('--id='))
let onlyLegacyId: number | null = DEFAULT_LEGACY_ID
if (idArg) {
  const parsed = parseInt(idArg.split('=')[1], 10)
  // Neplatné --id nesmí tiše spadnout do defaultu (a spustit tak plnou migraci).
  if (isNaN(parsed) || parsed <= 0) {
    console.error(`❌ Neplatné --id: "${idArg.split('=')[1]}". Musí být kladné celé číslo.`)
    process.exit(1)
  }
  onlyLegacyId = parsed
}

type OldRecord = {
  id: number
  title: string
  text: string
  meta_title?: string | null
  meta_description?: string | null
  user_id?: number | null
  published_date?: Date | string | null
  date_created?: Date | string | null
  canonical_page_id?: number | null
  is_published?: number | boolean | null
  main_image_name?: string | null
  main_image_description?: string | null
  main_image_css?: string | null
  article_category?: string | null
  [key: string]: unknown
}

type UrlRecord = {
  article_id: number
  url: string | null
  page_id: number | null
  is_canonical: number | boolean | null
}

// Legacy ArticleCategory enum → nová select hodnota v kolekci Articles.
const categoryMap: Record<string, Article['category']> = {
  TRAVEL_GUIDE: 'Průvodce',
  RADY_NA_CESTU: 'RadyNaCestu',
  AKCE: 'Článek',
}

type SourceLinkMeta = {
  href: string
  nofollow: boolean
}

type MediaCcMeta = {
  isCreativeCommons: boolean
  author: string
  source: string
  sourceLink: string
  creativeCommonsLicense: string
}

type ParsedCcImg = {
  caption: string
  author: string
  source: string
  sourceLink: string
  license: string
}

// Legacy obsah má popisek s atribucí v samostatném <p class="cc-img">, např.:
//   "Město Komiza na Vis ostrově - photo by: <a ...>Mario Fajt</a> (Flickr), CC BY 2.0"
// Z toho vytáhneme čistý popisek + Creative Commons metadata (autor, zdroj, odkaz, licence).
function parseCcImg(pEl: any): ParsedCcImg {
  const fullText = (pEl.textContent || '').replace(/\s+/g, ' ').trim()
  const link = pEl.querySelector('a')
  const author = link ? (link.textContent || '').trim() : ''
  const sourceLink = link ? (link.getAttribute('href') || '').trim() : ''

  let caption = fullText
  const byIdx = fullText.search(/-\s*(photo by|foto)\s*:/i)
  if (byIdx >= 0) {
    caption = fullText
      .substring(0, byIdx)
      .replace(/[-\s]+$/, '')
      .trim()
  }

  const sourceMatch = fullText.match(/\(([^)]+)\)/)
  const source = sourceMatch ? sourceMatch[1].trim() : ''

  let license = ''
  const licenseMatch = fullText.match(/\)\s*,\s*(.+)$/)
  if (licenseMatch) license = licenseMatch[1].trim()

  return { caption, author, source, sourceLink, license }
}

type PageSlugInfo = { id: number | string; segments: string[] }

function toSegments(path: string): string[] {
  return path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
}

// Legacy odkazy v tělech článků používají historické URL (často "dlouhou" variantu jako
// `usa/kalifornie/san-francisco/turisticke-cile/zajimavosti/cable-cars`), zatímco nový
// `fullSlug` stránky je `/usa/kalifornie/san-francisco/cable-cars`. Kategoriální segmenty
// (turisticke-cile/zajimavosti/…) v novém slugu nejsou, takže surová cesta nikdy nesedí 1:1.
// Stabilní identifikátor je poslední segment (vlastní slug stránky) + geografičtí předci.
function buildAraLinkResolver(pages: any[]): (pathname: string) => number | string | null {
  const byFullSlug = new Map<string, number | string>()
  const byFinalSlug = new Map<string, PageSlugInfo[]>()

  for (const page of pages) {
    const id = page?.id
    if (!id) continue
    const segments = typeof page?.fullSlug === 'string' ? toSegments(page.fullSlug) : []
    if (segments.length === 0) continue

    byFullSlug.set(segments.join('/'), id)
    const final = segments[segments.length - 1]
    if (!byFinalSlug.has(final)) byFinalSlug.set(final, [])
    byFinalSlug.get(final)!.push({ id, segments })
  }

  return (pathname: string): number | string | null => {
    const linkSegs = toSegments(pathname)
    if (linkSegs.length === 0) return null

    // 1) Přesná shoda celé cesty (odkaz už používá nový/kanonický tvar).
    const exact = byFullSlug.get(linkSegs.join('/'))
    if (exact) return exact

    // 2) Shoda podle posledního segmentu (slug stránky).
    const candidates = byFinalSlug.get(linkSegs[linkSegs.length - 1])
    if (!candidates || candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0].id

    // Víc stránek se stejným slugem (typicky generické kategorie jako `pocasi`, `doprava`):
    // vybereme tu, jejíž předci se nejvíc překrývají s cestou odkazu. Vyžadujeme
    // jednoznačného vítěze a aspoň jednoho shodného předka (skóre ≥ 2), jinak raději necháme být.
    const linkSet = new Set(linkSegs)
    let best: PageSlugInfo | null = null
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
    if (best && !tie && bestScore >= 2) return best.id
    return null
  }
}

function isAraHost(hostname: string): boolean {
  return ARA_HOSTS.has(hostname.toLowerCase())
}

function hasNoFollowRel(value: string | null): boolean {
  if (!value) return false
  return value
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .includes('nofollow')
}

function applyNoFollowToLexicalLinks(lexicalData: any, sourceLinks: SourceLinkMeta[]): number {
  let annotated = 0
  let sourceIndex = 0

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return

    if (node.type === 'link' && node.fields && typeof node.fields === 'object') {
      const fields = node.fields as Record<string, unknown>
      const url = typeof fields.url === 'string' ? fields.url.trim() : ''

      if (sourceIndex < sourceLinks.length && url) {
        if (sourceLinks[sourceIndex]?.href !== url) {
          const lookaheadLimit = Math.min(sourceIndex + 5, sourceLinks.length - 1)
          for (let i = sourceIndex + 1; i <= lookaheadLimit; i++) {
            if (sourceLinks[i]?.href === url) {
              sourceIndex = i
              break
            }
          }
        }

        const sourceLink = sourceLinks[sourceIndex]
        if (sourceLink?.nofollow) {
          fields.nofollow = true
          annotated++
        }
        sourceIndex++
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(visit)
    }
  }

  visit(lexicalData?.root)
  return annotated
}

// Z inline obsahu buňky tabulky vytvoří Lexical text nody se zachováním formátování
// (tučné/kurzíva/podtržení/přeškrtnutí). Legacy buňky míchají prostý text s <strong>,
// takže `textContent` (dříve použitý) tučnost zahazoval. Formát je Lexical bitmaska:
// 1=bold, 2=italic, 4=strikethrough, 8=underline.
function cellInlineToLexical(el: any): any[] {
  const out: any[] = []

  const walk = (node: any, format: number) => {
    if (!node) return
    if (node.nodeType === 3) {
      // TEXT_NODE
      const text = String(node.textContent || '')
      if (text) {
        out.push({ type: 'text', text, format, style: '', mode: 'normal', version: 1 })
      }
      return
    }
    if (node.nodeType !== 1) return // jen elementy dál

    let fmt = format
    const tag = node.tagName.toLowerCase()
    if (tag === 'strong' || tag === 'b') fmt |= 1
    else if (tag === 'em' || tag === 'i') fmt |= 2
    else if (tag === 's' || tag === 'strike' || tag === 'del') fmt |= 4
    else if (tag === 'u') fmt |= 8

    node.childNodes.forEach((child: any) => walk(child, fmt))
  }

  el.childNodes.forEach((child: any) => walk(child, 0))

  // Sjednocení bílých znaků (vč. &nbsp;) a oříznutí okrajů celé sekvence.
  for (const n of out) n.text = n.text.replace(/\s+/g, ' ')
  while (out.length && out[0].text.trim() === '') out.shift()
  if (out.length) out[0].text = out[0].text.replace(/^\s+/, '')
  while (out.length && out[out.length - 1].text.trim() === '') out.pop()
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '')

  // Lexical vyžaduje aspoň jeden text node (prázdná buňka).
  if (out.length === 0) {
    out.push({ type: 'text', text: '', format: 0, style: '', mode: 'normal', version: 1 })
  }
  return out
}

function convertAraLinksToInternalLinks(
  lexicalData: any,
  resolveAraLink: (pathname: string) => number | string | null,
): { converted: number; unresolved: string[] } {
  let converted = 0
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
            const targetPageId = resolveAraLink(parsed.pathname)

            if (targetPageId) {
              fields.linkType = 'internal'
              fields.doc = {
                relationTo: 'pages',
                value: targetPageId,
              }
              delete fields.url
              converted++
            } else {
              unresolved.push(parsed.pathname)
            }
          }
        } catch {
          // Ignore malformed URL and leave the original custom link untouched.
        }
      }
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(visit)
    }
  }

  visit(lexicalData?.root)
  return { converted, unresolved }
}

// Legacy „lightbox" kotvy kolem obrázků (<a href="…/full.jpg"><img/></a>) skončí po
// konverzi jako link uzel obalující ContentImage/upload blok. To je nevalidní (blok
// uvnitř inline linku) a na frontendu se serializuje jako prázdný <a> kolem obrázku.
// Takové obaly zahodíme a blok povýšíme na místo linku.
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

function normalizeMetaValue(value: unknown): string {
  return String(value || '').trim()
}

function emptyLexical(): object {
  return { root: { type: 'root', format: '', indent: 0, version: 1, children: [] } }
}

// Legacy obsah končívá <p class="attribution">Zdroj: <a>...</a></p>. Vyjmeme ho z těla
// a uložíme zvlášť do pole `attribution` (frontend ho zobrazí zarovnaný vpravo kurzívou).
function extractAttribution(html: string): { body: string; attributionHtml: string } {
  const re = /<p[^>]*class="[^"]*\battribution\b[^"]*"[^>]*>[\s\S]*?<\/p>/gi
  const matches = html.match(re) || []
  const body = html.replace(re, '')
  return { body, attributionHtml: matches.join('\n') }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML → LEXICAL
//
// Články neobsahují stránkové widgety (sezónnost, nice-to-know, denní náklady),
// proto se zde řeší jen obecné prvky: odkazy, tabulky, obrázky, iframe a seznamy.
// Logika extrakce tabulek/obrázků/iframe je shodná s `migrate-pages.ts`.
// ─────────────────────────────────────────────────────────────────────────────

async function htmlToLexical(
  html: string,
  payload: Payload,
  mediaMap: {
    filename: Map<string, number | string>
    cloudinary: Map<string, number | string>
  },
  imageCcSink?: Map<number | string, ParsedCcImg>,
): Promise<object> {
  if (!html || html.trim() === '') {
    return emptyLexical()
  }

  try {
    // Pomocí JSDOM očistíme HTML o anchor odkazy a prázdné odkazy, které zlobí v Lexicalu
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const unwrapAnchor = (a: any) => {
      const parent = a.parentNode
      if (parent) {
        while (a.firstChild) {
          parent.insertBefore(a.firstChild, a)
        }
        parent.removeChild(a)
      }
    }

    const links = doc.querySelectorAll('a')
    links.forEach((a: any) => {
      if (a.hasAttribute('name')) {
        unwrapAnchor(a)
        return
      }

      const href = (a.getAttribute('href') || '').trim()
      if (!href || href.startsWith('#')) {
        unwrapAnchor(a)
        return
      }

      if (/^(mailto:|tel:|sms:)/i.test(href)) {
        return
      }

      // Odkazy na ara.cz ponechame jako normalni klikaci linky.
      if (href.startsWith('https://ara.cz')) {
        const resolvedInternal = new URL(href, OLD_SITE_BASE_URL)
        a.setAttribute('href', resolvedInternal.href)
        return
      }

      const hasExplicitScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href)

      try {
        const resolvedUrl = new URL(href, OLD_SITE_BASE_URL)
        a.setAttribute('href', hasExplicitScheme ? href : resolvedUrl.href)
      } catch {
        // malformed href — unwrap the link to avoid Lexical confusion
        unwrapAnchor(a)
      }
    })

    const blocks: any[] = []

    // Extrakce `<div class="article-rek">` (legacy propagační / reklamní box) do PromoBlock.
    // convertHTMLToLexical neumí <div>, takže bychom jinak přišli o wrapper i o vizuální oddělení.
    // Vytáhneme ho jako první (před table/iframe/img), aby vnořené prvky nezpracovaly pozdější smyčky.
    const promoBoxes = Array.from(doc.querySelectorAll('.article-rek'))
    for (const promo of promoBoxes as any[]) {
      const innerHtml = (promo.innerHTML || '').trim()
      if (!innerHtml) {
        promo.parentNode?.removeChild(promo)
        continue
      }
      const contentLexical = await htmlToLexical(innerHtml, payload, mediaMap, imageCcSink)
      // Externí promo odkazy označíme jako nofollow (SEO – jde o propagaci cizího webu).
      ;(function markNofollow(node: any) {
        if (!node || typeof node !== 'object') return
        if (node.type === 'link' && node.fields && typeof node.fields === 'object') {
          node.fields.nofollow = true
        }
        const children = node.children || (node.root ? [node.root] : null)
        if (Array.isArray(children)) children.forEach(markNofollow)
      })(contentLexical)
      const index = blocks.length
      blocks.push({
        type: 'block',
        fields: {
          blockType: 'promoBlock',
          content: contentLexical,
        },
        format: '',
        version: 2,
      })
      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`
      if (promo.parentNode) promo.parentNode.replaceChild(p, promo)
    }

    // Extrakce <table> pro nativní Lexical tabulku
    const tables = doc.querySelectorAll('table')
    tables.forEach((table: any) => {
      const index = blocks.length
      const rows: any[] = []

      const trs = table.querySelectorAll('tr')
      let rowIndex = 0
      trs.forEach((tr: any) => {
        const cells: any[] = []
        const tds = tr.querySelectorAll('td, th')
        tds.forEach((td: any, colIndex: number) => {
          // Bitmask: 1 = ROW, 2 = COLUMN, 3 = BOTH
          let headerState = 0
          const isTh = td.tagName.toLowerCase() === 'th'

          if (isTh) {
            if (rowIndex === 0 && colIndex === 0) {
              headerState = 3
            } else if (rowIndex === 0) {
              headerState = 2
            } else {
              headerState = 1
            }
          }

          cells.push({
            type: 'tablecell',
            headerState: headerState,
            colSpan: parseInt(td.getAttribute('colspan') || '1', 10),
            rowSpan: parseInt(td.getAttribute('rowspan') || '1', 10),
            value: 0,
            format: '',
            version: 1,
            children: [
              {
                type: 'paragraph',
                format: '',
                indent: 0,
                version: 1,
                children: cellInlineToLexical(td),
              },
            ],
          })
        })

        if (cells.length > 0) {
          rows.push({
            type: 'tablerow',
            height: 0,
            format: '',
            version: 1,
            children: cells,
          })
        }
        rowIndex++
      })

      blocks.push({
        type: 'table',
        format: '',
        version: 1,
        children: rows,
      })

      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`

      if (table.parentNode) table.parentNode.replaceChild(p, table)
    })

    // Oprava vnořených seznamů (přesunutí <ul> z prázdného <li> do předchozího <li>)
    const listItems = Array.from(doc.querySelectorAll('li'))
    listItems.forEach((li: any) => {
      const firstChild = li.firstElementChild
      if (firstChild && (firstChild.tagName === 'UL' || firstChild.tagName === 'OL')) {
        const directText = Array.from(li.childNodes)
          .filter((node: any) => node.nodeType === 3) // Node.TEXT_NODE
          .map((node: any) => node.textContent.trim())
          .join('')

        if (directText === '' && li.previousElementSibling?.tagName === 'LI') {
          li.previousElementSibling.appendChild(firstChild)
          li.remove()
        }
      }
    })

    // Extrakce <iframe> pro MapBlock
    const iframes = doc.querySelectorAll('iframe')
    iframes.forEach((iframe: any) => {
      const src = iframe.getAttribute('src') || ''
      const index = blocks.length
      blocks.push({
        type: 'block',
        fields: {
          blockType: 'mapBlock',
          iframeUrl: src,
          caption: '',
        },
        format: '',
        version: 2,
      })
      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`
      if (iframe.parentNode) iframe.parentNode.replaceChild(p, iframe)
    })

    // Extrakce <img> pro ContentImage
    const imgs = doc.querySelectorAll('img')
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i] as any
      const src = img.getAttribute('src') || ''
      const alt = (img.getAttribute('alt') || '').trim()

      const filename = src.split('/').pop()?.split('?')[0] || ''
      const nameWithoutExt = filename.includes('.')
        ? filename.split('.').slice(0, -1).join('.')
        : filename

      let mediaId = null
      if (filename) {
        mediaId =
          mediaMap.filename.get(filename) ||
          mediaMap.cloudinary.get(nameWithoutExt) ||
          mediaMap.cloudinary.get(filename) ||
          null
      }

      // Legacy HTML obsahuje za obrázkem samostatný odstavec popisku/atribuce.
      // Obrázek je obvykle zabalený v <a> uvnitř <p>, takže hledáme až za tímto blokem.
      // - <p class="cc-img"> → vytáhneme Creative Commons metadata a odstavec odstraníme
      // - běžný popisek shodný s altem → odstraníme (jinak by se text zdvojil)
      let captionToRemove: any = null
      let parsedCc: ParsedCcImg | null = null
      const searchContext = img.closest?.('figure') || img.closest?.('p') || img
      let current = searchContext.nextElementSibling

      for (let j = 0; j < 3; j++) {
        if (!current) break
        const tag = current.tagName.toLowerCase()
        const classes = (current.getAttribute('class') || '').split(/\s+/)
        const text = (current.textContent || '').trim().replace(/\s+/g, ' ')
        const normalizedAlt = alt.replace(/\s+/g, ' ')

        if (classes.includes('cc-img')) {
          parsedCc = parseCcImg(current)
          captionToRemove = current
          break
        }

        if (alt && (tag === 'p' || tag === 'figcaption') && text === normalizedAlt) {
          captionToRemove = current
          break
        }

        if (text) break
        current = current.nextElementSibling
      }

      // Creative Commons metadata předáme volajícímu, aby je zapsal do media záznamu.
      if (parsedCc && mediaId && imageCcSink && !imageCcSink.has(mediaId)) {
        imageCcSink.set(mediaId, parsedCc)
      }

      const blockCaption = parsedCc?.caption || alt

      const index = blocks.length
      if (mediaId) {
        blocks.push({
          type: 'block',
          fields: {
            blockType: 'contentImage',
            image: mediaId,
            caption: blockCaption,
          },
          format: '',
          version: 2,
        })
      } else {
        blocks.push({
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: `[Chybějící obrázek: ${src}]`,
              format: 0,
              style: '',
              mode: 'normal',
              version: 1,
            },
          ],
          format: '',
          indent: 0,
          version: 1,
        })
      }

      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`
      // Když je obrázek zabalený jen v <a> (legacy lightbox), nahradíme celý <a>, ne jen
      // <img> — jinak by placeholder (a tím i blok) zůstal uvnitř odkazu a skončil pod
      // Lexical link uzlem.
      const parent = img.parentNode as any
      const outer =
        parent && parent.tagName === 'A' && (parent.textContent || '').trim() === '' ? parent : img
      if (outer.parentNode) outer.parentNode.replaceChild(p, outer)

      if (captionToRemove && captionToRemove.parentNode) {
        captionToRemove.parentNode.removeChild(captionToRemove)
      }
    }

    // Tučné přes inline styl (např. <span style="font-weight:600">) převedeme na <strong>,
    // jinak convertHTMLToLexical inline styly zahodí a text ztratí tučnost.
    doc.querySelectorAll('[style*="font-weight"]').forEach((el: any) => {
      const style = el.getAttribute('style') || ''
      if (/font-weight:\s*(bold|bolder|[6-9]00)/i.test(style)) {
        const strong = doc.createElement('strong')
        strong.innerHTML = el.innerHTML
        el.parentNode?.replaceChild(strong, el)
      }
    })

    // Legacy zvýrazněný blok `<div class="article-content__highlights">` převedeme na <blockquote>,
    // jinak ho convertHTMLToLexical (neumí <div>) zahodí i s obsahem.
    doc.querySelectorAll('.article-content__highlights').forEach((div: any) => {
      const blockquote = doc.createElement('blockquote')
      blockquote.innerHTML = div.innerHTML
      div.parentNode?.replaceChild(blockquote, div)
    })

    // Převod h1 na h2 v obsahu (H1 má být jen hlavní nadpis stránky)
    doc.querySelectorAll('h1').forEach((h1: any) => {
      const h2 = doc.createElement('h2')
      h2.innerHTML = h1.innerHTML
      if (h1.parentNode) {
        h1.parentNode.replaceChild(h2, h1)
      }
    })

    // Čištění prázdných odstavců před převodem
    doc.querySelectorAll('p').forEach((p: any) => {
      const text = p.textContent?.trim() || ''
      if (text === '' && p.children.length === 0) {
        p.parentNode?.removeChild(p)
      }
    })

    // sourceLinks sbíráme až z finálního DOM (po extrakci bloků, obrázků a dalších mutacích),
    // aby pořadí odkazů sedělo s Lexical výstupem a applyNoFollowToLexicalLinks() nemíchal metadata.
    const sourceLinks: SourceLinkMeta[] = Array.from(doc.querySelectorAll('a')).map((a: any) => ({
      href: (a.getAttribute('href') || '').trim(),
      nofollow: hasNoFollowRel(a.getAttribute('rel')),
    }))

    const finalHtml = doc.body.innerHTML

    // @ts-ignore
    const editorConfig = await editorConfigFactory.default({ config: payload.config })
    const lexicalData: any = await convertHTMLToLexical({ html: finalHtml, editorConfig, JSDOM })

    // Rekurzivní nahrazení placeholderů v Lexical stromu
    function replaceBlocks(node: any) {
      if (!node || typeof node !== 'object') return

      if (node.children && Array.isArray(node.children)) {
        const newChildren: any[] = []

        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i]

          if (child.type === 'text' && child.text.includes('__PAYLOAD_BLOCK_')) {
            const parts = child.text.split(/(__PAYLOAD_BLOCK_\d+__)/g)
            for (const part of parts) {
              if (!part) continue
              const match = part.match(/__PAYLOAD_BLOCK_(\d+)__/)
              if (match) {
                const blockIndex = parseInt(match[1], 10)
                if (blocks[blockIndex]) {
                  newChildren.push(blocks[blockIndex])
                } else {
                  console.warn(
                    `    ⚠️  Blok s indexem ${blockIndex} nebyl nalezen! Zachovávám text.`,
                  )
                  newChildren.push({ ...child, text: part })
                }
              } else {
                newChildren.push({ ...child, text: part })
              }
            }
          } else {
            newChildren.push(child)
            replaceBlocks(child)
          }
        }

        node.children = newChildren.flatMap((c: any) => {
          if (
            c.type === 'paragraph' &&
            c.children?.length === 1 &&
            (c.children[0].type === 'block' ||
              c.children[0].type === 'upload' ||
              c.children[0].type === 'table')
          ) {
            // Tabulka (ani block/upload) nepatří do <p> – jinak prohlížeč <p> rozbije
            // a za tabulkou vznikne prázdný odstavec (zbytečná mezera navíc).
            return [c.children[0]]
          }
          return [c]
        })
      }
    }

    replaceBlocks(lexicalData?.root)
    applyNoFollowToLexicalLinks(lexicalData, sourceLinks)
    return lexicalData
  } catch (err) {
    console.warn(`    ⚠️  HTML → Lexical selhalo, ukládám jako plain text. (${err})`)
    const plainText = html.replace(/<[^>]+>/g, '').trim()
    if (!plainText) return emptyLexical()
    return {
      root: {
        type: 'root',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: plainText,
                format: 0,
                style: '',
                mode: 'normal',
                detail: 0,
                version: 1,
              },
            ],
          },
        ],
      },
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NAČTENÍ ZE STARÉ DB
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOldRecords(conn: mysql.Connection): Promise<OldRecord[]> {
  const whereClause = onlyLegacyId ? `WHERE \`id\` = ${onlyLegacyId}` : ''
  const limitClause = limit && Number.isFinite(limit) ? `LIMIT ${limit}` : ''
  const query = `
    SELECT
      \`id\`,
      \`title\`,
      \`text\`,
      \`meta_title\`,
      \`meta_description\`,
      \`user_id\`,
      \`published_date\`,
      \`date_created\`,
      \`canonical_page_id\`,
      \`is_published\`,
      \`main_image_name\`,
      \`main_image_description\`,
      \`main_image_css\`,
      \`article_category\`
    FROM \`${OLD_TABLE}\`
    ${whereClause}
    ORDER BY \`id\` ASC
    ${limitClause}
  `
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(query)
  return rows as OldRecord[]
}

async function fetchUrlRecords(
  conn: mysql.Connection,
  articleIds: number[],
): Promise<Map<number, UrlRecord[]>> {
  const map = new Map<number, UrlRecord[]>()
  if (articleIds.length === 0) return map

  const idList = articleIds.map((id) => Number(id)).join(',')
  const query = `
    SELECT \`article_id\`, \`url\`, \`page_id\`, \`is_canonical\`
    FROM \`${URL_TABLE}\`
    WHERE \`article_id\` IN (${idList})
  `
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(query)

  for (const row of rows as UrlRecord[]) {
    const list = map.get(row.article_id) || []
    list.push(row)
    map.set(row.article_id, list)
  }
  return map
}

// Legacy stránky typu "Články" (ARTICLE_LIST) a rozcestníky se při migraci stránek přeskakují,
// proto se na ně článek nemůže navázat přímo. Vyšplháme po stromu rodičů k nejbližší stránce,
// která v Payloadu reálně existuje (např. chorvatsko/clanky → Chorvatsko).
async function fetchPageParentMap(conn: mysql.Connection): Promise<Map<number, number | null>> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>('SELECT `id`, `parent_id` FROM `page`')
  const map = new Map<number, number | null>()
  for (const row of rows as { id: number; parent_id: number | null }[]) {
    map.set(Number(row.id), row.parent_id != null ? Number(row.parent_id) : null)
  }
  return map
}

function resolvePayloadPageId(
  legacyPageId: number,
  pagesMap: Map<number, number | string>,
  parentMap: Map<number, number | null>,
): number | string | undefined {
  let current: number | null = legacyPageId
  const visited = new Set<number>()
  while (current != null && !visited.has(current)) {
    visited.add(current)
    const mapped = pagesMap.get(current)
    if (mapped) return mapped
    current = parentMap.get(current) ?? null
  }
  return undefined
}

function deriveSlug(urlRecords: UrlRecord[], title: string): string {
  // Preferuj kanonickou URL, jinak první dostupnou.
  const canonical = urlRecords.find((u) => isTruthyBit(u.is_canonical) && u.url)
  const fallback = urlRecords.find((u) => u.url)
  const rawUrl = (canonical?.url || fallback?.url || '').trim()

  let slug = rawUrl
  if (slug.includes('/')) {
    slug = slug.split('/').filter(Boolean).pop() || ''
  }
  if (!slug) slug = title

  return String(slug).substring(0, 255)
}

// MySQL `bit(1)` se přes mysql2 vrací jako Buffer (např. <Buffer 01>), nikoli boolean.
function isTruthyBit(value: unknown): boolean {
  if (value == null) return false
  if (Buffer.isBuffer(value)) return value[0] === 1
  if (typeof value === 'boolean') return value
  return Number(value) === 1
}

function toIsoDate(value: unknown): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  if (isNaN(date.getTime())) return undefined
  return date.toISOString()
}

// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🚀 Migrace článků spuštěna${isDryRun ? ' (DRY RUN)' : ''}`)
  if (onlyLegacyId) console.log(`   Pouze legacy id: ${onlyLegacyId}`)
  if (limit) console.log(`   Limit: ${limit}`)

  let conn
  try {
    conn = await mysql.createConnection(OLD_DB_CONFIG)
    console.log(`✅ Připojeno k MySQL: ${OLD_DB_CONFIG.database}@${OLD_DB_CONFIG.host}`)

    // @ts-ignore
    const payload = await getPayload({ config: configPromise })
    console.log('✅ Payload inicializován')

    const records = await fetchOldRecords(conn)
    console.log(`📦 Nalezeno ${records.length} záznamů v tabulce \`${OLD_TABLE}\`\n`)

    const urlMap = await fetchUrlRecords(
      conn,
      records.map((r) => Number(r.id)),
    )
    const pageParentMap = await fetchPageParentMap(conn)

    // ─────────────────────────────────────────────────────────────────────────
    // PRE-FETCHING (OPTIMALIZACE)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('⏳ Načítám cache pro optimalizaci...')

    const allUsers = await payload.find({
      collection: 'users',
      limit: 0,
      depth: 0,
      pagination: false,
      select: { legacyUserId: true },
    })
    const usersMap = new Map(
      allUsers.docs
        .filter((u: any) => u.legacyUserId != null)
        .map((u: any) => [Number(u.legacyUserId), u.id]),
    )

    const allMedia = await payload.find({
      collection: 'media',
      limit: 0,
      depth: 0,
      pagination: false,
      select: {
        filename: true,
        cloudinaryPublicId: true,
        isCreativeCommons: true,
        author: true,
        source: true,
        sourceLink: true,
        creativeCommonsLicense: true,
      },
    })
    const mediaMap = {
      filename: new Map(
        allMedia.docs.filter((m: any) => m.filename != null).map((m: any) => [m.filename, m.id]),
      ),
      cloudinary: new Map(
        allMedia.docs
          .filter((m: any) => m.cloudinaryPublicId != null)
          .map((m: any) => [m.cloudinaryPublicId, m.id]),
      ),
    }
    // Aktuální Creative Commons metadata médií – doplňujeme jen prázdná pole (existující nepřepisujeme).
    const mediaCcMap = new Map<string, MediaCcMeta>(
      allMedia.docs.map((m: any) => [
        String(m.id),
        {
          isCreativeCommons: Boolean(m.isCreativeCommons),
          author: normalizeMetaValue(m.author),
          source: normalizeMetaValue(m.source),
          sourceLink: normalizeMetaValue(m.sourceLink),
          creativeCommonsLicense: normalizeMetaValue(m.creativeCommonsLicense),
        },
      ]),
    )

    const allPages = await payload.find({
      collection: 'pages',
      limit: 0,
      depth: 0,
      pagination: false,
      select: { fullSlug: true, legacyPageId: true },
    })
    const pagesMap = new Map(
      allPages.docs
        .filter((p: any) => p.legacyPageId != null)
        .map((p: any) => [Number(p.legacyPageId), p.id]),
    )
    const resolveAraLink = buildAraLinkResolver(allPages.docs)

    const allArticles = await payload.find({
      collection: 'articles',
      limit: 0,
      depth: 0,
      pagination: false,
      select: { legacyArticleId: true, slug: true },
    })
    const articlesMap = new Map(
      allArticles.docs
        .filter((a: any) => a.legacyArticleId != null)
        .map((a: any) => [Number(a.legacyArticleId), a.id]),
    )
    // Adopce ručně vytvořených článků: pokud článek bez legacyArticleId má stejný slug,
    // aktualizujeme ho (a doplníme legacyArticleId) místo vytvoření duplicitu.
    const articleSlugMap = new Map<string, number | string>(
      allArticles.docs
        .filter((a: any) => a.slug && a.legacyArticleId == null)
        .map((a: any) => [String(a.slug), a.id]),
    )

    console.log(
      `✅ Cache připravena: ${usersMap.size} uživatelů, ${allMedia.docs.length} médií, ${pagesMap.size} stránek, ${articlesMap.size} článků\n`,
    )

    const resolveMediaId = (rawImageName: unknown) => {
      if (!rawImageName) return undefined
      const imageName = String(rawImageName).trim()
      if (!imageName) return undefined
      const imageNameWithoutExt = imageName.includes('.')
        ? imageName.split('.').slice(0, -1).join('.')
        : imageName
      return (
        mediaMap.filename.get(imageName) ||
        mediaMap.cloudinary.get(imageNameWithoutExt) ||
        mediaMap.cloudinary.get(imageName)
      )
    }

    let created = 0
    let updated = 0
    let skippedDryRun = 0
    let errors = 0

    for (const [index, record] of records.entries()) {
      const progress = `[${index + 1}/${records.length}]`
      const urlRecords = urlMap.get(Number(record.id)) || []
      const slug = deriveSlug(urlRecords, String(record.title || ''))

      // Pořadí párování: podle legacyArticleId, jinak adopce ručně vytvořeného článku se stejným slugem.
      const existingId = articlesMap.get(Number(record.id)) ?? articleSlugMap.get(slug)
      const isUpdate = !!existingId

      if (isDryRun) {
        const action = isUpdate ? 'UPDATE' : 'CREATE'
        console.log(`${progress} 📋 DRY RUN [${action}] "${record.title}" (slug: ${slug})`)
        skippedDryRun++
        continue
      }

      try {
        // Autor (createdBy) přes legacyUserId
        let createdByUserId: number | string | undefined = undefined
        if (record.user_id) {
          createdByUserId = usersMap.get(Number(record.user_id))
          if (!createdByUserId) {
            console.warn(`   [DEBUG] Uživatel s legacy ID ${record.user_id} NEBYL NALEZEN!`)
          }
        }

        // Kanonická stránka (mainPage).
        // Přednost má kanonická URL z `url_to_article` – odpovídá skutečně publikované URL
        // (sloupec `canonical_page_id` bývá zastaralý/nekonzistentní). Fallback je `canonical_page_id`.
        let canonicalLegacyPageId: number | null = null
        const canonicalUrl = urlRecords.find((u) => isTruthyBit(u.is_canonical) && u.page_id)
        if (canonicalUrl?.page_id) {
          canonicalLegacyPageId = Number(canonicalUrl.page_id)
        } else if (record.canonical_page_id) {
          canonicalLegacyPageId = Number(record.canonical_page_id)
        }

        let mainPageId: number | string | undefined = undefined
        if (canonicalLegacyPageId) {
          mainPageId = resolvePayloadPageId(canonicalLegacyPageId, pagesMap, pageParentMap)
          if (!mainPageId) {
            console.warn(
              `   [DEBUG] Kanonická stránka legacy ID ${canonicalLegacyPageId} NEBYLA NALEZENA (ani přes rodiče)!`,
            )
          }
        }

        // Ostatní stránky (pages) – všechny vazby kromě kanonické, namapované na reálnou Payload stránku.
        const otherPageIds: (number | string)[] = []
        const seenPayloadPageIds = new Set<number | string>()
        if (mainPageId != null) seenPayloadPageIds.add(mainPageId)
        for (const urlRecord of urlRecords) {
          if (!urlRecord.page_id) continue
          const legacyPageId = Number(urlRecord.page_id)
          const mappedId = resolvePayloadPageId(legacyPageId, pagesMap, pageParentMap)
          if (!mappedId) {
            console.warn(
              `   [DEBUG] Stránka legacy ID ${legacyPageId} NEBYLA NALEZENA (ani přes rodiče)!`,
            )
            continue
          }
          if (seenPayloadPageIds.has(mappedId)) continue
          seenPayloadPageIds.add(mappedId)
          otherPageIds.push(mappedId)
        }

        // Featured image
        const featuredImageId = resolveMediaId(record.main_image_name)
        if (record.main_image_name && !featuredImageId) {
          console.warn(`   [DEBUG] Obrázek ${record.main_image_name} NEBYL NALEZEN!`)
        }

        const mappedCategory = (categoryMap[String(record.article_category)] ||
          'Článek') as Article['category']
        // Kolekce Articles nemá zapnuté verze/drafty, takže se nepublikované články pouze označí v logu.
        const isPublished = record.is_published == null ? true : isTruthyBit(record.is_published)
        if (!isPublished) {
          console.warn(
            `   [DEBUG] Legacy článek je nepublikovaný (is_published=0) – ukládám jako živý.`,
          )
        }

        // Attribution ("Zdroj: …") vyjmeme z těla a uložíme do samostatného pole.
        const { body, attributionHtml } = extractAttribution(record.text || '')

        const imageCcSink = new Map<number | string, ParsedCcImg>()
        const lexicalText = await htmlToLexical(body, payload, mediaMap, imageCcSink)
        const unwrappedBlockLinks = unwrapBlockLinks(lexicalText?.root)
        if (unwrappedBlockLinks > 0) {
          console.log(`   [DEBUG] Rozbaleno lightbox obalů kolem obrázků: ${unwrappedBlockLinks}`)
        }
        const { converted: convertedInternalLinks, unresolved: unresolvedAraLinks } =
          convertAraLinksToInternalLinks(lexicalText, resolveAraLink)
        if (convertedInternalLinks > 0) {
          console.log(`   [DEBUG] Internal links převedeno: ${convertedInternalLinks}`)
        }
        if (unresolvedAraLinks.length > 0) {
          console.log(
            `   [DEBUG] Nenamapované ara.cz odkazy (${unresolvedAraLinks.length}): ${unresolvedAraLinks.join(', ')}`,
          )
        }

        const attributionLexical = attributionHtml.trim()
          ? await htmlToLexical(attributionHtml, payload, mediaMap)
          : null

        // Creative Commons metadata z popisků obrázků zapíšeme do media záznamů (jen prázdná pole).
        for (const [imageId, cc] of imageCcSink) {
          const key = String(imageId)
          const currentCc = mediaCcMap.get(key) || {
            isCreativeCommons: false,
            author: '',
            source: '',
            sourceLink: '',
            creativeCommonsLicense: '',
          }

          const nextCc: MediaCcMeta = {
            isCreativeCommons: currentCc.isCreativeCommons,
            author: currentCc.author || normalizeMetaValue(cc.author),
            source: currentCc.source || normalizeMetaValue(cc.source),
            sourceLink: currentCc.sourceLink || normalizeMetaValue(cc.sourceLink),
            creativeCommonsLicense:
              currentCc.creativeCommonsLicense || normalizeMetaValue(cc.license),
          }
          nextCc.isCreativeCommons =
            nextCc.isCreativeCommons ||
            nextCc.creativeCommonsLicense.length > 0 ||
            nextCc.source.length > 0 ||
            nextCc.sourceLink.length > 0 ||
            nextCc.author.length > 0

          const ccChanged =
            nextCc.isCreativeCommons !== currentCc.isCreativeCommons ||
            nextCc.author !== currentCc.author ||
            nextCc.source !== currentCc.source ||
            nextCc.sourceLink !== currentCc.sourceLink ||
            nextCc.creativeCommonsLicense !== currentCc.creativeCommonsLicense

          if (!ccChanged) continue

          try {
            await payload.update({
              collection: 'media',
              id: imageId,
              data: nextCc,
              overrideAccess: true,
            })
            mediaCcMap.set(key, nextCc)
            console.log(`   [DEBUG] CC metadata doplněna do media #${imageId} (${nextCc.author})`)
          } catch (mediaCcError) {
            console.warn(
              `   [DEBUG] Nepodařilo se zapsat CC metadata do media #${imageId}: ${mediaCcError}`,
            )
          }
        }

        const publishedAt = toIsoDate(record.published_date) || toIsoDate(record.date_created)

        const articleData: any = {
          legacyArticleId: Number(record.id),
          title: String(record.title || '').substring(0, 255),
          slug,
          text: lexicalText,
          attribution: attributionLexical,
          category: mappedCategory,
          createdBy: createdByUserId,
          mainPage: mainPageId,
          pages: otherPageIds,
          publishedAt,
          featuredImage: {
            image: featuredImageId,
            featureImageStyleCss: normalizeMetaValue(record.main_image_css) || undefined,
          },
          meta: {
            title: normalizeMetaValue(record.meta_title),
            description: normalizeMetaValue(record.meta_description),
          },
        }

        if (isUpdate && existingId) {
          const updatedDoc = await payload.update({
            collection: 'articles',
            id: existingId,
            data: articleData,
            overrideAccess: true,
          })
          articlesMap.set(Number(record.id), updatedDoc.id)
          console.log(`${progress} ✅ Aktualizováno: "${record.title}"`)
          updated++
        } else {
          const createdDoc = await payload.create({
            collection: 'articles',
            data: articleData,
            overrideAccess: true,
          })
          articlesMap.set(Number(record.id), createdDoc.id)
          console.log(`${progress} ✅ Vytvořeno: "${record.title}"`)
          created++
        }
      } catch (err: any) {
        console.error(`${progress} ❌ Chyba u "${record.title}":`, err)
        if (err.data?.errors) {
          console.error('   [DETAIL CHYBY]:', JSON.stringify(err.data.errors, null, 2))
        } else if (err.response?.data) {
          console.error('   [DETAIL CHYBY]:', JSON.stringify(err.response.data, null, 2))
        }
        errors++
      }
    }

    console.log('\n══════════════════════════════════════════')
    console.log('📊 Výsledky migrace článků:')
    console.log(`   Vytvořeno:            ${created}`)
    console.log(`   Aktualizováno:        ${updated}`)
    console.log(`   Přeskočeno (dry-run): ${skippedDryRun}`)
    console.log(`   Chyby:                ${errors}`)
    console.log('══════════════════════════════════════════\n')

    process.exit(errors > 0 ? 1 : 0)
  } finally {
    if (conn) {
      await conn.end()
    }
  }
}

run().catch((error) => {
  console.error('💥 Fatální chyba migrace článků:', error)
  process.exit(1)
})
