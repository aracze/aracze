import { describe, it, expect } from 'vitest'

import {
  annotateAmountsHtml,
  formatCzk,
  formatRateLine,
  mayContainAmounts,
  rateTip,
  replaceLegacyRateLine,
  resolveCurrency,
  roundCzk,
  type ExchangeRates,
} from '@/lib/currency-amounts'
import { formatRateDate, mergeRateSheets, parseCnbRates } from '@/lib/exchange-rate'
import { richTextToHtml } from '@/lib/rich-text-html'

const NB = ' '
const D = '18. 9. 2026'
const table: ExchangeRates = {
  rates: {
    EUR: 24.31,
    USD: 21.2,
    GBP: 28.3,
    THB: 0.64,
    AUD: 15.1,
    JPY: 0.1345,
    IDR: 0.00119,
    EGP: 0.41,
  },
  dates: { EUR: D, USD: D, GBP: D, THB: D, AUD: D, JPY: D, IDR: D, EGP: '31. 8. 2026' },
  source: 'ČNB',
}

function czk(text: string) {
  return `<span class="amount-czk">(≈${NB}${text})</span>`
}
function tip(text: string) {
  return `<span class="amount" tabindex="0" data-tip="${text}">`
}
const eurTip = tip(`Kurz ČNB 1${NB}EUR = 24,31${NB}Kč (${D})`)

describe('rozpoznání měny', () => {
  it('kódy, symboly a české tvary', () => {
    expect(resolveCurrency('EUR')).toBe('EUR')
    expect(resolveCurrency('€')).toBe('EUR')
    expect(resolveCurrency('eura')).toBe('EUR')
    expect(resolveCurrency('EURO')).toBe('EUR')
    expect(resolveCurrency('bahtů')).toBe('THB')
    expect(resolveCurrency('liber')).toBe('GBP')
    expect(resolveCurrency('$')).toBe('USD')
    expect(resolveCurrency('E£')).toBe('EGP')
    expect(resolveCurrency('S/')).toBe('PEN')
    expect(resolveCurrency('Rp')).toBe('IDR')
  })
  it('víceznačné rodiny rozhoduje měna země stránky', () => {
    expect(resolveCurrency('dolarů', 'AUD')).toBe('AUD')
    expect(resolveCurrency('dolarů', 'THB')).toBe('USD')
    expect(resolveCurrency('$', 'MXN')).toBe('MXN')
    expect(resolveCurrency('rupií', 'LKR')).toBe('LKR')
    expect(resolveCurrency('pesos')).toBeNull() // bez země není jasné které
    expect(resolveCurrency('pesos', 'ARS')).toBe('ARS')
    expect(resolveCurrency('kr')).toBeNull()
    expect(resolveCurrency('kr', 'NOK')).toBe('NOK')
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
  it('bublina nese zdroj, kurz a datum měny', () => {
    expect(rateTip('EUR', table)).toBe(`Kurz ČNB 1${NB}EUR = 24,31${NB}Kč (${D})`)
    expect(rateTip('EGP', table)).toBe(`Kurz ČNB 100${NB}EGP = 41,00${NB}Kč (31. 8. 2026)`)
    expect(rateTip('EUR', { ...table, dates: {} })).toBe(`Kurz ČNB 1${NB}EUR = 24,31${NB}Kč`)
  })
})

describe('přepočet částek v textu', () => {
  it('doplní koruny za částku a nechá původní zápis', () => {
    const out = annotateAmountsHtml('vyjít s ca. 120 EUR na týden', table, 'EUR')
    expect(out).toBe(
      `vyjít s ca. ${eurTip}120${NB}EUR${NB}${czk(`2${NB}900${NB}Kč`)}</span> na týden`,
    )
  })
  it('české tvary slov, desetinná čárka a tisícová mezera', () => {
    expect(annotateAmountsHtml('Pivo stojí 2 eura.', table, 'EUR')).toContain(
      `2${NB}eura${NB}${czk(`50${NB}Kč`)}`,
    )
    expect(annotateAmountsHtml('od 2,5 eura', table, 'EUR')).toContain(czk(`60${NB}Kč`))
    expect(annotateAmountsHtml('kolem 1 000 USD', table, 'EUR')).toContain(
      `1${NB}000${NB}USD${NB}${czk(`21${NB}000${NB}Kč`)}`,
    )
    expect(annotateAmountsHtml('cca 1.500 EUR', table)).toContain(czk(`36${NB}000${NB}Kč`))
  })
  it('symbol před i za číslem, včetně víceznakových (E£, S/, Rp)', () => {
    expect(annotateAmountsHtml('vstup $20', table)).toContain(`$${NB}20${NB}${czk(`420${NB}Kč`)}`)
    expect(annotateAmountsHtml('vstup 20$', table)).toContain(`20$${NB}${czk(`420${NB}Kč`)}`)
    expect(annotateAmountsHtml('vstup 5€', table)).toContain(`5€${NB}${czk(`120${NB}Kč`)}`)
    expect(annotateAmountsHtml('omezen na E£ 1000. Import', table, 'EGP')).toContain(
      `E£${NB}1000${NB}${czk(`410${NB}Kč`)}</span>. Import`,
    )
    expect(annotateAmountsHtml('stojí 1000 E£', table, 'EGP')).toContain(
      `1000${NB}E£${NB}${czk(`410${NB}Kč`)}`,
    )
    expect(annotateAmountsHtml('vstup Rp 10.000', table)).toContain(
      `Rp${NB}10.000${NB}${czk(`10${NB}Kč`)}`, // 11,9 Kč → krok 5 Kč
    )
  })
  it('dolar podle země stránky', () => {
    expect(annotateAmountsHtml('vstup 20 dolarů', table, 'AUD')).toContain(
      `data-tip="Kurz ČNB 1${NB}AUD = 15,10${NB}Kč (${D})"`,
    )
    expect(annotateAmountsHtml('vstup 20 dolarů', table, 'THB')).toContain(`Kurz ČNB 1${NB}USD`)
  })
  it('nesahá na koruny, roky, cizí slova a částky bez kurzu', () => {
    expect(annotateAmountsHtml('letenka od 7000 Kč', table)).toBe('letenka od 7000 Kč')
    expect(annotateAmountsHtml('slevu 500 korun', table)).toBe('slevu 500 korun')
    expect(annotateAmountsHtml('v roce 2002 euro nahradilo drachmu', table)).toBe(
      'v roce 2002 euro nahradilo drachmu',
    )
    expect(annotateAmountsHtml('ujdete 10 km za 3 dny', table)).toBe('ujdete 10 km za 3 dny')
    expect(annotateAmountsHtml('ne jen 5 jen', table)).toBe('ne jen 5 jen')
    expect(annotateAmountsHtml('50 MAD za vstup', table, 'MAD')).toBe('50 MAD za vstup') // bez kurzu
    expect(annotateAmountsHtml('1 baht', { ...table, rates: { THB: 0.3 } })).toBe('1 baht') // pod půl koruny
    expect(annotateAmountsHtml('120 EUR', null)).toBe('120 EUR')
    expect(annotateAmountsHtml('1.5 eur (anglický zápis)', table)).toBe('1.5 eur (anglický zápis)')
  })
  it('řádek kurzu z migrace neanotuje', () => {
    expect(annotateAmountsHtml('1 EUR = 1 CZK', table, 'EUR')).toBe('1 EUR = 1 CZK')
  })
})

describe('řádek „aktuální kurz“ z migrace', () => {
  const p = 'Měna: <strong>Euro (€)</strong> a aktuální kurz: <strong>1 EUR = 1 CZK</strong>'
  const live = `${tip(`Kurz ČNB z ${D}`)}1${NB}EUR = 24,31${NB}Kč</span>`
  it('nahradí živým kurzem s bublinou', () => {
    expect(replaceLegacyRateLine(p, table, 'EUR')).toBe(
      `Měna: <strong>Euro (€)</strong> a aktuální kurz: <strong>${live}</strong>`,
    )
    expect(replaceLegacyRateLine('kurz 1 EUR = 26.33 CZK.', table, 'EUR')).toBe(`kurz ${live}.`)
  })
  it('bez kurzu nebo s cizím kódem dovětek vypustí', () => {
    expect(replaceLegacyRateLine(p, null, 'EUR')).toBe('Měna: <strong>Euro (€)</strong>')
    expect(replaceLegacyRateLine(p.replace(/EUR/g, 'MAD'), table, 'MAD')).toBe(
      'Měna: <strong>Euro (€)</strong>',
    )
    expect(replaceLegacyRateLine(p, table, 'BAM')).toBe('Měna: <strong>Euro (€)</strong>')
  })
  it('obyčejný text nechá být', () => {
    expect(replaceLegacyRateLine('<strong>Ceny</strong> jsou nízké', table, 'EUR')).toBe(
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
    expect(mayContainAmounts(doc('omezen na E£ 1000'))).toBe(true)
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
      { currencyCode: 'EUR', exchangeRates: table },
    )
    // DOMPurify nezlomitelné mezery serializuje jako &nbsp;; data-tip a tabindex musí projít sanitizací.
    expect(html).toContain(
      `a aktuální kurz: <strong><span class="amount" tabindex="0" data-tip="Kurz ČNB z ${D}">1&nbsp;EUR = 24,31&nbsp;Kč</span></strong></p>`,
    )
    expect(html).toContain('120&nbsp;EUR&nbsp;<span class="amount-czk">')
    expect(html).toContain(`data-tip="Kurz ČNB 1&nbsp;EUR = 24,31&nbsp;Kč (${D})"`)
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
      { currencyCode: 'EUR', exchangeRates: table },
    )
    expect(html).not.toContain('amount-czk')
    expect(html).toContain('<h2 id="rozpočet-120-eur">Rozpočet 120 EUR</h2>')
  })
})

describe('kurzovní lístek ČNB', () => {
  const txt = [
    '18.09.2026 #181',
    'země|měna|množství|kód|kurz',
    'EMU|euro|1|EUR|24,340',
    'Japonsko|jen|100|JPY|13,450',
    'Indonésie|rupie|1000|IDR|1,190',
    'rozbitý řádek bez sloupců',
    'MMF|SDR|1|XDR|0',
  ].join('\n')

  it('čte kurz za množství jednotek, desetinnou čárku a datum z hlavičky', () => {
    const sheet = parseCnbRates(txt)
    expect(Object.keys(sheet?.rates ?? {}).sort()).toEqual(['EUR', 'IDR', 'JPY'])
    expect(sheet?.rates.EUR).toBeCloseTo(24.34, 6)
    expect(sheet?.rates.JPY).toBeCloseTo(0.1345, 6) // dělení množstvím (plovoucí čárka)
    expect(sheet?.rates.IDR).toBeCloseTo(0.00119, 8)
    expect(sheet?.date).toBe('18. 9. 2026')
    expect(parseCnbRates('')).toBeNull()
    expect(parseCnbRates('<html>chyba</html>')).toBeNull()
  })
  it('formát data česky, bez úvodních nul', () => {
    expect(formatRateDate('05.09.2026 #172')).toBe('5. 9. 2026')
    expect(formatRateDate('2026-09-18')).toBe('18. 9. 2026')
    expect(formatRateDate('nesmysl')).toBeNull()
  })
  it('denní lístek přepisuje měsíční, datum jde s měnou', () => {
    const monthly = { rates: { EUR: 24.0, EGP: 0.41 }, date: '31. 8. 2026' }
    const daily = parseCnbRates(txt)
    const merged = mergeRateSheets([monthly, daily], 'ČNB')
    expect(merged?.rates.EUR).toBeCloseTo(24.34, 6)
    expect(merged?.dates.EUR).toBe('18. 9. 2026')
    expect(merged?.rates.EGP).toBe(0.41)
    expect(merged?.dates.EGP).toBe('31. 8. 2026')
    expect(merged?.source).toBe('ČNB')
    expect(mergeRateSheets([null, null], 'ECB')).toBeNull()
  })
})
