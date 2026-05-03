/**
 * ⚠️ DŮLEŽITÉ: Tento skript vyžaduje zafixovanou verzi @payloadcms/richtext-lexical (aktuálně 3.76.1).
 * Používá EXPERIMENTAL_TableFeature, jehož schéma se může v novějších verzích změnit a zneplatnit tuto migraci.
 * Před upgrady balíčků vždy ověřte kompatibilitu generovaných Lexical JSON uzlů.
 *
 * Migrační skript: MySQL DB (HTML text) → Payload CMS (Lexical JSON)
 *
 * Prerekvizity (nainstalujte před spuštěním):
 *   pnpm add -D mysql2
 *
 * Spuštění:
 *   pnpm migrate:pages -- --dry-run
 *   pnpm migrate:pages
 *   pnpm migrate:pages -- --limit=10
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { getPayload, type Payload } from 'payload'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
// @ts-ignore
import { JSDOM } from 'jsdom'
import configPromise from '../src/payload.config.js'
import { Page } from '../src/payload-types'

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
const OLD_TABLE = 'page' // Správný název tabulky
const COL_ID = 'id'
const COL_TITLE = 'title'
const COL_SLUG = 'unique_url' // v db to je unique_url
const COL_HTML = 'text'

// Base URL of the old CMS site — used to convert relative links to absolute
// so convertHTMLToLexical treats them as external links, not internal Payload document links.
const OLD_SITE_BASE_URL = process.env.OLD_SITE_BASE_URL || 'https://www.aracze.cz'

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

type OldRecord = {
  id: number
  title: string
  slug: string
  text: string
  [key: string]: unknown
}

const categoryMap: Record<string, string> = {
  PLACE_TO_VISIT: 'Místo k navštívení',
  TOURIST_POINT: 'Turistický cíl',
  DESTINATION_LIST: 'Místa',
  PRACTICAL_INFORMATION: 'Praktické informace',
  ENTRY_REQUIREMENTS: 'Vstupní podmínky',
  GETTING_THERE: 'Cesta',
  WEATHER: 'Počasí',
  TRANSPORT: 'Doprava',
  CURRENCY_AND_PRICES: 'Měna a ceny',
  HEALTH_AND_SAFETY: 'Zdraví a bezpečí',
  LANGUAGE_AND_CULTURE: 'Jazyk a kultura',
  FOOD_AND_DRINKS: 'Jídlo a pití',
  ACCOMMODATION: 'Ubytování',
  ARTICLE_LIST: 'Články',
  INSPIRATION: 'Články',
}

function shouldSkipRecord(record: OldRecord): boolean {
  const mappedCategory =
    categoryMap[String(record.page_category)] || 'Místo k navštívení'

  const normalizedTitle = String(record.title || '')
    .trim()
    .toLocaleLowerCase('cs')

  const skipByCategory = mappedCategory === 'Místa' || mappedCategory === 'Články'
  const skipByTitle = normalizedTitle === 'místa' || normalizedTitle === 'články'

  return skipByCategory || skipByTitle
}

type SourceLinkMeta = {
  href: string
  nofollow: boolean
}

function normalizeInternalPath(path: string): string {
  const normalized = path.trim().replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function buildInternalPagePathMap(pages: any[]): Map<string, number | string> {
  const map = new Map<string, number | string>()

  pages.forEach((page: any) => {
    const id = page?.id
    const fullSlug = typeof page?.fullSlug === 'string' ? normalizeInternalPath(page.fullSlug) : ''

    if (!id || !fullSlug) return
    map.set(fullSlug, id)
  })

  return map
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

function convertAraLinksToInternalLinks(
  lexicalData: any,
  internalPagePathMap: Map<string, number | string>,
): number {
  let converted = 0

  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return

    if (node.type === 'link' && node.fields && typeof node.fields === 'object') {
      const fields = node.fields as Record<string, unknown>
      const linkType = String(fields.linkType || '')
      const url = typeof fields.url === 'string' ? fields.url.trim() : ''

      if (linkType !== 'internal' && url.startsWith('https://ara.cz')) {
        try {
          const parsed = new URL(url)
          const targetPath = normalizeInternalPath(parsed.pathname)
          const targetPageId = internalPagePathMap.get(targetPath)

          if (targetPageId) {
            fields.linkType = 'internal'
            fields.doc = {
              relationTo: 'pages',
              value: targetPageId,
            }
            delete fields.url
            converted++
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
  return converted
}

async function fetchOldRecords(conn: mysql.Connection): Promise<OldRecord[]> {
  const limitClause = limit && Number.isFinite(limit) ? `LIMIT ${limit}` : ''
  const query = `
    SELECT 
      \`${COL_ID}\`    AS id,
      \`${COL_TITLE}\` AS title,
      \`${COL_SLUG}\`  AS slug,
      \`${COL_HTML}\`  AS text,
      \`zoom_level\`,
      \`google_map_search_phrase\`,
      \`lat\` AS latitude,
      \`lng\` AS longitude,
      \`page_category\`,
      \`parent_id\`,
      \`created_by_id\`,
      \`meta_description\`,
      \`meta_title\`,
      \`stop_place_to_visit_propagate_here\`,
      \`czech2nd_case\`,
      \`czech6th_case\`,
      \`timezone_name\`,
      \`currency_name\`,
      \`display_weather_overview\`,
      \`affiliate_second_item\`,
      \`affiliate_third_item\`,
      \`affiliate_fourth_item\`,
      \`affiliate_kiwi_fly_to\`,
      \`main_image_css\`,
      \`main_image_name\`
    FROM \`${OLD_TABLE}\`
    WHERE \`${COL_ID}\` = 845
    ORDER BY \`${COL_ID}\`
    ${limitClause}
  `
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(query)
  return rows as OldRecord[]
}

async function htmlToLexical(
  html: string,
  payload: Payload,
  mediaMap: {
    filename: Map<string, number | string>
    cloudinary: Map<string, number | string>
  },
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
      // Nesmime je rozbalit na plain text, jinak se ztrati v obsahu.
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

    const sourceLinks: SourceLinkMeta[] = Array.from(doc.querySelectorAll('a')).map((a: any) => ({
      href: (a.getAttribute('href') || '').trim(),
      nofollow: hasNoFollowRel(a.getAttribute('rel')),
    }))

    const blocks: any[] = []

    // ─────────────────────────────────────────────────────────────────────────────
    // EXTRAKCE SEZÓNNOSTI (KALENDÁŘ)
    // ─────────────────────────────────────────────────────────────────────────────
    const seasonalityContainer = doc.querySelector('.climate__months')
    const legendContainer = doc.querySelector('.climate-legend')

    if (seasonalityContainer) {
      const index = blocks.length
      const months: any[] = []

      const monthBlocks = seasonalityContainer.querySelectorAll('.climate-month-block')
      monthBlocks.forEach((mb: any, i: number) => {
        const segment = mb.querySelector('.month-block__segment')
        let status = 'off'
        if (segment) {
          if (segment.classList.contains('month-block__segment--green')) status = 'peak'
          else if (segment.classList.contains('month-block__segment--blue')) status = 'mid'
        }
        months.push({
          monthNumber: i + 1,
          status,
        })
      })

      // Validace délky pole pro Payload (minRows: 12, maxRows: 12)
      if (months.length > 12) {
        months.splice(12)
      } else {
        while (months.length < 12) {
          months.push({
            monthNumber: months.length + 1,
            status: 'off',
          })
        }
      }

      const legend: any[] = []
      if (legendContainer) {
        const labels = legendContainer.querySelectorAll('.climate-legend__label')
        labels.forEach((l: any) => {
          let status = 'off'
          if (l.classList.contains('climate-legend__label--high')) status = 'peak'
          else if (l.classList.contains('climate-legend__label--middle')) status = 'mid'

          // Ponecháme původní text včetně měsíců v závorce
          const labelText = (l.textContent || '').trim()
          legend.push({
            status,
            label: labelText,
          })
        })
      }

      // Hledáme titulek a ideální text (často bývají nad tím)
      const idealTextEl = Array.from(doc.querySelectorAll('p, div')).find((el: any) =>
        el.textContent?.includes('Ideální doba do'),
      ) as any

      let prefixText = ''
      let idealMonths = ''
      if (idealTextEl) {
        const text = (idealTextEl.textContent as string) || ''
        if (text.includes(':')) {
          const parts = text.split(':')
          prefixText = parts[0].trim() + ':'
          idealMonths = parts[1].trim()
        } else {
          prefixText = 'Ideální doba k návštěvě je:'
          idealMonths = text.replace('Ideální doba do Chorvatska je', '').trim()
        }
      }

      blocks.push({
        type: 'block',
        version: 2,
        format: '',
        fields: {
          blockType: 'seasonalityBlock',
          prefixText,
          idealMonthsText: idealMonths,
          months,
          legend,
        },
      })

      // Vytvoříme placeholder a nahradíme původní elementy
      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`
      seasonalityContainer.parentNode?.replaceChild(p, seasonalityContainer)
      legendContainer?.parentNode?.removeChild(legendContainer)
      if (idealTextEl) {
        const parent = idealTextEl.parentNode
        idealTextEl.parentNode?.removeChild(idealTextEl)
        // Pokud po smazání zůstal rodič (např. div) prázdný, smažeme ho taky
        if (parent && parent.childNodes.length === 0) {
          parent.parentNode?.removeChild(parent)
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // EXTRAKCE NICE TO KNOW (PRAKTICKÉ INFORMACE)
    // ─────────────────────────────────────────────────────────────────────────────
    const niceToKnowSection = doc.querySelector('.nice-to-know')

    if (niceToKnowSection) {
      const index = blocks.length
      const items: any[] = []

      const niceItems = niceToKnowSection.querySelectorAll('.nice-to-know-item')
      niceItems.forEach((item: any) => {
        let type = 'language'
        if (item.classList.contains('nice-to-know__item--electricity')) type = 'electricity'
        else if (item.classList.contains('nice-to-know__item--currency')) type = 'currency'
        else if (item.classList.contains('nice-to-know__item--weather')) type = 'weather'
        else if (item.classList.contains('nice-to-know__item--time')) type = 'time'
        else if (item.classList.contains('nice-to-know__item--language')) type = 'language'

        const body = item.querySelector('.nice-to-know-item__body')
        const titleEl = body?.querySelector('.nice-to-know-item__title')
        const title = (titleEl?.textContent || '').trim()

        // Získáme hodnotu - text ve spanu vedle titulku
        const bodySpans = body?.querySelectorAll('span') || []
        let value = ''
        bodySpans.forEach((s: any) => {
          if (
            !s.classList.contains('nice-to-know-item__title') &&
            !s.classList.contains('js-localTimeCard-offset')
          ) {
            const t = (s.textContent || '').trim()
            if (t && !value) value = t
          }
        })

        // Sekundární hodnota (elektřina: 230V, měna: Kuna)
        let secondaryValue = ''
        bodySpans.forEach((s: any) => {
          if (
            !s.classList.contains('nice-to-know-item__title') &&
            !s.classList.contains('js-localTimeCard-offset')
          ) {
            const t = (s.textContent || '').trim()
            if (t && t !== value) secondaryValue = t
          }
        })

        // Header text
        const header = item.querySelector('.nice-to-know-item__content__header')
        let headerText = ''
        let headerSubtext = ''

        if (type === 'language') {
          const bubble = item.querySelector('.language-bubble') || header
          if (bubble) {
            let textParts: string[] = []
            // Pokud je tam <a> tag, použijeme ho jako kontejner, jinak bublinu samotnou
            const container = bubble.querySelector('a') || bubble
            container.childNodes.forEach((node: any) => {
              if (node.nodeName === 'SPAN') return
              const txt = (node.textContent || '').trim()
              if (txt) textParts.push(txt)
            })
            headerText = textParts.join(' ').replace(/\s+/g, ' ')
            const subSpan = bubble.querySelector('span')
            headerSubtext = (subSpan?.textContent || '').trim()
            console.log(
              `    [DEBUG] Jazyk nalezen: text="${headerText}", subtext="${headerSubtext}"`,
            )
          }
        } else if (type === 'currency') {
          const foreignEl = header?.querySelector('.nice-to-know-item__content__header--foreign')
          headerText = (foreignEl?.textContent || '').trim().replace(/\s+/g, ' ')
        } else if (type === 'time') {
          const dayEl = header?.querySelector('.nice-to-know-item__day')
          const timeEl = header?.querySelector('.nice-to-know-item__time')
          headerText = (dayEl?.textContent || '').trim()
          headerSubtext = (timeEl?.textContent || '').trim()
        }

        // Timezone
        let timezone = ''
        if (type === 'time') {
          const tzEl = header?.querySelector('.js-localTimeCard')
          timezone = tzEl?.getAttribute('data-timezone') || ''
        }

        items.push({
          type,
          headerText,
          headerSubtext,
          title,
          value,
          secondaryValue,
          timezone,
        })
      })

      blocks.push({
        type: 'block',
        version: 2,
        format: '',
        fields: {
          blockType: 'niceToKnowBlock',
          items,
        },
      })

      const p = doc.createElement('p')
      p.textContent = `__PAYLOAD_BLOCK_${index}__`
      niceToKnowSection.parentNode?.replaceChild(p, niceToKnowSection)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // EXTRAKCE DENNÍCH NÁKLADŮ (MĚNA A CENY)
    // ─────────────────────────────────────────────────────────────────────────────
    const dailyCostsSection = doc.querySelector('.pi-budget')

    const buildDailyCostsColumns = (container: Element) => {
      const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim()
      const columnNodes = container.querySelectorAll('.pi-budget-container')
      const columns: any[] = []

      columnNodes.forEach((columnContainer: any, columnIndex: number) => {
        const titleEl = columnContainer.querySelector('.pi-budget-container__title')
        let tier = 'budget'
        if (titleEl?.classList.contains('pi-budget-container__title--midrange')) tier = 'midrange'
        else if (titleEl?.classList.contains('pi-budget-container__title--top')) tier = 'top'
        else if (columnIndex === 1) tier = 'midrange'
        else if (columnIndex === 2) tier = 'top'

        const rangeLabel = normalizeText(
          (columnContainer.querySelector('.pi-budget-container__range h5')?.textContent || '') as string,
        )
        const price = normalizeText(
          (columnContainer.querySelector('.pi-budget-container__price')?.textContent || '') as string,
        )

        const listItems = Array.from(
          columnContainer.querySelectorAll('.pi-budget-container__list__item, .pi-budget-container__list li'),
        )
          .map((item: any) => normalizeText((item.textContent || '') as string))
          .filter(Boolean)
          .map((text) => ({ text }))

        if (rangeLabel && price && columns.length < 3) {
          columns.push({ tier, rangeLabel, price, items: listItems })
        }
      })

      return columns
    }

    if (dailyCostsSection) {
      const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim()

      const index = blocks.length
      const headingEl = dailyCostsSection.querySelector('h2, h3, h4') as any
      const heading = normalizeText((headingEl?.textContent || 'Denní náklady') as string)
      const columns = buildDailyCostsColumns(dailyCostsSection)

      if (columns.length > 0) {
        blocks.push({
          type: 'block',
          version: 2,
          format: '',
          fields: {
            blockType: 'dailyCostsBlock',
            heading,
            columns,
          },
        })

        const placeholder = doc.createElement('p')
        placeholder.textContent = `__PAYLOAD_BLOCK_${index}__`

        if (headingEl?.parentNode) {
          headingEl.parentNode.insertBefore(placeholder, headingEl)
          headingEl.parentNode.removeChild(headingEl)
        } else if (dailyCostsSection.parentNode) {
          dailyCostsSection.parentNode.insertBefore(placeholder, dailyCostsSection)
        }

        const containersToRemove = Array.from(
          dailyCostsSection.querySelectorAll('.pi-budget-container'),
        )
        containersToRemove.forEach((node: any) => {
          node.parentNode?.removeChild(node)
        })

        // Pokud po vyjmuti dennich nakladu wrapper nic neobsahuje, odstranime ho.
        const hasMeaningfulContent = Array.from(dailyCostsSection.childNodes).some((node: any) => {
          if (node.nodeType === 3) {
            return (node.textContent || '').trim().length > 0
          }
          return true
        })
        if (!hasMeaningfulContent) {
          dailyCostsSection.parentNode?.removeChild(dailyCostsSection)
        }
      }
    } else {
      const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim()
      const headingCandidates = Array.from(doc.querySelectorAll('h2, h3, h4')) as any[]
      const headingEl = headingCandidates.find((el) =>
        /denn[ií]\s+n[áa]klady/i.test(normalizeText((el.textContent || '') as string)),
      )

      if (headingEl) {
        const index = blocks.length
        const heading = normalizeText((headingEl.textContent || 'Denní náklady') as string)
        const nodesToRemove: Element[] = [headingEl]
        const columns: any[] = []
        const isBudgetTierLabel = (value: string) =>
          /(levn[ée]|st[řr]edn[ěe]|luxusn[íi]).*cestov[aá]n[ií]/i.test(value)

        let cursor = headingEl.nextElementSibling as Element | null
        while (cursor) {
          const tag = cursor.tagName.toLowerCase()
          const text = normalizeText((cursor.textContent || '') as string)

          // Denni naklady maji jen 3 sloupce. Dalsi nadpis uz patri dalsi sekci.
          if (columns.length >= 3 && (tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'p')) {
            break
          }

          if (tag === 'h2' || tag === 'h3') {
            break
          }

          if ((tag === 'h4' || tag === 'h5' || tag === 'p') && isBudgetTierLabel(text)) {
            const tier =
              columns.length === 0 ? 'budget' : columns.length === 1 ? 'midrange' : 'top'
            const rangeLabel = text
            nodesToRemove.push(cursor)

            let price = ''
            const maybePrice = cursor.nextElementSibling
            if (maybePrice && maybePrice.tagName.toLowerCase() === 'p') {
              price = normalizeText((maybePrice.textContent || '') as string)
              nodesToRemove.push(maybePrice)
            }

            let items: { text: string }[] = []
            const maybeList = (maybePrice && maybePrice.nextElementSibling) || cursor.nextElementSibling
            if (maybeList && maybeList.tagName.toLowerCase() === 'ul') {
              items = Array.from(maybeList.querySelectorAll('li'))
                .map((li: any) => normalizeText((li.textContent || '') as string))
                .filter(Boolean)
                .map((text) => ({ text }))
              nodesToRemove.push(maybeList)
              cursor = maybeList.nextElementSibling as Element | null
            } else {
              cursor = cursor.nextElementSibling as Element | null
            }

            if (rangeLabel || price || items.length > 0) {
              columns.push({ tier, rangeLabel, price, items })
            }
            continue
          }

          // Narazili jsme na jinou obsahovou sekci (napr. Spropitne a smlouvani)
          if (tag === 'h4' || tag === 'h5') {
            break
          }

          if (tag === 'ul') {
            const items = Array.from(cursor.querySelectorAll('li'))
              .map((li: any) => normalizeText((li.textContent || '') as string))
              .filter(Boolean)
              .map((text) => ({ text }))

            if (columns.length > 0 && items.length > 0) {
              columns[columns.length - 1].items = items
              nodesToRemove.push(cursor)
            }
          }

          cursor = cursor.nextElementSibling as Element | null
        }

        if (columns.length > 0) {
          blocks.push({
            type: 'block',
            version: 2,
            format: '',
            fields: {
              blockType: 'dailyCostsBlock',
              heading,
              columns,
            },
          })

          const placeholder = doc.createElement('p')
          placeholder.textContent = `__PAYLOAD_BLOCK_${index}__`
          headingEl.parentNode?.insertBefore(placeholder, headingEl)
          nodesToRemove.forEach((node) => node.parentNode?.removeChild(node))
        }
      }
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

          const cellText = td.textContent?.trim() || ''
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
                children: [
                  {
                    type: 'text',
                    text: cellText,
                    format: 0,
                    style: '',
                    mode: 'normal',
                    version: 1,
                  },
                ],
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

    // 5. Oprava vnořených seznamů (přesunutí <ul> z prázdného <li> do předchozího <li>)
    const listItems = Array.from(doc.querySelectorAll('li'))
    listItems.forEach((li: any) => {
      const firstChild = li.firstElementChild
      if (firstChild && (firstChild.tagName === 'UL' || firstChild.tagName === 'OL')) {
        // Kontrola, zda li obsahuje POUZE ten seznam a žádný jiný vlastní text
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
      const alt = img.getAttribute('alt') || ''

      const filename = src.split('/').pop()?.split('?')[0] || ''
      const nameWithoutExt = filename.includes('.')
        ? filename.split('.').slice(0, -1).join('.')
        : filename

      let mediaId = null
      if (filename) {
        // Zkusíme najít podle filename, nebo podle cloudinaryPublicId (s i bez přípony)
        mediaId =
          mediaMap.filename.get(filename) ||
          mediaMap.cloudinary.get(nameWithoutExt) ||
          mediaMap.cloudinary.get(filename) ||
          null
      }

      const index = blocks.length
      if (mediaId) {
        blocks.push({
          type: 'block',
          fields: {
            blockType: 'contentImage',
            image: mediaId,
            caption: alt,
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
      if (img.parentNode) img.parentNode.replaceChild(p, img)
    }

    // Čištění prázdných odstavců před převodem
    doc.querySelectorAll('p').forEach((p: any) => {
      const text = p.textContent?.trim() || ''
      if (text === '' && p.children.length === 0) {
        p.parentNode?.removeChild(p)
      }
    })

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

        // Flattening: Pokud potomek je paragraph, který obsahuje jen JEDEN blok, vytáhneme ho ven (povýšíme ho).
        // To pomáhá čistotě stromu a řeší problémy s vnořením v seznamech/tabulkách.
        node.children = newChildren.flatMap((c: any) => {
          if (
            c.type === 'paragraph' &&
            c.children?.length === 1 &&
            (c.children[0].type === 'block' || c.children[0].type === 'upload')
          ) {
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

function emptyLexical(): object {
  return { root: { type: 'root', format: '', indent: 0, version: 1, children: [] } }
}

// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🚀 Migrace pages spuštěna${isDryRun ? ' (DRY RUN)' : ''}`)
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

    // ─────────────────────────────────────────────────────────────────────────────
    // PRE-FETCHING (OPTIMALIZACE)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('⏳ Načítám cache pro optimalizaci...')

    // 1. Načtení všech uživatelů
    const allUsers = await payload.find({
      collection: 'users',
      limit: 0,
      depth: 0,
      pagination: false,
    })
    const usersMap = new Map(
      allUsers.docs
        .filter((u: any) => u.legacyUserId != null)
        .map((u: any) => [Number(u.legacyUserId), u.id]),
    )

    // 2. Načtení všech médií
    const allMedia = await payload.find({
      collection: 'media',
      limit: 0,
      depth: 0,
      pagination: false,
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

    // 3. Načtení stávajících stránek (pro update a parent vztahy)
    const allPages = await payload.find({
      collection: 'pages',
      limit: 0,
      depth: 0,
      pagination: false,
    })
    const pagesMap = new Map(
      allPages.docs
        .filter((p: any) => p.legacyPageId != null)
        .map((p: any) => [Number(p.legacyPageId), { id: p.id, slug: p.slug }]),
    )
    const internalPagePathMap = buildInternalPagePathMap(allPages.docs)

    console.log(
      `✅ Cache připravena: ${usersMap.size} uživatelů, ${allMedia.docs.length} médií, ${pagesMap.size} stránek\n`,
    )

    let created = 0
    let updated = 0
    let skippedDryRun = 0
    let skippedByRule = 0
    let errors = 0

    for (const [index, record] of records.entries()) {
      const progress = `[${index + 1}/${records.length}]`

      if (shouldSkipRecord(record)) {
        console.log(
          `${progress} ⏭️  Přeskočeno (Místa/Články): "${record.title}" (legacy id: ${record.id})`,
        )
        skippedByRule++
        continue
      }

      // Zkontroluj zda záznam v Payload už existuje podle legacyPageId (z cache)
      const existingInfo = pagesMap.get(record.id)
      const isUpdate = !!existingInfo

      if (isDryRun) {
        const action = isUpdate ? 'UPDATE' : 'CREATE'
        console.log(`${progress} 📋 DRY RUN [${action}] "${record.title}" (slug: ${record.slug})`)
        skippedDryRun++
        continue
      }

      try {
        // Zpracování vztahu uživatele (createdBy) přes legacyUserId (z cache)
        let createdByUserId = undefined
        if (record.created_by_id) {
          const legacyIdNum = Number(record.created_by_id)
          createdByUserId = usersMap.get(legacyIdNum)
          if (!createdByUserId) {
            console.warn(
              `   [DEBUG] Uživatel s legacy ID ${legacyIdNum} NEBYL NALEZEN v Payload CMS!`,
            )
          }
        }

        // Zpracování nadřazené stránky (parent) podle parent_id (z cache)
        let parentId = undefined
        let parentSlug: string | null | undefined = undefined
        if (record.parent_id) {
          const legacyParentIdNum = Number(record.parent_id)
          const parentInfo = pagesMap.get(legacyParentIdNum)
          if (parentInfo) {
            parentId = parentInfo.id
            parentSlug = parentInfo.slug
          } else {
            console.warn(
              `   [DEBUG] Nadřazená stránka s legacy ID ${legacyParentIdNum} NEBYLA NALEZENA v Payload CMS!`,
            )
          }
        }

        // Zpracování vztahu obrázku (featuredImage) podle filename nebo cloudinaryPublicId (z cache)
        let featuredImageId = undefined
        if (record.main_image_name) {
          const imageName = String(record.main_image_name)
          const imageNameWithoutExt = imageName.includes('.')
            ? imageName.split('.').slice(0, -1).join('.')
            : imageName

          featuredImageId =
            mediaMap.filename.get(imageName) ||
            mediaMap.cloudinary.get(imageNameWithoutExt) ||
            mediaMap.cloudinary.get(imageName)

          if (!featuredImageId) {
            console.warn(
              `   [DEBUG] Obrázek ${record.main_image_name} NEBYL NALEZEN v Payload CMS!`,
            )
          }
        }

        // Převod HTML → Lexical JSON (s využitím mediaMap pro inline obrázky)
        const lexicalText = await htmlToLexical(record.text || '', payload, mediaMap)
        const convertedInternalLinks = convertAraLinksToInternalLinks(
          lexicalText,
          internalPagePathMap,
        )
        if (convertedInternalLinks > 0) {
          console.log(`   [DEBUG] Internal links převedeno: ${convertedInternalLinks}`)
        }

        // Příprava slugu (vzetí části za posledním lomítkem nebo očištění od prefixu rodiče)
        let slug = String(record.slug || '').substring(0, 255)

        if (slug.includes('/')) {
          const oldSlug = slug
          slug = slug.split('/').pop() || slug
          console.log(`   [DEBUG] Slug zkrácen (podle lomítka): ${oldSlug} -> ${slug}`)
        }

        if (parentSlug && slug.startsWith(`${parentSlug}-`)) {
          const oldSlug = slug
          slug = slug.replace(`${parentSlug}-`, '')
          console.log(`   [DEBUG] Slug očištěn (podle rodiče): ${oldSlug} -> ${slug}`)
        }

        const pageData: any = {
          legacyPageId: record.id,
          title: String(record.title || '').substring(0, 255),
          slug: slug,
          text: lexicalText,
          category: (categoryMap[String(record.page_category)] ||
            'Místo k navštívení') as Page['category'],
          createdBy: createdByUserId,
          parent: parentId,
          includeInChildUrlPaths: record.stop_place_to_visit_propagate_here !== 0,
          detail: {
            googleMapsAddress: String(record.google_map_search_phrase || ''),
            latitude: record.latitude ? String(record.latitude) : undefined,
            longitude: record.longitude ? String(record.longitude) : undefined,
            googleMapsZoom: record.zoom_level || 10,
            locative: String(record.czech6th_case || ''),
            genitive: String(record.czech2nd_case || ''),
            timezone: String(record.timezone_name || ''),
            currencyCode: String(record.currency_name || ''),
            showWeather: Boolean(record.display_weather_overview === 1),
          },
          meta: {
            title: String(record.meta_title || ''),
            description: String(record.meta_description || ''),
          },
          affiliate: {
            toursUrl: String(record.affiliate_second_item || ''),
            accommodationUrl: String(record.affiliate_third_item || ''),
            carRentalUrl: String(record.affiliate_fourth_item || ''),
            kiwiIataCode: String(record.affiliate_kiwi_fly_to || ''),
          },
          featuredImage: {
            image: featuredImageId,
            featureImageStyleCss: String(record.main_image_css || ''),
          },
        }

        if (isUpdate && existingInfo) {
          await payload.update({
            collection: 'pages',
            id: existingInfo.id,
            data: pageData,
            draft: false,
            overrideAccess: true,
          })
          console.log(`${progress} ✅ Aktualizováno: "${record.title}"`)
          updated++
        } else {
          await payload.create({
            collection: 'pages',
            data: pageData,
            draft: false,
            overrideAccess: true,
          })
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
    console.log('📊 Výsledky migrace pages:')
    console.log(`   Vytvořeno:            ${created}`)
    console.log(`   Aktualizováno:        ${updated}`)
    console.log(`   Přeskočeno (dry-run): ${skippedDryRun}`)
    console.log(`   Přeskočeno (pravidlo): ${skippedByRule}`)
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
  console.error('💥 Fatální chyba migrace pages:', error)
  process.exit(1)
})
