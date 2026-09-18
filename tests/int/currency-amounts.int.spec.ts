import { describe, it, expect } from 'vitest'

import {
  annotateAmountsHtml,
  formatCzk,
  formatRateLine,
  mayContainAmounts,
  replaceLegacyRateLine,
  resolveCurrency,
  roundCzk,
  type ExchangeRates,
} from '@/lib/currency-amounts'
import { parseCnbRates } from '@/lib/exchange-rate'
import { richTextToHtml } from '@/lib/rich-text-html'

const NB = ' '
const rates: ExchangeRates = {
  EUR: 24.31,
  USD: 21.2,
  GBP: 28.3,
  THB: 0.64,
  AUD: 15.1,
  JPY: 0.1345,
  IDR: 0.00119,
}

function czk(text: string) {
  return `<span class="amount-czk">(≈${NB}${text})</span>`
}

describe('rozpoznání měny', () => {
  it('kódy, symboly a české tvary', () => {
    expect(resolveCurrency('EUR')).toBe('EUR')
    expect(resolveCurrency('€')).toBe('EUR')
    expect(resolveCurrency('eura')).toBe('EUR')
    expect(resolveCurrency('EURO')).toBe('EUR')
    expect(resolveCurrency('bahtů')).toBe('THB')
    expect(resolveCurrency('liber')).toBe('GBP')
    expect(resolveCurrency('$')).toBe('USD')
  })
  it('víceznačné rodiny rozhoduje měna země stránky', () => {
    expect(resolveCurrency('dolarů', 'AUD')).toBe('AUD')
    expect(resolveCurrency('dolarů', 'THB')).toBe('USD')
    expect(resolveCurrency('$', 'MXN')).toBe('MXN')
    expect(resolveCurrency('rupií', 'LKR')).toBe('LKR')
    expect(resolveCurrency('pesos')).toBeNull() // bez země není jasné které
    expect(resolveCurrency('pesos', 'ARS')).toBe('ARS')
  })
  it('koruny a cizí slova nejsou měna', () => {
    expect(resolveCurrency('CZK')).toBeNull()
    expect(resolveCurrency('Kč')).toBeNull()
    expect(resolveCurrency('korun')).toBeNull()
    expect(resolveCurrency('jen')).toBeNull()
    expect(resolveCurrency('km')).toBeNull()
    expect(resolveCurrency('ABC')).toBeNull()
  })
})

describe('zaokrouhlení a zápis korun', () => {
  it('krok podle velikosti částky', () => {
    expect(roundCzk(48.62)).toBe(50)
    expect(roundCzk(243.08)).toBe(240)
    expect(roundCzk(2917)).toBe(2900)
    expect(roundCzk(20640)).toBe(21000)
    expect(roundCzk(7.2)).toBe(7)
    expect(roundCzk(0.3)).toBeNull()
  })
  it('tisíce mezerou, jednotka pohromadě', () => {
    expect(formatCzk(2900)).toBe(`2${NB}900${NB}Kč`)
    expect(formatCzk(50)).toBe(`50${NB}Kč`)
    expect(formatCzk(1250000)).toBe(`1${NB}250${NB}000${NB}Kč`)
  })
  it('řádek kurzu u drobných měn po stovkách a tisících', () => {
    expect(formatRateLine('EUR', 24.308)).toBe(`1${NB}EUR = 24,31${NB}Kč`)
    expect(formatRateLine('JPY', 0.1345)).toBe(`100${NB}JPY = 13,45${NB}Kč`)
    expect(formatRateLine('IDR', 0.00119)).toBe(`1${NB}000${NB}IDR = 1,19${NB}Kč`)
  })
})

describe('přepočet částek v textu', () => {
  it('doplní koruny za částku a nechá původní zápis', () => {
    const out = annotateAmountsHtml('vyjít s ca. 120 EUR na týden', rates, 'EUR')
    expect(out).toBe(
      `vyjít s ca. <span class="amount" title="Kurz 1${NB}EUR = 24,31${NB}Kč">120${NB}EUR${NB}${czk(`2${NB}900${NB}Kč`)}</span> na týden`,
    )
  })
  it('české tvary slov, desetinná čárka a tisícová mezera', () => {
    expect(annotateAmountsHtml('Pivo stojí 2 eura.', rates, 'EUR')).toContain(
      `2${NB}eura${NB}${czk(`50${NB}Kč`)}`,
    )
    expect(annotateAmountsHtml('od 2,5 eura', rates, 'EUR')).toContain(czk(`60${NB}Kč`))
    expect(annotateAmountsHtml('kolem 1 000 USD', rates, 'EUR')).toContain(
      `1${NB}000${NB}USD${NB}${czk(`21${NB}000${NB}Kč`)}`,
    )
    expect(annotateAmountsHtml('cca 1.500 EUR', rates)).toContain(czk(`36${NB}000${NB}Kč`))
  })
  it('symbol před i za číslem', () => {
    expect(annotateAmountsHtml('vstup $20', rates)).toContain(`$${NB}20${NB}${czk(`420${NB}Kč`)}`)
    expect(annotateAmountsHtml('vstup 20$', rates)).toContain(`20$${NB}${czk(`420${NB}Kč`)}`)
    expect(annotateAmountsHtml('vstup 5€', rates)).toContain(`5€${NB}${czk(`120${NB}Kč`)}`)
  })
  it('dolar podle země stránky', () => {
    expect(annotateAmountsHtml('vstup 20 dolarů', rates, 'AUD')).toContain(
      `title="Kurz 1${NB}AUD = 15,10${NB}Kč"`,
    )
    expect(annotateAmountsHtml('vstup 20 dolarů', rates, 'THB')).toContain('Kurz 1 USD')
  })
  it('nesahá na koruny, roky, cizí slova a částky bez kurzu', () => {
    expect(annotateAmountsHtml('letenka od 7000 Kč', rates)).toBe('letenka od 7000 Kč')
    expect(annotateAmountsHtml('slevu 500 korun', rates)).toBe('slevu 500 korun')
    expect(annotateAmountsHtml('v roce 2002 euro nahradilo drachmu', rates)).toBe(
      'v roce 2002 euro nahradilo drachmu',
    )
    expect(annotateAmountsHtml('ujdete 10 km za 3 dny', rates)).toBe('ujdete 10 km za 3 dny')
    expect(annotateAmountsHtml('ne jen 5 jen', rates)).toBe('ne jen 5 jen')
    expect(annotateAmountsHtml('50 EGP za vstup', rates, 'EGP')).toBe('50 EGP za vstup')
    expect(annotateAmountsHtml('1 baht', { THB: 0.3 })).toBe('1 baht') // pod půl koruny
    expect(annotateAmountsHtml('120 EUR', null)).toBe('120 EUR')
    expect(annotateAmountsHtml('1.5 eur (anglický zápis)', rates)).toBe('1.5 eur (anglický zápis)')
  })
  it('řádek kurzu z migrace neanotuje', () => {
    expect(annotateAmountsHtml('1 EUR = 1 CZK', rates, 'EUR')).toBe('1 EUR = 1 CZK')
  })
})

describe('řádek „aktuální kurz“ z migrace', () => {
  const p = 'Měna: <strong>Euro (€)</strong> a aktuální kurz: <strong>1 EUR = 1 CZK</strong>'
  it('nahradí živým kurzem', () => {
    expect(replaceLegacyRateLine(p, rates, 'EUR')).toBe(
      `Měna: <strong>Euro (€)</strong> a aktuální kurz: <strong>1${NB}EUR = 24,31${NB}Kč</strong>`,
    )
    expect(replaceLegacyRateLine('kurz 1 EUR = 26.33 CZK.', rates, 'EUR')).toBe(
      `kurz 1${NB}EUR = 24,31${NB}Kč.`,
    )
  })
  it('bez kurzu nebo s cizím kódem dovětek vypustí', () => {
    expect(replaceLegacyRateLine(p, null, 'EUR')).toBe('Měna: <strong>Euro (€)</strong>')
    expect(replaceLegacyRateLine(p.replace(/EUR/g, 'EGP'), rates, 'EGP')).toBe(
      'Měna: <strong>Egyptská libra (€)</strong>'.replace('Egyptská libra', 'Euro'),
    )
    expect(replaceLegacyRateLine(p, rates, 'BAM')).toBe('Měna: <strong>Euro (€)</strong>')
  })
  it('obyčejný text nechá být', () => {
    expect(replaceLegacyRateLine('<strong>Ceny</strong> jsou nízké', rates, 'EUR')).toBe(
      '<strong>Ceny</strong> jsou nízké',
    )
  })
})

describe('předběžná kontrola textu', () => {
  it('pozná kód, symbol i slovo, jinak false', () => {
    const doc = (text: string) => ({
      root: { children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] },
    })
    expect(mayContainAmounts(doc('okolo 10 eur na deset dní'))).toBe(true)
    expect(mayContainAmounts(doc('kurz: 1 EUR = 1 CZK'))).toBe(true)
    expect(mayContainAmounts(doc('vstup 5€'))).toBe(true)
    expect(mayContainAmounts(doc('letenka od 7000 Kč, cesta trvá 3 dny'))).toBe(false)
    expect(mayContainAmounts(null)).toBe(false)
  })
})

describe('v rich textu', () => {
  const text = (t: string, format = 0) => ({ type: 'text', text: t, format })
  const doc = (children: unknown[]) => ({ root: { type: 'root', children } })

  it('odstavec s řádkem kurzu i částkou', () => {
    const html = richTextToHtml(
      doc([
        {
          type: 'paragraph',
          children: [
            text('Měna: '),
            text('Euro (€)', 1),
            text(' a aktuální kurz: '),
            text('1 EUR = 1 CZK', 1),
          ],
        },
        { type: 'paragraph', children: [text('Vyjdete s 120 EUR na týden.')] },
      ]),
      { currencyCode: 'EUR', exchangeRates: rates },
    )
    // DOMPurify nezlomitelné mezery serializuje jako &nbsp;
    expect(html).toContain('a aktuální kurz: <strong>1&nbsp;EUR = 24,31&nbsp;Kč</strong></p>')
    expect(html).toContain('120&nbsp;EUR&nbsp;<span class="amount-czk">')
    expect(html).toContain('title="Kurz 1&nbsp;EUR = 24,31&nbsp;Kč"')
  })

  it('bez kurzů text nemění, v nadpisu a odkazu nepřepočítává', () => {
    const plain = richTextToHtml(
      doc([{ type: 'paragraph', children: [text('Vyjdete s 120 EUR na týden.')] }]),
      { currencyCode: 'EUR' },
    )
    expect(plain).toBe('<p>Vyjdete s 120 EUR na týden.</p>')

    const html = richTextToHtml(
      doc([
        { type: 'heading', tag: 'h2', children: [text('Rozpočet 120 EUR')] },
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              fields: { url: 'https://example.com' },
              children: [text('vstup 20 EUR')],
            },
          ],
        },
      ]),
      { currencyCode: 'EUR', exchangeRates: rates },
    )
    expect(html).not.toContain('amount-czk')
    expect(html).toContain('<h2 id="rozpočet-120-eur">Rozpočet 120 EUR</h2>')
  })
})

describe('kurzovní lístek ČNB', () => {
  it('čte kurz za množství jednotek a desetinnou čárku', () => {
    const txt = [
      '18.09.2026 #181',
      'země|měna|množství|kód|kurz',
      'EMU|euro|1|EUR|24,340',
      'Japonsko|jen|100|JPY|13,450',
      'Indonésie|rupie|1000|IDR|1,190',
      'rozbitý řádek bez sloupců',
      'MMF|SDR|1|XDR|0',
    ].join('\n')
    const table = parseCnbRates(txt)
    expect(Object.keys(table ?? {}).sort()).toEqual(['EUR', 'IDR', 'JPY'])
    expect(table?.EUR).toBeCloseTo(24.34, 6)
    expect(table?.JPY).toBeCloseTo(0.1345, 6) // dělení množstvím (plovoucí čárka)
    expect(table?.IDR).toBeCloseTo(0.00119, 8)
    expect(parseCnbRates('')).toBeNull()
    expect(parseCnbRates('<html>chyba</html>')).toBeNull()
  })
})
