/**
 * Částky v cizí měně v textech článků → orientační přepočet na koruny.
 *
 * Čistě textová vrstva bez závislostí: dostane už escapovaný text uzlu
 * a tabulku kurzů, vrátí HTML s doplněnými korunami. Autorova částka zůstává
 * doslova (cestovatel platí místní měnou a porovnává s cenovkou), koruny jsou
 * tlumený doplněk za ní: „120 EUR (≈ 2 900 Kč)“. Rozhodnutí uživatele
 * 18. 9. 2026 — varianta B z návrhu. Bublina po najetí/klepnutí nese kurz,
 * zdroj a datum (CSS `.amount::after` z `data-tip`, viz globals.css).
 *
 * Druhá služba téhož modulu: řádek „aktuální kurz: 1 EUR = 1 CZK“, který
 * do prvního odstavce 61 stránek „Měna a ceny“ zapsala migrace natvrdo
 * (55× s hodnotou 1). Při vykreslení se nahradí živým kurzem, nebo bez kurzu
 * vypustí i s úvodem „a aktuální kurz:“.
 */

/** Odkud kurz je; do bubliny („Kurz ČNB …“). */
export type RateSource = 'ČNB' | 'ECB'

/** Tabulka kurzů: Kč za jednotku měny, datum platnosti a zdroj podle měny. */
export type ExchangeRates = {
  /** Klíč = ISO kód, hodnota = kolik Kč stojí jedna jednotka měny. */
  rates: Record<string, number>
  /**
   * Datum platnosti kurzu („18. 9. 2026“) podle měny — denní lístek ČNB a
   * měsíční „ostatní měny“ mají různá data. Chybí-li, bublina datum neuvede.
   */
  dates: Record<string, string>
  /**
   * Zdroj podle měny: při výpadku denního lístku ČNB nese většinu měn ECB,
   * ale měny jen z měsíčního lístku ČNB zůstávají ČNB — jeden štítek pro
   * celou tabulku by u nich lhal.
   */
  sources: Record<string, RateSource>
}

/**
 * Čítač id pro `aria-describedby` bublin v rámci jednoho dokumentu — sdílí ho
 * všechny texty jedné stránky (i složené Praktické informace), aby se id
 * neopakovala. Bez čítače se bublina vykreslí jen vizuálně (testy, cizí volání).
 */
export type TipIds = { count: number }

export const NBSP = ' '

/**
 * Rodiny měn sdílející symbol nebo české slovo. Když stránka patří zemi
 * s měnou z rodiny, vyhraje ona (v Austrálii je „dolar“ AUD); jinak výchozí
 * člen rodiny, nebo nic, když výchozí nedává smysl (dinar bez země).
 */
const FAMILIES: Record<string, { members: string[]; fallback: string | null }> = {
  euro: { members: ['EUR'], fallback: 'EUR' },
  dollar: {
    members: ['USD', 'AUD', 'CAD', 'NZD', 'SGD', 'HKD', 'MXN', 'TWD', 'ARS', 'CLP', 'COP', 'UYU'],
    fallback: 'USD',
  },
  pound: { members: ['GBP', 'EGP', 'LBP', 'SYP', 'SDG'], fallback: 'GBP' },
  yen: { members: ['JPY', 'CNY'], fallback: 'JPY' },
  baht: { members: ['THB'], fallback: 'THB' },
  lira: { members: ['TRY'], fallback: 'TRY' },
  rupee: { members: ['INR', 'LKR', 'NPR', 'PKR', 'IDR', 'MUR', 'MVR', 'SCR'], fallback: 'INR' },
  peso: { members: ['MXN', 'ARS', 'CLP', 'COP', 'PHP', 'UYU', 'CUP', 'DOP'], fallback: null },
  franc: { members: ['CHF', 'XOF', 'XAF', 'XPF'], fallback: 'CHF' },
  forint: { members: ['HUF'], fallback: 'HUF' },
  zloty: { members: ['PLN'], fallback: 'PLN' },
  krona: { members: ['SEK', 'NOK', 'DKK', 'ISK'], fallback: null },
  won: { members: ['KRW'], fallback: 'KRW' },
  ringgit: { members: ['MYR'], fallback: 'MYR' },
  rand: { members: ['ZAR'], fallback: 'ZAR' },
  real: { members: ['BRL'], fallback: 'BRL' },
  leu: { members: ['RON', 'MDL'], fallback: 'RON' },
  lev: { members: ['BGN'], fallback: 'BGN' },
  dirham: { members: ['MAD', 'AED'], fallback: null },
  dinar: { members: ['TND', 'DZD', 'JOD', 'KWD', 'BHD', 'IQD', 'RSD', 'MKD'], fallback: null },
  rial: { members: ['OMR', 'QAR', 'SAR', 'IRR', 'YER'], fallback: null },
  shekel: { members: ['ILS'], fallback: 'ILS' },
  dong: { members: ['VND'], fallback: 'VND' },
  rupiah: { members: ['IDR'], fallback: 'IDR' },
}

/**
 * Symboly a zkratky měn → rodina (malá písmena) nebo přímo ISO kód (velká).
 * Před číslem i za ním („E£ 1000“, „S/ 50“, „Rp 10.000“, „20 €“, „100 kr“).
 * „Kč“ tu schválně není: koruny se nepřepočítávají.
 */
const SYMBOLS: Record<string, string> = {
  '€': 'euro',
  $: 'dollar',
  '£': 'pound',
  '¥': 'yen',
  '฿': 'baht',
  '₺': 'lira',
  '₹': 'rupee',
  '₨': 'rupee',
  Rs: 'rupee',
  '₩': 'won',
  '₪': 'shekel',
  '₫': 'dong',
  kr: 'krona',
  zł: 'zloty',
  Ft: 'forint',
  'E£': 'EGP',
  'S/': 'PEN',
  R$: 'BRL',
  Rp: 'IDR',
  RM: 'MYR',
  '₱': 'PHP',
  '₴': 'UAH',
  '₸': 'KZT',
  '₾': 'GEL',
  '₼': 'AZN',
  '₮': 'MNT',
  '₦': 'NGN',
  '₵': 'GHS',
  '₡': 'CRC',
  '₲': 'PYG',
  '₭': 'LAK',
  '៛': 'KHR',
}

/**
 * České tvary slov → rodina. Kmeny s příponou skloňování; koncovky se
 * neověřují do písmene (stačí, že slovo začíná kmenem a končí písmeny) —
 * důležité je nechytit něco jiného: „jen“ (spojka) a „koruna“ tu chybí
 * schválně, „real“ i „rand“ vyžadují jen tvary skutečné měny.
 */
const WORD_STEMS: [RegExp, string][] = [
  [/^eur(?:o|a|em|u|ech|ům|ám)?$/i, 'euro'],
  [/^dolar(?:y|ů|u|ům|ech|em|ama)?$/i, 'dollar'],
  [/^lib(?:ra|ry|er|ře|rou|rám|rách|rami)$/i, 'pound'],
  [/^bah?t(?:y|ů|u|ům|ech|em)?$/i, 'baht'],
  [/^lir(?:a|y|u|ou|ám|ách|ami)?$/i, 'lira'],
  [/^rupi(?:e|í|i|í|ím|ích|emi)$/i, 'rupee'],
  [/^rupi(?:ah|áh)$/i, 'rupiah'],
  [/^pes(?:o|a|os|em|u|ech|ům)$/i, 'peso'],
  [/^frank(?:y|ů|u|ům|ech|em)?$/i, 'franc'],
  [/^forint(?:y|ů|u|ům|ech|em)?$/i, 'forint'],
  [/^zlot(?:ý|é|ých|ému|ým|ými)$/i, 'zloty'],
  [/^won(?:y|ů|u|ům|ech|em)?$/i, 'won'],
  [/^ringgit(?:y|ů|u|ům|ech|em)?$/i, 'ringgit'],
  [/^rand(?:y|ů|u|ům|ech|em)?$/i, 'rand'],
  [/^real(?:y|ů|u|ům|ech|em)?$/i, 'real'],
  [/^le[iu]$/i, 'leu'],
  [/^lev(?:a|ů|u|ům|ech|em)?$/i, 'lev'],
  [/^dirham(?:y|ů|u|ům|ech|em)?$/i, 'dirham'],
  [/^dinár(?:y|ů|u|ům|ech|em)?$|^dinar(?:y|ů|u|ům|ech|em)?$/i, 'dinar'],
  [/^ri[ay]l(?:y|ů|u|ům|ech|em)?$/i, 'rial'],
  [/^šekel(?:y|ů|u|ům|ech|em)?$/i, 'shekel'],
  [/^dong(?:y|ů|u|ům|ech|em)?$/i, 'dong'],
]

/** Kódy, které v textu bereme za měnu: členy rodin + kódy za symboly. */
const KNOWN_CODES = new Set<string>([
  ...Object.values(FAMILIES).flatMap((f) => f.members),
  ...Object.values(SYMBOLS).filter((v) => /^[A-Z]{3}$/.test(v)),
])

/**
 * Z tokenu u čísla (kód, symbol, české slovo) určí ISO kód měny.
 * `pageCurrency` je měna země, pod kterou stránka patří (rozhoduje
 * u víceznačných rodin). Vrací null, když je token neznámý nebo koruna.
 */
export function resolveCurrency(token: string, pageCurrency?: string | null): string | null {
  const t = token.trim()
  if (!t) return null
  if (/^[A-Z]{3}$/.test(t)) return t === 'CZK' ? null : KNOWN_CODES.has(t) ? t : null
  const symbol = SYMBOLS[t]
  if (symbol && /^[A-Z]{3}$/.test(symbol)) return symbol
  const family = symbol ?? WORD_STEMS.find(([re]) => re.test(t))?.[1] ?? null
  if (!family) return null
  const def = FAMILIES[family]
  if (pageCurrency && def.members.includes(pageCurrency)) return pageCurrency
  return def.fallback
}

/**
 * Zaokrouhlení podle velikosti částky: ceny v článcích jsou odhady
 * („okolo 10 eur“), přepočet na haléře by předstíral přesnost, kterou nemá.
 * Vrací null pro částky pod půl koruny (nemá co ukázat).
 */
export function roundCzk(value: number): number | null {
  if (!Number.isFinite(value) || value < 0.5) return null
  const step = value < 10 ? 1 : value < 100 ? 5 : value < 1000 ? 10 : value < 10_000 ? 100 : 1000
  return Math.round(value / step) * step
}

/** „2 900 Kč“ — tisíce mezerou, číslo a jednotka pohromadě (nezlomitelné mezery). */
export function formatCzk(value: number): string {
  const rounded = Math.round(value)
  const digits = String(Math.abs(rounded))
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return `${rounded < 0 ? '-' : ''}${grouped}${NBSP}Kč`
}

/** Kurz zapsaný česky: „24,31“ (dvě desetinná místa, čárka). */
function formatRateNumber(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/**
 * „1 EUR = 24,31 Kč“, u drobných měn po stovkách či tisících („100 JPY =
 * 13,45 Kč“, „1 000 IDR = 1,19 Kč“), aby řádek neříkal „0,00“.
 */
export function formatRateLine(code: string, czkPerUnit: number): string {
  const unit = czkPerUnit >= 1 ? 1 : czkPerUnit * 100 >= 1 ? 100 : 1000
  const unitText = unit === 1000 ? `1${NBSP}000` : String(unit)
  return `${unitText}${NBSP}${code} = ${formatRateNumber(czkPerUnit * unit)}${NBSP}Kč`
}

/** Text bubliny: „Kurz ČNB 1 EUR = 24,31 Kč (18. 9. 2026)“. */
export function rateTip(code: string, table: ExchangeRates): string {
  const date = table.dates[code]
  const source = table.sources[code]
  return `Kurz ${source ? `${source} ` : ''}${formatRateLine(code, table.rates[code])}${date ? ` (${date})` : ''}`
}

/**
 * Obal s bublinou: fokusovatelný (klepnutí na mobilu i klik ukážou bublinu).
 * Bublina je CSS pseudoelement z `data-tip`, který čtečky nečtou — proto je
 * text i ve skrytém spanu navázaném přes `aria-describedby` (čtečka ho řekne
 * při fokusu, ne uprostřed věty). Bez čítače id se skrytý span vynechá.
 */
function tipSpan(tip: string, inner: string, ids?: TipIds): string {
  if (!ids) return `<span class="amount" tabindex="0" data-tip="${tip}">${inner}</span>`
  const id = `kurz-${++ids.count}`
  return (
    `<span class="amount" tabindex="0" data-tip="${tip}" aria-describedby="${id}">${inner}` +
    `<span id="${id}" class="amount-tip">${tip}</span></span>`
  )
}

/**
 * Číslo v české sazbě: „120“, „1 000“, „1.500“, „2,5“, „12 500,50“.
 * Bez znaménka, bez exponentu; číslo delší než 9 číslic nebereme (telefon,
 * identifikátor), stejně jako číslo s tečkou jako desetinným oddělovačem
 * následované třemi číslicemi (to je tisícová tečka „1.500“).
 */
const NUMBER = String.raw`\d{1,3}(?:[  .]\d{3})+(?:,\d{1,2})?|\d{1,9}(?:,\d{1,2})?`
// Delší symboly před kratšími (E£ před £, R$ před $).
const SYMBOL = String.raw`E£|R\$|S/|Rp|RM|Rs|₨|kr|€|\$|£|¥|฿|₺|₹|₩|₪|₫|₱|₴|₸|₾|₼|₮|₦|₵|₡|₲|₭|៛|zł|Ft`
const WORD = String.raw`\p{L}{2,10}`
const AMOUNT_RE = new RegExp(
  // 1: znak před číslem (kvůli roku), 2: číslo, 3: mezera mezi číslem a měnou,
  // 4: token měny. Symbol může být i před číslem (5: symbol, 6: číslo).
  String.raw`(^|[^\d\p{L}.,])(?:(${NUMBER})([  ]?)([A-Z]{3}|${SYMBOL}|${WORD})(?![\p{L}\d])|(${SYMBOL})[  ]?(${NUMBER})(?![\d,]))`,
  'gu',
)

/**
 * Kontext, po němž čtyřmístné číslo znamená letopočet, ne částku: „v roce
 * 2002 euro“, „od 1. ledna 2023 euro“ (název měsíce), „od 1. 1. 2026 eurem“
 * (den a měsíc číslem), „po roce 2000 eur“ — bez toho by se rok přepočítal
 * na koruny (stalo se u Chorvatska: „2023 euro (≈ 49 000 Kč)“).
 */
const YEAR_CONTEXT_RE =
  /(?:^|\s|\.)(?:v\s+)?(?:roce|roku|rok|letech|let|r\.|ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince|\d{1,2}\.[  ]?\d{1,2}\.)[  ]*$/i

function parseCzechNumber(text: string): number {
  const normalized = text
    .replace(/[  ]/g, '')
    .replace(/\.(?=\d{3})/g, '')
    .replace(',', '.')
  return Number(normalized)
}

/**
 * Obal částky: autorův zápis, za ním tlumené koruny, v bublině kurz.
 * Vrací null, když kurz chybí nebo je přepočet pod půl koruny.
 */
function annotatedAmountHtml(
  original: string,
  code: string,
  amount: number,
  table: ExchangeRates,
  ids?: TipIds,
): string | null {
  const rate = table.rates[code]
  if (!rate || !Number.isFinite(rate)) return null
  const czk = roundCzk(amount * rate)
  if (czk === null) return null
  return tipSpan(
    rateTip(code, table),
    `${original}${NBSP}<span class="amount-czk">(≈${NBSP}${formatCzk(czk)})</span>`,
    ids,
  )
}

/**
 * Doplní za částky v cizí měně přepočet na koruny. Vstup je text uzlu už
 * escapovaný pro HTML (v částkách se žádné HTML znaky nevyskytují, `$` je
 * v HTML neškodný). Nezná-li měnu nebo kurz, nechá text být.
 *
 * - Roky za „v roce“, „roku“, „letech“ se nechytají („v roce 2002 euro nahradilo…“).
 * - Řádek „1 EUR = 1 CZK“ se neanotuje: řeší ho replaceLegacyRateLine.
 * - Kč/CZK se přeskakují — jsou už v korunách.
 */
export function annotateAmountsHtml(
  escapedText: string,
  table: ExchangeRates | null | undefined,
  pageCurrency?: string | null,
  ids?: TipIds,
): string {
  if (!table || !escapedText || !/\d/.test(escapedText)) return escapedText
  if (isLegacyRateLine(escapedText)) return escapedText

  return escapedText.replace(
    AMOUNT_RE,
    (
      match: string,
      lead: string,
      num: string | undefined,
      gap: string | undefined,
      token: string | undefined,
      symBefore: string | undefined,
      numAfter: string | undefined,
      offset: number,
    ) => {
      const numberText = num ?? numAfter ?? ''
      const code = resolveCurrency(token ?? symBefore ?? '', pageCurrency)
      if (!code) return match

      // Letopočet: čtyřmístné číslo bez oddělovače po slově o roku.
      if (
        /^\d{4}$/.test(numberText) &&
        YEAR_CONTEXT_RE.test(escapedText.slice(0, offset + lead.length))
      ) {
        return match
      }

      const amount = parseCzechNumber(numberText)
      if (!Number.isFinite(amount) || amount <= 0) return match

      // Autorův zápis zachovat, jen mezery (tisíce, číslo–měna) udělat nezlomitelné.
      const numberNb = numberText.replace(/ /g, NBSP)
      const original =
        num !== undefined
          ? `${numberNb}${gap ? NBSP : ''}${token}`
          : `${symBefore}${NBSP}${numberNb}`
      const annotated = annotatedAmountHtml(original, code, amount, table, ids)
      return annotated ? `${lead}${annotated}` : match
    },
  )
}

/** Vzor řádku z migrace: „1 EUR = 1 CZK“, „1 EUR = 26.33 CZK“. */
const LEGACY_RATE_TEXT = /^1 ([A-Z]{3}) = \d[\d.,]* CZK$/
const LEGACY_RATE_IN_HTML =
  /( a aktuální kurz:\s*)?(<strong>|<b>)?1 ([A-Z]{3}) = \d[\d.,]* CZK(<\/strong>|<\/b>)?/

export function isLegacyRateLine(text: string): boolean {
  return LEGACY_RATE_TEXT.test(text.trim())
}

/**
 * V HTML odstavce nahradí řádek kurzu z migrace živou hodnotou: „1 EUR =
 * 24,31 Kč“ s bublinou (zdroj a datum). Bez kurzu (měna mimo zdroj, výpadek)
 * vypustí celý dovětek „a aktuální kurz: …“ — lepší nic než „1 EGP = 1 CZK“.
 * Kód v textu musí odpovídat měně stránky; cizí kód (text říká EUR, země má
 * BAM) se vypustí.
 */
export function replaceLegacyRateLine(
  paragraphHtml: string,
  table: ExchangeRates | null | undefined,
  pageCurrency?: string | null,
  ids?: TipIds,
): string {
  if (!paragraphHtml.includes(' CZK')) return paragraphHtml
  return paragraphHtml.replace(
    LEGACY_RATE_IN_HTML,
    (
      _match,
      lead: string | undefined,
      open: string | undefined,
      code: string,
      close: string | undefined,
    ) => {
      const rate = table?.rates[code]
      const matchesPage = !pageCurrency || pageCurrency === code
      if (!table || !rate || !matchesPage) return ''
      const date = table.dates[code]
      const source = table.sources[code]
      const tip = `Kurz${source ? ` ${source}` : ''}${date ? ` z ${date}` : ''}`
      return `${lead ?? ''}${open ?? ''}${tipSpan(tip, formatRateLine(code, rate), ids)}${close ?? ''}`
    },
  )
}

/**
 * Levná předběžná kontrola nad načteným Lexical JSON (žádný dotaz): může text
 * obsahovat částku v cizí měně nebo řádek kurzu z migrace? Rozhoduje, zda se
 * pro stránku vůbec stahuje tabulka kurzů a dědí měna země. Falešně kladný
 * výsledek stojí jen jeden cachovaný request, falešně záporný by přepočet
 * potichu vypnul — proto je záměrně široká (kmeny slov bez koncovek).
 */
const MAY_CONTAIN_CODE_OR_SYMBOL = new RegExp(
  String.raw`\d[  ]?(?:[A-Z]{3}(?![a-z])|${SYMBOL})|(?:${SYMBOL})[  ]?\d`,
  'u',
)
const MAY_CONTAIN_WORD =
  /\d[  ]?(?:eur|dolar|lib(?:ra|ry|er|ře|rou|rám|rách)|bah?t|lir|rupi|pes(?:o|a|os)|frank|forint|zlot|won|ringgit|rand|real|le[iu]\b|lev|dirham|din[aá]r|ri[ay]l|šekel|dong)/iu

export function mayContainAmounts(text: unknown): boolean {
  if (!text || typeof text !== 'object') return false
  const json = JSON.stringify(text)
  return MAY_CONTAIN_CODE_OR_SYMBOL.test(json) || MAY_CONTAIN_WORD.test(json)
}
