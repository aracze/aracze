# media-proxy — Cloudflare Worker pro media.ara.cz

Proxy před Cloudinary (cloud `ara`) s dlouhou edge keší + nouzový režim ze
zálohy v R2 (bucket `aracze`, plní ho hook v `src/collections/Media.ts`).
Frontend na proxy přepisuje adresy přes `toMediaProxy`
(`src/lib/cloudinary-loader.ts`), řízeno `NEXT_PUBLIC_MEDIA_BASE_URL`.

## Zdroj fotek (`MEDIA_SOURCE`)

- `backup` (**aktuální stav od 2. 10. 2026**): fotky jdou ze zálohy v R2
  zmenšené přes Cloudflare Image Transformations, s dlouhou keší jako u
  Cloudinary. Cloudinary se vůbec nevolá — kredity čerpá jen úložiště, takže
  klouzavá 30denní spotřeba klesne a půjde downgrade na Free. Náklad: Image
  Transformations 5 000 unikátních variant/měsíc zdarma, dál 0,50 $/1 000
  (sledovat v dashboardu Images). Během pauzy se nenahrávají nové fotky.
  Objekt mimo zálohu = 404; chyba R2 (výjimka bindingu) = 503 `no-store`.
- `cloudinary` (výchozí, když proměnná chybí): původní chování níže.

Přepnutí = změna hodnoty ve `wrangler.jsonc` + deploy (nebo jednorázově
`npx wrangler deploy --var MEDIA_SOURCE:cloudinary`).

## Chování

1. **Normální provoz:** `media.ara.cz/<cesta>` → `res.cloudinary.com/ara/<cesta>`,
   odpověď se keší na edge ~1 rok (adresy jsou verzované). `f_auto` se před keší
   přepisuje na konkrétní formát podle `Accept` (Cloudflare keš ignoruje `Vary`).
2. **Výpadek Cloudinary** (ne-2xx / timeout 10 s): podá se záloha z R2 —
   zmenšená přes Cloudflare Image Transformations (zdroj `media-backup.ara.cz`
   = custom doména bucketu), při nedostupnosti transformací surový originál.
   Krátká keš (5 min), ať se po oživení rychle vrátí normál.
3. **Strop originálů:** fotka bez transformace (adresy originálů z RSC payloadu,
   staré indexy) se podává jako `f_auto,q_auto,c_limit,w_1920` — stejný tvar
   jako next/image loader. Originály mají 1,5–3 MB a v 9/2026 dělaly ~40 %
   přenosu (Googlebot-Image, scrapeři). `raw` (SVG) se nestropuje.
4. **Ochrany:** jen GET/HEAD; jen `/image/upload/` a `/raw/upload/`
   (`/image/fetch/` = 404); transformační segment musí projít whitelistem
   (jinak 400 — nikdo přes nás nerazí varianty a nepálí kredity);
   query string se ignoruje; avataři v R2 nejsou → při výpadku 404.
5. **Podpis transformací (Strict transformations):** na Cloudinary účtu je
   zapnutý režim _Strict transformations_ — nepodepsanou transformaci odmítne
   (404), vyrobí se jen to, co podepíše proxy (`s--xxxxxxxx--/` před
   transformací, SHA-1 z `transformace/public_id.ext` + API secret, viz
   `signTransform`). Staré adresy `res.cloudinary.com/ara/.../w_3840/...`
   v indexech botů tak už negenerují nové odvozeniny (srpen 2026: po smazání
   odvozenin si je boti za 10 dní vyrobili znovu, ~11 GB). Originály bez
   transformace strict režim neblokuje (R2 záloha, og:image, admin upload).
   Secret: `npx wrangler secret put CLOUDINARY_API_SECRET` (hodnota
   = `CLOUDINARY_API_SECRET` z `/opt/aracze/.env` na serveru). Bez secretu
   Worker posílá adresy nepodepsané → funguje jen s vypnutým strict režimem.
6. **robots.txt pro doménu fotek:** `media.ara.cz/robots.txt` pouští běžné
   roboty jen na vybrané šířky (`*,w_640/`, `*,w_1200/`, `c_fit,w_790/`)
   a SVG, Baidu a trénovacím AI botům (GPTBot, ClaudeBot, CCBot, Amazonbot,
   Bytespider…) zakazuje vše. Důvod: robot si ze srcset bere všechny šířky
   a vyrábí dlouhý ocas variant (každá = transformace + úložiště), člověk jen
   svou; Google Obrázky si vystačí s jednou velikostí. Pravidla robots.txt
   platí per hostname (zákaz na ara.cz na fotky nedosáhl). Seznam trénovacích
   botů je zrcadlem `TRAINING_BOTS` v appu, shodu hlídá test. Vyhledávací
   a asistenční boti zůstávají povolení (v povolených šířkách).
7. **Blokace maskovaných scraperů (403):** klient s User-Agentem prohlížeče,
   který ale neposílá `Accept` s `image/…` ani `Sec-Fetch-Dest`, fotku nedostane
   (`isDisguisedScraper`). Skutečné prohlížeče obojí posílají, známí roboti
   (vyhledávače, náhledy sociálních sítí, curl) pravidlu nepodléhají — ty řídí
   robots.txt. V 9/2026 dělali tihle klienti ~45 % požadavků a ~60 % přenosu.
   Navigace na adresu fotky (Accept s `text/html`, i staré Safari) projde;
   blokuje se jen holé `*/*` / chybějící Accept. Měří se jako outcome `blocked`;
   odpověď `no-store`, ať jde pravidlo vrátit hned.

## Měření provozu (Workers Analytics Engine)

Worker zapisuje ke každému požadavku jeden datový bod do datasetu
`media_proxy_requests` (binding `STATS`, `src/telemetry.ts`). Účel: rozhodovat
o počtu variant fotek (šířky, formáty) a o keši podle skutečného provozu, ne
odhadem — Cloudinary účtuje jen to, co si Worker musí stáhnout (přenos)
a co musí vyrobit (transformace), a to dělají hlavně roboti, ne návštěvníci.
Bez bindingu (lokální `wrangler dev`, testy) se nic neměří. Free plán: 100 000
bodů/den (= limit požadavků Workeru), retence 3 měsíce, při špičkách Cloudflare
vzorkuje — proto se v dotazech sčítá `_sample_interval`, ne `COUNT(*)`.
Past: `cf-cache-status` subrequestu často chybí. Ruční test (27. 9.) naznačoval
keš, 5 dní dat řeklo opak: TTFB u `''` 480 ms / p90 1 026 ms = jako `MISS`
(566 / 1 127), `HIT` má 28 / 50 ms — prázdný stav je STAŽENÍ. Takto spočtený
přenos sedí s grafem Cloudinary (~300 MB/den). Zásah keše byl jen ~4 % (free
zóna, dlouhý ocas variant) — proto režim `backup`. Kontrolní dotaz přes
`double4` je níže.
Schéma (pořadí je smlouva, hlídá ho test `test/telemetry.test.ts`):

| Sloupec   | Obsah                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `index1`  | výsledek (viz `blob1`) — klíč vzorkování                                                                        |
| `blob1`   | výsledek: `cloudinary` / `backup` (R2 hlavní) / `fallback` (R2 nouzově) / `unavailable` / `rejected` / `robots` |
| `blob2`   | `cf-cache-status` subrequestu (Cloudinary; v režimu backup zmenšení z R2)                                       |
| `blob3`   | třída klienta: `browser` / `search-bot` / `ai-bot` / `other-bot`                                                |
| `blob4`   | jméno robota (`googlebot-image`, `gptbot`, `curl`…), u prohlížeče prázdné                                       |
| `blob5`   | co klient umí podle `Accept`: `avif` / `webp` / `none`                                                          |
| `blob6`   | šířka z transformace (`640`), bez šířky prázdné                                                                 |
| `blob7`   | doručený formát: `avif` / `webp` / `png` / `jpg` / `orig`                                                       |
| `blob8`   | celá transformace po vyjednání formátu                                                                          |
| `blob9`   | `image` / `raw`                                                                                                 |
| `blob10`  | `versioned` / `legacy` (adresa bez `v123`)                                                                      |
| `blob11`  | země klienta (ISO kód)                                                                                          |
| `blob12`  | metoda (`GET` / `HEAD`)                                                                                         |
| `double1` | HTTP stav odpovědi                                                                                              |
| `double2` | `content-length` odpovědi (0 = neznámá)                                                                         |
| `double3` | bajty stažené z Cloudinary podle pravidla ve Workeru (`originBytes`; keš = 0)                                   |
| `double4` | doba subrequestu na Cloudinary do příchodu hlaviček (TTFB) v ms; 0 = bez něj                                    |

`double3` je pohodlí, ale pravidlo je zapečené do dat — po každé změně pravidla
nesou staré řádky starou verzi. Pro srovnání přes delší období proto počítej
přenos v SQL z `blob2` + `double2` (níže `origin_mb`); `if()` chce stejné typy,
tedy `0.0`, ne `0`; stejné pravidlo jako `originBytes` (vše mimo stavy z keše).
`CASE`, `trim` ani `quantiles` SQL API neumí; vážený kvantil je `quantileExactWeighted`.

Dotazy jdou přes SQL API (dashboard pro Analytics Engine neexistuje). Token:
dashboard → My Profile → API Tokens → Create Token → Account · _Account
Analytics_ · Read; Account ID je v přehledu účtu.

```sh
export CF_ACCOUNT_ID=… CF_ANALYTICS_TOKEN=…
q() { curl -s -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  --data "$1"; }
```

Kdo za posledních 7 dní tahá data z Cloudinary (přenos = kredity):

```sql
SELECT blob3 AS client, blob4 AS bot,
  SUM(_sample_interval) AS requests,
  SUM(_sample_interval * if(upper(blob2) NOT IN ('HIT', 'REVALIDATED', 'STALE', 'UPDATING'), double2, 0.0))
    / 1000000000 AS origin_gb
FROM media_proxy_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'cloudinary'
GROUP BY client, bot ORDER BY origin_gb DESC
```

Které šířky a formáty se reálně chtějí a kolik z nich mine keš (kandidáti na
vyhození = málo požadavků, hodně stažení):

```sql
SELECT blob6 AS width, blob7 AS format, blob3 AS client,
  SUM(_sample_interval) AS requests,
  SUM(_sample_interval * if(upper(blob2) NOT IN ('HIT', 'REVALIDATED', 'STALE', 'UPDATING'), double2, 0.0))
    / 1000000000 AS origin_gb
FROM media_proxy_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'cloudinary'
GROUP BY width, format, client ORDER BY requests DESC
```

Poměr zásahů keše po dnech (efekt Tiered Cache / změn variant):

```sql
SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS cache,
  SUM(_sample_interval) AS requests,
  SUM(_sample_interval * if(upper(blob2) NOT IN ('HIT', 'REVALIDATED', 'STALE', 'UPDATING'), double2, 0.0))
    / 1000000000 AS origin_gb
FROM media_proxy_requests
WHERE timestamp > NOW() - INTERVAL '14' DAY AND blob1 = 'cloudinary'
GROUP BY day, cache ORDER BY day, requests DESC
```

Kontrola předpokladu „chybějící `cf-cache-status` = keš“ (řádky s prázdným
stavem mají mít TTFB jako HIT, ne jako MISS):

```sql
SELECT blob2 AS cache,
  SUM(double4 * _sample_interval) / SUM(_sample_interval) AS avg_ms,
  quantileExactWeighted(0.9)(double4, _sample_interval) AS p90_ms,
  max(double4) AS max_ms, SUM(_sample_interval) AS requests
FROM media_proxy_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'cloudinary'
GROUP BY cache ORDER BY requests DESC
```

Kdo umí AVIF (rozhodnutí, zda vypustit WebP):

```sql
SELECT blob3 AS client, blob5 AS accepts, SUM(_sample_interval) AS requests
FROM media_proxy_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob9 = 'image'
GROUP BY client, accepts ORDER BY requests DESC
```

## Nasazení

```sh
cd workers/media-proxy
pnpm install
npx wrangler login    # jednorázově, odklik v prohlížeči
npx wrangler deploy   # vytvoří Worker + DNS media.ara.cz + certifikát
npx wrangler secret put CLOUDINARY_API_SECRET   # podpis transformací (viz Chování 4)
```

Předpoklady v Cloudflare účtu (jednorázově, dashboard):

- R2 bucket `aracze` → Settings → Custom Domains → připojit `media-backup.ara.cz`.
- Zóna ara.cz → Images → Transformations → **Enable** (5 000 unikátních
  variant/měsíc zdarma; pro delší výpadek mít platební metodu — 0,50 $/1 000).
- Doporučeno: Caching → Tiered Cache → Smart Tiered Cache (zdarma) a Workers
  Paid (5 $/měs.) — free plán = 100 000 požadavků/den a po překročení Worker
  do půlnoci UTC nepodává nic.

## Testy

```sh
pnpm test        # unit testy čistých funkcí (media-path)
pnpm typecheck
```

Požární cvičení fallbacku (ověření zálohy z R2 bez čekání na skutečný výpadek):

```sh
npx wrangler deploy --var CLOUDINARY_ORIGIN:https://res.cloudinary.com/neexistujici-cloud
# ... curl ověření, pak vrátit:
npx wrangler deploy
```
