import type { ClimateNormalMonth } from '@/types/payload'

/**
 * Čtyřstupňová škála vhodnosti návštěvy — jediný zdroj pravdy pro graf na
 * stránkách počasí (climate-section.tsx) i pro pruh sezóny v pravém panelu
 * (season-strip.tsx). Leží v `lib`, aby na komponentě nezávisely knihovny.
 *
 * Škála jsou DVĚ DVOJICE, ne čtyři nezávislé kategorie: zelená = sezóna,
 * šedomodrá = mimo ni, a uvnitř každé dvojice je tmavší odstín ten lepší.
 * Barva tak nese dvě informace najednou (odstín = sezóna, světlost = míra)
 * a světlost přitom plynule stoupá přes celou škálu.
 *
 * Hodnoty jsou tokeny `--color-season-*` z bloku @theme v globals.css (jediné
 * místo, kde se barvy definují); tytéž tokeny bere i ruční sezónní pruh v textu
 * stránky (`.seasonality-month`). Používají se jen jako CSS hodnoty (inline style).
 */
export type Suitability = 'ideal' | 'good' | 'mid' | 'poor'

export const SUITABILITY_COLOR: Record<Suitability, string> = {
  ideal: 'var(--color-season-ideal)',
  good: 'var(--color-season-good)',
  mid: 'var(--color-season-mid)',
  poor: 'var(--color-season-poor)',
}

/** Inkoust na plných plochách té barvy (pruh) — bílá projde jen na prvním stupni. */
export const SUITABILITY_INK: Record<Suitability, string> = {
  ideal: '#ffffff',
  good: 'var(--color-season-good-ink)',
  mid: 'var(--color-ink)',
  poor: 'var(--color-ink-2)',
}

export const SUITABILITY_LABEL: Record<Suitability, string> = {
  ideal: 'Ideální',
  good: 'Dobré',
  mid: 'Průměrné',
  poor: 'Nevhodné',
}

/**
 * Legenda: dvě skupiny po dvou stupních, vždy celá — je to pevná stupnice.
 * Tytéž nadpisy i názvy stupňů používá pruh „Kdy jet" v textu stránky
 * (rich-text-html.ts), takže se čtenář učí jedno názvosloví. Nadpis skupiny
 * proto NENÍ „Hlavní turistická sezóna": slovo „hlavní" patří až stupni
 * „Ideální" uvnitř skupiny, nad dvojicí by mátlo.
 */
export const LEGEND_GROUPS: { title: string; levels: Suitability[] }[] = [
  { title: 'Turistická sezóna', levels: ['ideal', 'good'] },
  { title: 'Období mimo sezónu', levels: ['mid', 'poor'] },
]

/**
 * Vhodnost návštěvy z denní teploty a srážek — jednoduchá heuristika.
 *
 * Komfortní pásmo je schválně široké až do 34 °C: tropická hlavní sezóna má
 * běžně 33–34 °C (Bangkok v lednu) a dřívější strop na 33 °C ji srážel mezi
 * nedoporučené měsíce. Nad pásmem se klesá po stupních, ne skokem.
 *
 * Hlavní srážeč jsou SRÁŽKY, ne teplota — o tom, že se někam nejezdí,
 * rozhoduje monzun. Bangkok v září a v prosinci se liší o jediný stupeň
 * teploty, ale o 330 mm deště.
 *
 * `null` = NEMÁME DATA, ne nula. Bez denní teploty se stupeň spočítat nedá
 * a dřívější `m.tmax ?? 0` z chybějícího měření tiše udělal mrazivý měsíc,
 * tedy „Nevhodné" — tvrzení, které z dat nijak neplyne. (Dnes to nenastane,
 * `parseClimateNormals` měsíce bez teplot odmítne, ale ta záruka platí jen
 * pro tuhle jednu cestu.) Chybějící srážky naopak jen znamenají, že se
 * neuplatní dešťová srážka stupně — z neznámé hodnoty se trestat nedá.
 */
export function suitability(m: ClimateNormalMonth): Suitability | null {
  if (m.tmax === null) return null
  const t = m.tmax
  let level = t > 38 ? 1 : t > 34 ? 2 : t >= 21 ? 3 : t >= 17 ? 2 : t >= 12 ? 1 : 0
  if (m.prcp !== null) {
    if (m.prcp >= 250)
      level = Math.max(0, level - 3) // monzun srazí až na dno
    else if (m.prcp >= 150) level = Math.max(0, level - 2)
    else if (m.prcp >= 100) level = Math.max(0, level - 1)
  }
  return (['poor', 'mid', 'good', 'ideal'] as const)[level]
}
