# Design systém webu — barvy, velikosti písma, pravidla

> Přehledný **manuál vizuálního stylu** (logo, barvy, typografie, prvky, pravidla) je v
> [`docs/manual-vizualniho-stylu.html`](manual-vizualniho-stylu.html) — otevři v prohlížeči.

Web má **jedno místo, kde se barvy a velikosti písma definují**: blok `@theme` v
`src/app/(frontend)/globals.css`. Každý token je zároveň Tailwind utility
(`--color-surface` → `bg-surface`, `text-surface`, `border-surface`) a CSS proměnná
(`var(--color-surface)`) pro ruční CSS.

V komponentách se **nikdy nepíší hexy** (`bg-[#f5f7f9]`) ani Tailwind šedé
(`text-gray-500`). Když role chybí, přidá se token sem a do `globals.css`, ne nová barva
do komponenty. Důvod: před zavedením tokenů (11. 9. 2026) měl web 151 různých barev,
z toho 59 šedých a 10 „skoro bílých“ podkladů — karta komentáře a blok reklamy vedle
sebe měly každý jinou šedou a tlumené texty padaly pod normu čitelnosti.

Zvolená sada je varianta **„A · Uklizená modrá“**: modrá značky je modrá originálu loga
`#224386` (od 11. 9. 2026; do té doby web používal `#215491`), šedé s jednotným modrým nádechem
(odstín 213°), korálová ztmavená
tak, aby na ní prošel bílý text.

## Role

### Neutrály

| Token           | Hodnota   | Kdy                                                                                                   |
| --------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `paper`         | `#ffffff` | stránka, čtecí plocha (běžně `bg-white`)                                                              |
| `surface`       | `#f4f6f9` | podklad karet: komentář, reklama, tip, střídavé sekce, patička sekce                                  |
| `surface-2`     | `#e9eef4` | o krok tmavší podklad: pruhy, vnořený blok na `surface`, neaktivní štítek                             |
| `surface-quiet` | `#f5f6f7` | plocha, která má ustoupit a nepřitahovat oko: blok reklamy, prázdné stavy (téměř bez modrého nádechu) |
| `line`          | `#dfe5ec` | oddělovače, rámečky karet                                                                             |
| `line-strong`   | `#c9d3de` | rámečky polí formuláře, linky, které mají být vidět i na `surface-2`                                  |
| `ink`           | `#1f2a37` | text, nadpisy karet                                                                                   |
| `ink-2`         | `#4f5d6b` | vedlejší text: perex, popisky, „Odpovědět“, patička                                                   |
| `ink-3`         | `#5f6b79` | tlumený text: meta údaje („před 2 lety“), nápovědy, placeholder                                       |
| `dusk`          | `#3b444f` | tmavý podklad: hero bez fotky, tmavé pruhy                                                            |
| `night`         | `#0a1626` | překryv za dialogy (`bg-night/55`), tmavé plátno ořezu fotky                                          |

`ink-3` je nejsvětlejší povolená barva textu — drží 4,5 : 1 na bílé, na `surface`
i na `surface-2`. Světlejší šedou pro text nepoužívej; pro dekoraci (tečka, šipka)
použij `line-strong`.

### Modrá značky

| Token        | Hodnota   | Kdy                                                                |
| ------------ | --------- | ------------------------------------------------------------------ |
| `brand`      | `#224386` | odkazy, tlačítka, ikony, jména autorů, sekundární menu             |
| `brand-deep` | `#1a3366` | hlavička, nadpisy sekcí, avatar bez fotky (NE hover tlačítek)      |
| `brand-tint` | `#e7ecf9` | štítek počtu komentářů, podbarvený tip, jemné zvýraznění aktivního |

Modrá značky je přesně modrá originálu loga („Výherní logo“ na OneDrive, `logo-fb.svg`, odstín 220°). Stejnou modrou mají ikony webu (`scripts/build-icons.mjs`, favicon, ikona aplikace) i náhledový obrázek pro sdílení `public/og-default.png`. `brand-deep` a `brand-tint` jsou tmavší a světlejší stupeň téhož odstínu. Logo v hlavičce a patičce webu je bílé.

### Zdůraznění a stavy

| Token        | Hodnota   | Kdy                                                            |
| ------------ | --------- | -------------------------------------------------------------- |
| `accent`     | `#c2473c` | akční nabídka, sleva, „Nové“; bílý text na ní projde (4,9 : 1) |
| `accent-bg`  | `#fbe9e7` | podklad štítku slevy                                           |
| `accent-ink` | `#a3271d` | text na `accent-bg`                                            |
| `ok`         | `#1b7a68` | úspěch, potvrzení, kladný stav                                 |
| `ok-bg`      | `#e4f3ef` | podklad kladného štítku                                        |
| `warn`       | `#b45309` | varování (text)                                                |
| `warn-bg`    | `#fdf1de` | podklad varování                                               |
| `err`        | `#a3271d` | chyba formuláře, zamítnutí (text)                              |
| `err-bg`     | `#fdeceb` | podklad chyby                                                  |
| `star`       | `#e9a11b` | hvězdičky hodnocení — jen ikona, nikdy text                    |

### Sezóna a klima

Čtyři stupně vhodnosti návštěvy (pruh sezóny, graf klimatu). `SUITABILITY_COLOR`
v `src/lib/climate.ts` na tyto tokeny jen odkazuje (`var(--color-season-…)`), hodnota je jen tady.

| Token             | Hodnota   | Text na plné ploše                                 |
| ----------------- | --------- | -------------------------------------------------- |
| `season-ideal`    | `#1b7a68` | bílý                                               |
| `season-good`     | `#5eb49f` | `season-good-ink` (bílý má jen 2,5 : 1)            |
| `season-mid`      | `#9fb1c4` | `ink`                                              |
| `season-poor`     | `#c9d3de` | `ink-2`                                            |
| `season-good-ink` | `#0e3a32` | text na ploše `season-good` (pruh sezóny, legenda) |

Srážky v grafu klimatu mají vlastní dvojici mimo řadu modré značky: proužek pod
číslem má barvu kapky 💧, aby čtenář poznal, že patří k dešti, a ne k vhodnosti.
Jen grafika (`aria-hidden`), nikdy text.

| Token        | Hodnota   | Kde                                 |
| ------------ | --------- | ----------------------------------- |
| `rain`       | `#62b4e8` | výplň proužku srážek                |
| `rain-track` | `#e1eff9` | dráha proužku srážek (prázdná část) |

### Typografie článků (legacy parita)

Barvy nadpisů a odkazů v textu článků jsou převzaté ze starého webu a záměrně
nejsou v řadě modré značky. Mění se jen po výslovném rozhodnutí.

| Token           | Hodnota   | Kde                             |
| --------------- | --------- | ------------------------------- |
| `prose-heading` | `#005580` | h2/h3 v `.prose`                |
| `prose-section` | `#004d94` | sekční h2 Praktických informací |
| `prose-link`    | `#115194` | odkazy v `.prose`               |
| `prose-quote`   | `#1f518e` | levá linka citace               |

## Pravidla

1. **Podklad karty je vždy `surface`.** Komentář, tip, Nice-to-know, patička sekce —
   všechny stejná šedá. Výjimka je blok reklamy: ten má ustoupit, proto `surface-quiet`. Když potřebuješ blok uvnitř bloku, použij `surface-2`,
   nikdy třetí odstín.
2. **Text má tři stupně, ne víc.** `ink` / `ink-2` / `ink-3`. Hierarchii dělej velikostí
   a tučností, ne dalším odstínem šedé.
3. **Jedna modrá pro „dá se kliknout“.** Odkazy, tlačítka, ikony = `brand`;
   `brand-deep` je pro rámec webu (hlavička, nadpisy), ne pro odkazy ani hover.
   **Tlačítka** (plná i obrysová) mají společnou utilitu `btn-halo`: při najetí průsvitné
   halo v `brand` + jemný stín, barva výplně se nemění a tlačítko se nehýbe; fokus z klávesnice
   = ostrý dvojitý prstenec (bílá mezera + `brand`). Žádné vlastní `hover:bg-*` ani
   `focus-visible:ring-*` na tlačítkách.
4. **Stavové barvy jen pro stav.** Zelená říká „v pořádku / sezóna“, korálová „akce /
   sleva“, oranžová „pozor / hvězdy“. Nepoužívej je jako dekoraci.
5. **Kontrast**: běžný text ≥ 4,5 : 1, velký text a ikony ≥ 3 : 1 vůči podkladu, na kterém
   skutečně leží (meta údaj na kartě se měří proti `surface`, ne proti bílé).
6. **Nová potřeba = nový token, ne nový hex.** Přidej řádek do `@theme` a sem do tabulky,
   pojmenovaný podle role (co dělá), ne podle vzhledu (`light-gray-3`).

## Velikosti písma

Stejné pravidlo jako u barev: v komponentách se **nikdy nepíše `text-[13px]`**, jen role
(`text-label`). Před zavedením stupnice (18. 9. 2026) měl web 25 různých velikostí na
288 místech, z toho devět půlpixelových (13 px vedle 13,5 px) — rozdíl, který nikdo nevidí,
ale který se musel u každé nové komponenty znovu hádat.

| Token        | Hodnota             | Kdy                                                              |
| ------------ | ------------------- | ---------------------------------------------------------------- |
| `caps-sm`    | `0.625rem` / 10 px  | verzálkový mikroštítek: stav počasí, „Bez náhledu“, popisky času |
| `meta`       | `0.6875rem` / 11 px | nejdrobnější údaj: plovoucí popisek pole, atribuce fotky         |
| `caps`       | `0.75rem` / 12 px   | verzálkový štítek: „Číst více“, nadočko nad titulkem             |
| `label`      | `0.8125rem` / 13 px | nejčastější stupeň: tlačítka, nápovědy formulářů, popisky        |
| `small`      | `0.875rem` / 14 px  | vedlejší text v kartách a seznamech, patička                     |
| `body`       | `0.9375rem` / 15 px | základní text rozhraní mimo článek                               |
| `lead`       | `1.0625rem` / 17 px | uvozující odstavec sekce, nadpis dlaždice a karty                |
| `lead-lg`    | `1.125rem` / 18 px  | výrazný údaj v panelu místa, jméno autora, nadpis dialogu        |
| `title`      | `1.25rem` / 20 px   | nadpis karty a dialogu                                           |
| `section`    | `1.375rem` / 22 px  | nadpis sekce na stránce                                          |
| `heading`    | `1.625rem` / 26 px  | hlavní nadpis stránky, titulek hero na mobilu                    |
| `display`    | `2rem` / 32 px      | titulek hero na tabletu                                          |
| `display-lg` | `2.5rem` / 40 px    | titulek hero na širokém displeji                                 |

### Pravidla

1. **Verzálky posuzuj opticky.** Kapitálky s prostrkáním narůstají — na stupni běžného
   textu působí o číslo větší, takže verzálkový štítek často patří o stupeň níž, než by
   se zdálo. Kvůli tomu `caps-sm` a `caps` vznikly. **Neznamená to, že každý verzálkový
   text na ně patří**: verzálky na 11 i 13 px jsou na webu taky a je to v pořádku. Token
   se vybírá podle **výsledné velikosti**, ne podle toho, že text je verzálkový.
2. **Token nese jen velikost, ne řádkování.** Prokládání zůstává na prvku
   (`leading-*`). Spárované `--text-*--line-height` by změnilo prokládání na všech
   288 místech naráz.
3. **Nový stupeň = zápis na dvě místa.** Do `@theme` v `globals.css` **a** do seznamu
   v `extendTailwindMerge` (`src/lib/utils.ts`). Bez druhého zápisu bere slučovač tříd
   `text-neco` jako barvu textu a při kombinaci s barvou ho zahodí: velikost spadne na
   zděděných 16 px, nebo naopak zmizí barva. `tsc` ani lint to nechytí — ověřuje se
   `getComputedStyle().fontSize` v prohlížeči.
4. **Všechno v `.prose` a `.pi-prose` drží původní velikost.** Text článku (18 px odstavec,
   20 px perex, 36/22/21 px nadpisy) i vložené widgety (sezónnost, Nice-to-know, rozpočet)
   — parita se starým webem je záměr, stejná výjimka jako u modré v textu článku. Kde se
   velikost kryje se stupněm, používá se token (`@apply text-small`); kde ne, zůstává
   hodnota v `rem` (`font-size: 0.75rem`). Nic uvnitř `.prose` se zavedením stupnice
   nezměnilo.
5. **Kresba zůstává v pixelech.** Linky (`h-[1px]`), rámečky, `ring-*`, pevné rozměry
   a ikony kreslené písmem (emoji počasí `text-[46px]`, ikona deštivosti). Ikona není text.
   Jediná textová výjimka: aktuální teplota `text-[46px]` vedle emoji stejné velikosti —
   dvojice musí sedět na pixel, proto zůstává s ikonou v px a nemá vlastní stupeň.
6. **Hierarchii dělej velikostí a tučností**, ne dalším odstínem šedé (viz pravidlo 2
   u barev). Pozor na sousední prvky: sloučení dvou stupňů do jednoho umí srazit nadpis
   a podtext na stejnou velikost a blok tím ztratí hierarchii.

## Kontrasty zvolené sady (WCAG)

| Text                      | na bílé | na `surface` | na `surface-2`  |
| ------------------------- | ------- | ------------ | --------------- |
| `ink`                     | 14,5    | 13,4         | 12,5            |
| `ink-2`                   | 6,8     | 6,2          | 5,8             |
| `ink-3`                   | 5,4     | 5,0          | 4,7             |
| `brand`                   | 9,5     | 8,8          | 8,1             |
| `ok`                      | 5,2     | 4,8          | 4,5             |
| `accent`                  | 4,9     | 4,6          | 4,2 (jen velký) |
| bílý text na `brand`      | 9,5     |              |                 |
| bílý text na `brand-deep` | 12,3    |              |                 |
| bílý text na `accent`     | 4,9     |              |                 |

## Co je mimo tokeny (záměrně)

- Barvy v e-mailových šablonách (klienti neumí CSS proměnné) — hexy zůstávají, hodnoty
  se opisují z tabulek výše.
- Styl mapy (`scripts/build-map-style.mjs`, `public/map-styles`) — vlastní paleta MapLibre.
- `rgba(255,255,255,…)` a `rgba(0,0,0,…)` překryvy nad fotkami.
- Admin Payloadu (`src/app/(payload)`) má vlastní téma.

## Historie

- 11. 9. 2026 — zavedení barevných tokenů podle varianty A. Podklad: audit 151 barev v kódu,
         review dřívějšího návrhu sezónní sady (srpen 2026) a porovnání variant A/B/C.
- 18. 9. 2026 — zavedení stupnice velikostí písma (25 velikostí → 13 stupňů) a převod
         sazby na `rem`, aby web respektoval nastavení velikosti písma v prohlížeči.
         Stupně `caps-sm`, `caps` a `lead-lg` vznikly až po porovnání s produkcí:
         verzálky působily příliš velké a sloučení 16/17/18 px zplošťovalo dvojici
         nadpis + podtext u Praktických informací.
