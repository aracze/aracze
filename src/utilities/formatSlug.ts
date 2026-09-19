import type { FieldHook } from 'payload'

/**
 * Písmena, která Unicode NFD nerozloží na základ + diakritiku, takže by je
 * prosté odstranění kombinujících znaků smazalo celé („Malmö" → „malm",
 * „Þjóðmenningarhúsið" → „jomenningarhusi" — přesně tak vznikly slugy na
 * starém webu). Přepis je ten, který se pro latinku běžně používá v adresách.
 */
const TRANSLITERATION: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  đ: 'd',
  ı: 'i',
  ß: 'ss',
  œ: 'oe',
  ħ: 'h',
  ŧ: 't',
  ŋ: 'n',
}

// Třída znaků odvozená z mapy, aby nové písmeno stačilo přidat na jedno místo.
const NON_DECOMPOSABLE = new RegExp(`[${Object.keys(TRANSLITERATION).join('')}]`, 'g')

/**
 * Slug z názvu: bez diakritiky, malá písmena, slova oddělená pomlčkou.
 * Apostrofy a typografické uvozovky se vypouštějí, ne nahrazují pomlčkou
 * („Fisherman's Wharf" → `fishermans-wharf`, ne `fisherman-s-wharf`) —
 * odpovídá to adresám zděděným ze starého webu i běžné konvenci.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(NON_DECOMPOSABLE, (ch) => TRANSLITERATION[ch])
    .replace(/['’‘´`]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const formatSlug =
  (fallback: string): FieldHook =>
  ({ value, data, operation }) => {
    if (operation === 'create' || !value) {
      const fallbackData = data?.[fallback]

      if (fallbackData && typeof fallbackData === 'string') {
        return slugify(fallbackData)
      }
    }

    if (typeof value === 'string') {
      return slugify(value)
    }

    return value
  }
