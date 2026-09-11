import { describe, it, expect } from 'vitest'

import { outletTypesToShow, parseOutletTypes, richTextToHtml } from '@/lib/rich-text-html'

function niceToKnowDoc(title: string) {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'block',
          fields: {
            blockType: 'niceToKnowBlock',
            items: [{ type: 'electricity', title, value: '230V/50hz' }],
          },
        },
      ],
    },
  }
}

describe('zásuvky v kartě Nice-to-know', () => {
  it('čte typy z titulku v pořadí a bez duplicit', () => {
    expect(parseOutletTypes('Zásuvka typu C & F')).toEqual(['C', 'F'])
    expect(parseOutletTypes('Zásuvka typu C, F, E, K')).toEqual(['C', 'F', 'E', 'K'])
    expect(parseOutletTypes('Zásuvka typu A, C & I')).toEqual(['A', 'C', 'I'])
    expect(parseOutletTypes('Zásuvka typu G')).toEqual(['G'])
    expect(parseOutletTypes('Zásuvka typu C a C')).toEqual(['C'])
  })

  it('nebere velká písmena ze slov ani ze „Zásuvka“', () => {
    expect(parseOutletTypes('Zásuvka typu USA')).toEqual([])
    expect(parseOutletTypes('Zásuvka')).toEqual([])
    expect(parseOutletTypes('')).toEqual([])
  })

  it('do dvou typů ukáže oba, od tří vypustí typy, jejichž zástrčka pasuje do zobrazené zásuvky', () => {
    expect(outletTypesToShow(['C', 'F'])).toEqual(['C', 'F'])
    expect(outletTypesToShow(['A', 'B'])).toEqual(['A', 'B'])
    expect(outletTypesToShow(['C', 'E', 'F', 'K'])).toEqual(['E', 'F', 'K'])
    expect(outletTypesToShow(['C', 'F', 'L'])).toEqual(['F', 'L'])
    expect(outletTypesToShow(['A', 'B', 'C'])).toEqual(['B', 'C'])
    expect(outletTypesToShow(['A', 'C', 'I'])).toEqual(['A', 'C', 'I'])
    const html = richTextToHtml(niceToKnowDoc('Zásuvka typu C, F & L'))
    expect(html).toContain('TypeF.svg')
    expect(html).toContain('TypeL.svg')
    expect(html).not.toContain('TypeC.svg')
  })

  it('skládá kaskádu ikon: první typ vpředu, zadní v DOMu dřív, pro čtečky dekorace', () => {
    const html = richTextToHtml(niceToKnowDoc('Zásuvka typu C & J'))
    expect(html).toContain('class="outlet-icons" aria-hidden="true"')
    const j = html.indexOf('/assets/outlets/TypeJ.svg')
    const c = html.indexOf('/assets/outlets/TypeC.svg')
    expect(j).toBeGreaterThan(-1)
    expect(c).toBeGreaterThan(j)
    // sanitizace musí zachovat pozice (style) — jinak by se ikony naskládaly na sebe
    const back = html.match(/TypeJ\.svg"[^>]*style="[^"]*left:([\d.]+)px;bottom:([\d.]+)px"/)
    expect(back).not.toBeNull()
    expect(Number(back![1])).toBeGreaterThan(0)
    expect(Number(back![2])).toBeGreaterThan(0)
    expect(html).toMatch(/TypeC\.svg"[^>]*style="[^"]*left:0px;bottom:0px"/)
  })

  it('jeden typ = jedna ikona 60 px, neznámý typ se přeskočí, bez typu bez ikony', () => {
    expect(richTextToHtml(niceToKnowDoc('Zásuvka typu G'))).toMatch(
      /TypeG\.svg"[^>]*style="width:60px;height:60px/,
    )
    const withUnknown = richTextToHtml(niceToKnowDoc('Zásuvka typu C & M'))
    expect(withUnknown).toContain('TypeC.svg')
    expect(withUnknown).not.toContain('TypeM.svg')
    const bezTypu = richTextToHtml(niceToKnowDoc('Elektřina'))
    expect(bezTypu).not.toContain('outlet-icons')
    // prázdná hlavička zůstává jako rozpěrka, aby karta nevyskočila nad sousedy
    expect(bezTypu).toContain('<div class="nice-to-know-item__content__header"></div>')
  })
})
