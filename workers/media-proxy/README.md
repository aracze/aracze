# media-proxy — Cloudflare Worker pro media.ara.cz

Proxy před Cloudinary (cloud `ara`) s dlouhou edge keší + nouzový režim ze
zálohy v R2 (bucket `aracze`, plní ho hook v `src/collections/Media.ts`).
Frontend na proxy přepisuje adresy přes `toMediaProxy`
(`src/lib/cloudinary-loader.ts`), řízeno `NEXT_PUBLIC_MEDIA_BASE_URL`.

## Chování

1. **Normální provoz:** `media.ara.cz/<cesta>` → `res.cloudinary.com/ara/<cesta>`,
   odpověď se keší na edge ~1 rok (adresy jsou verzované). `f_auto` se před keší
   přepisuje na konkrétní formát podle `Accept` (Cloudflare keš ignoruje `Vary`).
2. **Výpadek Cloudinary** (ne-2xx / timeout 10 s): podá se záloha z R2 —
   zmenšená přes Cloudflare Image Transformations (zdroj `media-backup.ara.cz`
   = custom doména bucketu), při nedostupnosti transformací surový originál.
   Krátká keš (5 min), ať se po oživení rychle vrátí normál.
3. **Ochrany:** jen GET/HEAD; jen `/image/upload/` a `/raw/upload/`
   (`/image/fetch/` = 404); transformační segment musí projít whitelistem
   (jinak 400 — nikdo přes nás nerazí varianty a nepálí kredity);
   query string se ignoruje; avataři v R2 nejsou → při výpadku 404.
4. **Podpis transformací (Strict transformations):** na Cloudinary účtu je
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
5. **robots.txt pro doménu fotek:** `media.ara.cz/robots.txt` zakazuje
   trénovacím AI botům (GPTBot, ClaudeBot, CCBot, Amazonbot, Bytespider…)
   vše, ostatním povoluje vše. Pravidla robots.txt platí per hostname —
   zákaz v `src/app/robots.ts` na ara.cz na fotky nedosáhl a bot, který
   adresy fotek už zná, si je směl dál stahovat (v srpnu 2026 dělali
   trénovací crawleři přes polovinu přenosů z Cloudinary). Seznam botů je
   zrcadlem `TRAINING_BOTS` v appu, shodu hlídá test. Vyhledávací a
   asistenční boti zůstávají povolení (citace v AI odpovědích vodí lidi).

## Měření provozu (Workers Analytics Engine)

Worker zapisuje ke každému požadavku jeden datový bod do datasetu
`media_proxy_requests` (binding `STATS`, `src/telemetry.ts`). Účel: rozhodovat
o počtu variant fotek (šířky, formáty) a o keši podle skutečného provozu, ne
odhadem — Cloudinary účtuje jen to, co si Worker musí stáhnout (přenos)
a co musí vyrobit (transformace), a to dělají hlavně roboti, ne návštěvníci.
Bez bindingu (lokální `wrangler dev`, testy) se nic neměří. Free plán: 100 000
bodů/den (= limit požadavků Workeru), retence 3 měsíce, při špičkách Cloudflare
vzorkuje — proto se v dotazech sčítá `_sample_interval`, ne `COUNT(*)`.
Žádné osobní údaje: třída klienta, země, adresa obrázku.

Schéma (pořadí je smlouva, hlídá ho test `test/telemetry.test.ts`):

| Sloupec   | Obsah                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| `index1`  | výsledek (viz `blob1`) — klíč vzorkování                                         |
| `blob1`   | výsledek: `cloudinary` / `fallback` (R2) / `unavailable` / `rejected` / `robots` |
| `blob2`   | `cf-cache-status` subrequestu na Cloudinary (`HIT`, `MISS`, `EXPIRED`… / `''`)   |
| `blob3`   | třída klienta: `browser` / `search-bot` / `ai-bot` / `other-bot`                 |
| `blob4`   | jméno robota (`googlebot-image`, `gptbot`, `curl`…), u prohlížeče prázdné        |
| `blob5`   | co klient umí podle `Accept`: `avif` / `webp` / `none`                           |
| `blob6`   | šířka z transformace (`640`), bez šířky prázdné                                  |
| `blob7`   | doručený formát: `avif` / `webp` / `png` / `jpg` / `orig`                        |
| `blob8`   | celá transformace po vyjednání formátu                                           |
| `blob9`   | `image` / `raw`                                                                  |
| `blob10`  | `versioned` / `legacy` (adresa bez `v123`)                                       |
| `blob11`  | země klienta (ISO kód)                                                           |
| `blob12`  | metoda (`GET` / `HEAD`)                                                          |
| `double1` | HTTP stav odpovědi                                                               |
| `double2` | `content-length` odpovědi (0 = neznámá)                                          |
| `double3` | bajty skutečně stažené z Cloudinary (jen `cloudinary` a ne-HIT; HIT = 0)         |

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
  SUM(_sample_interval * double3) / 1e9 AS origin_gb
FROM media_proxy_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'cloudinary'
GROUP BY client, bot ORDER BY origin_gb DESC
```

Které šířky a formáty se reálně chtějí a kolik z nich mine keš (kandidáti na
vyhození = málo požadavků, hodně stažení):

```sql
SELECT blob6 AS width, blob7 AS format, blob3 AS client,
  SUM(_sample_interval) AS requests,
  SUM(_sample_interval * double3) / 1e9 AS origin_gb
FROM media_proxy_requests
WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'cloudinary'
GROUP BY width, format, client ORDER BY requests DESC
```

Poměr zásahů keše po dnech (efekt Tiered Cache / změn variant):

```sql
SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS cache,
  SUM(_sample_interval) AS requests,
  SUM(_sample_interval * double3) / 1e9 AS origin_gb
FROM media_proxy_requests
WHERE timestamp > NOW() - INTERVAL '14' DAY AND blob1 = 'cloudinary'
GROUP BY day, cache ORDER BY day, requests DESC
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
