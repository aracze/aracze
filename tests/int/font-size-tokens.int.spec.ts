import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FONT_SIZE_TOKENS, cn } from '@/lib/utils'

// Stupnice velikostí písma žije na dvou místech: v `@theme` (globals.css) a
// v seznamu pro tailwind-merge (utils.ts). Když se rozejdou, nový token se
// při slučování tříd tiše zahodí a velikost spadne na 16 px — tsc ani lint
// to nechytí. Tenhle test z toho dělá červený CI.
const css = readFileSync(new URL('../../src/app/(frontend)/globals.css', import.meta.url), 'utf8')
const themeTokens = [...css.matchAll(/^\s*--text-([a-z][a-z0-9-]*):/gm)]
  .map((m) => m[1])
  .filter((name) => !name.includes('--')) // vynechá případné --text-x--line-height

describe('stupnice velikostí písma (@theme × tailwind-merge)', () => {
  it('seznam v utils.ts sedí s tokeny --text-* v globals.css', () => {
    expect([...themeTokens].sort()).toEqual([...FONT_SIZE_TOKENS].sort())
  })

  it('token velikosti přežije vedle barvy textu (v obou pořadích)', () => {
    for (const token of FONT_SIZE_TOKENS) {
      expect(cn(`text-${token}`, 'text-ink-3')).toBe(`text-${token} text-ink-3`)
      expect(cn('text-brand-deep', `text-${token}`)).toBe(`text-brand-deep text-${token}`)
    }
  })

  it('dva stupně se přebíjejí — poslední vyhrává, i vůči výchozím velikostem', () => {
    expect(cn('text-label', 'text-lead')).toBe('text-lead')
    expect(cn('text-sm', 'text-label')).toBe('text-label')
    expect(cn('text-label', 'text-[14px]')).toBe('text-[14px]')
  })

  it('token nemaže řádkování — sám žádné nenastavuje', () => {
    expect(cn('leading-snug', 'text-small')).toBe('leading-snug text-small')
  })
})
