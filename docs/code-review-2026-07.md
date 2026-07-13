# Code review — audit podle skillů (Payload + Next.js/React + a11y)

**Datum:** 2026-07-12 · **Rozsah:** celý `src/` (99 souborů, ~11k řádků)
**Metoda:** 5 paralelních review agentů, každý optikou nainstalovaného skillu
(`payload`, `vercel-react-best-practices`, `web-design-guidelines`) + projektových
pravidel v `AGENTS.md` (ta mají přednost).

Legenda priorit: 🔴 vysoká · 🟡 střední · 🟢 nízká.
Výkonové nálezy jsou **měřitelné hypotézy** — ověřovat sondou/měřením (v dev bez cache).

## Stav aplikace (2026-07-12)

Aplikováno a ověřeno (tsc + běh v dev): **S1, S2, S3** (bezpečnost), **P1, P3** (výkon
server), **C1** (seznamy článků → Server Component + lehký VM, bez plných těl do
klienta), **C2** (rozdělení `utils.ts` do `rich-text-html.ts` + sanitizace loga v
headeru přesunuta na server → DOMPurify není v klientském bundlu).
Zbývá (neaplikováno): datová integrita (D1–D9), a11y (A1–A10), a drobné výkonové
(P2, P4–P7, C3–C6). Nic zatím necommitnuto.

---

## 1) Bezpečnost & přístupová práva

### 🔴 S1 — `/api/init-db`: destruktivní GET chráněný jen tajemstvím v URL

`src/endpoints/initDb.ts:4`, registrace `src/payload.config.ts:123`
Endpoint dělá `DROP SCHEMA public CASCADE` (ztráta dat). Problémy: `method: 'get'`
(spustitelné prefetchem/`<img>`/historií), autorizace **jen `?secret=…` v query**
(uniká do access-logů, historie, `Referer`; navíc jde o `PAYLOAD_SECRET` = podpis všech JWT),
**bez kontroly `req.user`/role**. Hardcoded SQL je navíc zastaralé (chybí tabulky comments,
transactions, verze/drafty…) → při použití rozbije DB.
**Porušuje:** ENDPOINTS.md „not authenticated by default – check `req.user`"; least privilege.
**Oprava:** `method: 'post'` + `if (!req.user?.roles?.includes('admin')) throw new APIError('Forbidden', 403)`;
tajemství z hlavičky, ne z query; v produkci endpoint vypnout (`ALLOW_INIT_DB` gate).

### 🔴 S2 — Pages/Articles/Media nemají `create/update/delete` → default „jakýkoli přihlášený"

`src/collections/Pages.ts:25`, `src/collections/Articles.ts:29`, `src/collections/Media.ts:65`
Neuvedené access funkce Payload doplní na `Boolean(user)`. Role `user` (výchozí, stovky
migrovaných účtů) tak může vytvářet/přepisovat/**mazat** obsah. `Users` navíc nemá
`access.admin` (`Users.ts:33`) → přihlášený `user` se dostane do `/admin`.
**Porušuje:** ACCESS-CONTROL.md „Default to restrictive / Fail Secure"; least privilege.
**Oprava:** explicitní `create/update/delete` (admin/editor) na Pages/Articles/Media

- `access.admin` na Users.
  ⚠️ Reálná zneužitelnost závisí na tom, zda migrované `user` účty mají funkční login heslo —
  pravidlo opravit tak jako tak (obrana do hloubky).

### 🟡 S3 — `init-db` vrací klientovi stack trace

`src/endpoints/initDb.ts:188` — odpověď obsahuje `stack` a `detail` (únik cest, schématu).
**Oprava:** logovat serverově (`payload.logger.error`), klientovi generické hlášení.

### 🟡 S4 — Comments: pole `author`/`legacyCommentId` bez field-level `read`

`src/collections/Comments.ts:149`, `:185` — až se doplní veřejné zobrazení komentářů, hrozí
únik `users` objektu. **Oprava:** field-level `access.read: isAdminFieldAccess`, nebo
`createdByPublic` virtuální pole; při veřejném čtení vždy `overrideAccess: false`.

### 🟢 S5 — `legacyPageId` má omezený jen `update`, ne `create`

`src/collections/Pages.ts:255` — doplnit `create: isAdminFieldAccess` (symetrie s Articles).

### 🟢 S6 — `dbDump`/`dbImport` bez CSRF tokenu

`src/endpoints/dbDump.ts:136`, `dbImport.ts:179` — riziko nízké (cookie SameSite=Lax,
cors/csrf nenastaveny). Jen k zvážení.

**✅ Dobře:** datová vrstva důsledně `overrideAccess: false`; anonymizace autora přes
`createdByPublic` (bezpečná podmnožina); RBAC na `roles` (saveToJWT + field access);
`dbDump`/`dbImport` ověřují admina serverově; field access vrací jen boolean.

---

## 2) Datová integrita & model

### 🔴 D1 — Těžké síťové I/O uvnitř transakce (`Media.afterChange`)

`src/collections/Media.ts:136` (`fetch` Cloudinary), `:144` (upload R2) — několik sekund
síťové práce drží transakci i spojení z poolu → riziko vyčerpání poolu při souběhu.
**Oprava:** v hooku jen `req.payload.jobs.queue(...)`, vlastní stahování/upload v tasku
mimo transakci. (Loop-guard `skipR2Backup` zachovat.)

### 🔴 D2 — Slug bez `unique` → kolidující veřejné URL

`src/fields/slug.ts:4` — jen `index`, ne `unique`; `formatSlug` kolize neřeší. Dva články
pod stejnou stránkou / dvě sourozenecké stránky se stejným slugem → stejná URL → lookup
vrátí tiše špatný obsah. **Oprava:** `unique: true` na `slug` (zvážit i na `fullSlug`),
nebo přejít na oficiální `slugField`.

### 🟡 D3 — `Pages.createdByPublic`: over-fetch, žádná cache, `as any`

`src/collections/Pages.ts:402` — `findByID` bez `select` (tahá celý user dokument), chybí
`req.context.authorCache` (kterou Articles má), `as any`. **Oprava:** sjednotit s
`Articles.createdByPublic` (`select` + sdílená cache + typ), ideálně jeden sdílený helper.

### 🟡 D4 — Chybí `req` v `seoPlugin.generateURL`

`src/payload.config.ts:163` — `findByID` bez `req` běží mimo transakci/kontext.
**Oprava:** předat `req`.

### 🟡 D5 — `Comments.read`: `limit: 0` = bez limitu

`src/collections/Comments.ts:26` — test existence draftů načte všechny (má být `limit: 1`);
druhý dotaz tahá ID všech publikovaných stránek (roste s tabulkou) na každý veřejný read.

### 🟡 D6 — Chybí `maxDepth` na relacích

`src/collections/Articles.ts:169`, `Pages.ts:279`, `:331` — self-ref `parent`/`breadcrumbs.doc`
a article→page bez `maxDepth`. Web jede na `depth:0` (dopad hlavně na admin/API).
**Oprava:** `maxDepth: 1` (sjednotit s Transactions).

### 🟡 D7 — Drift kurátorovaných typů: `GlobalHeader`

`src/types/payload.ts:46` deklaruje `navItems: NavLink[]` + `login`, reálný Header
(`src/globals/Header.ts:21`) má `navItems: {label, link}[]` a žádné `login`.
**Oprava:** srovnat typ se schématem, ideálně odvodit z `@/payload-types` (drift shodí `tsc`).

### 🟢 D8 — Header vs Footer: `{label,link}` vs `{label,href}`

`src/globals/Header.ts:21` vs `src/globals/Footer.ts:24` — sjednotit (nejlépe `href`).

### 🟢 D9 — Revalidační hooky bez `context` guardu

`src/hooks/revalidation.ts:51`, `:94` — při bulk importu spustí `revalidateTag` za každý
dokument. Zvážit přeskočení přes `context` flag.

**✅ Dobře:** vnořené operace v hoocích důsledně předávají `req` (kromě D4); loop-guard
v Media správně; cache tagy v `revalidation.ts` přesně sedí na `lib/payload.ts`/`search.ts`;
`Articles.createdByPublic` je vzorové; smysluplné indexy; Postgres transakce zapnuté.

---

## 3) Výkon — server-side & data-fetching (měřitelné hypotézy)

### 🔴 P1 — Detail článku 2× těžký fetch místo lehkého

`src/components/layout/article/article.tsx:154` (`resolveContextPages`) — tahá PLNÁ data
kontextové i kořenové stránky (včetně všech článků rodiče `limit:100`, 3× enrich obrázků,
autor, rich-text obrázky), ačkoli článek potřebuje jen lehká pole + počty. ~16 dotazů → ~5.
**Oprava:** `fetchPageByFullSlug` → `fetchPageLightByFullSlug`; `hasArticles` přes
`pageHasArticles(id)` (levný count přes FK). **Ověřit:** `console.time` + počet SQL dotazů.

### 🟡 P2 — Enrich obrázků = 3–5 samostatných `media` dotazů místo batch

`src/lib/payload.ts:461` — `enrichFeaturedImages` 3× + avatar + rich-text.
**Oprava:** posbírat všechna featured-image `id` (page+articles+children) do jednoho `Set`,
jeden `fetchMediaUrlsByIds`, pak mapu aplikovat. **Ověřit:** počet `media` SELECTů.

### 🟡 P3 — Weather bez cache (proti vlastnímu pravidlu o externích API)

`src/app/(frontend)/api/weather/route.ts:32` — `fetch` bez `next.revalidate`; každý request
= 1 volání OpenWeather. Kurzy to řeší (`exchange-rate.ts:17`), počasí ne.
**Oprava:** `fetch(url, { next: { revalidate: 600 } })`.

### 🟡 P4 — `pageHasArticlesBySlug`: pomalý relační dotaz + zbytečný prefire

`src/lib/payload.ts:634`, prefire `src/app/(frontend)/[...slug]/page.tsx:91` — `count` přes
`mainPage.fullSlug` (join), přitom existuje rychlá `pageHasArticles(id)` přes FK; prefire
běží pro každý prefix slugu i na článkových URL (výsledek se nepoužije).

### 🟢 P5 — `fetchAncestorChain` sériová smyčka

`src/components/layout/page/page.tsx:227` — vodopád maskovaný prefirem + `cache()`. Křehké.
**Oprava:** explicitní `Promise.all` nad prefixy.

### 🟢 P6 — Fuse index se staví per request

`src/lib/search.ts:53` — `new Fuse(data)` nad ~200 dokumenty na každý `/api/search`.
Zvážit **prod-only** memoizaci (dev musí zůstat čerstvé). Jen když měření ukáže dopad.

### 🟢 P7 — No-op enrich větev / autor i tam, kde se nevykreslí

`src/components/layout/page/page.tsx:28` (mrtvá větev), `src/lib/payload.ts:461`
(`resolvePageAuthorPublic` běží i pro kategorie bez autora).

**✅ Dobře:** `cached()` helper přesně dle pravidel (dev bez cache, chyby propadají ven);
`joins:false` + cílené `select` + `depth:0`; `React cache()` per-request dedup; prefire
předků paralelně; kurzy cachované 24h; layout ořezává nav strom; fonty hoistnuté; streaming
přes `loading.tsx`.

---

## 4) Výkon — React klient & bundle

### 🔴 C1 — `articles-list*` zbytečně celé `'use client'` → serializace plných těl článků

`src/components/features/articles-list.tsx:1`, `articles-list-classic.tsx:1` — kvůli jednomu
tlačítku „Zobrazit další" (`useState`) se přes RSC hranici posílá celé pole článků včetně
**plného rich-text těla** každého; `richTextToPlainText` (perex) běží na klientovi; karty
jdou do bundlu. **Oprava (island):** jádro nechat Server Component, perex/href/imageUrl
spočítat na serveru, `<ArticleCard>` renderovat server-side a předat jako `children` do
malého klientského ostrůvku, který drží jen `visibleCount`.

### 🔴 C2 — `import DOMPurify` v `utils.ts` táhne DOMPurify do klient bundlu

`src/lib/utils.ts:3` — modulový side-effect import; klientské komponenty (`articles-list`,
`collapsible-page-text` = skoro každá stránka) si z modulu berou drobné čisté helpery →
`isomorphic-dompurify` (~20 kB gz) putuje do klienta. `serverExternalPackages` řeší jen
server. **Oprava:** rozdělit `utils.ts` — čisté helpery (`cn`, `getArticleHref`,
`getArticleExcerpt`, `richTextToPlainText`…) do klientsky bezpečného modulu; sanitizaci
(`richTextToHtml`) do server modulu. **Ověřit:** `@next/bundle-analyzer`.

### 🟡 C3 — Mapa se stahuje hned po mountu, i pod přehybem

`src/components/layout/page/places-to-visit.tsx:110`, `google-map.tsx:315` — SDK (stovky kB)
se stáhne i pro uživatele, co k mapě nescrollnou. **Oprava:** gate přes `IntersectionObserver`.

### 🟡 C4 — Header řadí nav při každém renderu (re-render na hover)

`src/components/layout/header/header.tsx:114`, `:175` — `activeDropdown` stav → sort na každý
mouseenter. **Oprava:** `useMemo`. (Malá pole, jde o čistotu.)

### 🟢 C5 — Mrtvý kód `components/ui/*`

`command.tsx`, `dialog.tsx`, `input-group.tsx` (+ button/input/textarea) se nikde neimportují.
Drží závislosti (`cmdk`, `@radix-ui/react-dialog`, `cva`). Smazat nebo použít.

### 🟢 C6 — Hoist konstantních polí; listenery Maps bez `clearInstanceListeners`

`header.tsx:48`, `places-to-visit.tsx:44`, `main-content.tsx:68`; `google-map.tsx:276,303`.

**✅ Dobře:** většina UI Server Components; `google-map` singleton loader + cleanup + nonce;
`use-search` debounce + AbortController; `local-time` zarovnání na minutu + bez CLS;
AdSense `lazyOnload`; WebVitals jen v dev; Header dostává osekaný nav payload; žádné inline
komponenty; barrel importy `lucide-react` řeší Next 16 sám.

---

## 5) Přístupnost (a11y) & UX

### 🔴 A1 — Chybí `aria-current="page"` na aktivní položce menu (všude)

`src/components/layout/page/subnavigation.tsx:150`, `header.tsx:136` — data (`isActive`) už
komponenta má. **Oprava:** `aria-current={isActive ? 'page' : undefined}`.

### 🔴 A2 — Podnavigace je `<div>`, ne `<nav>`

`src/components/layout/page/subnavigation.tsx:128` — **Oprava:** `<nav aria-label="…">`.

### 🔴 A3 — Ikonové tlačítko bez `aria-label`

`src/components/features/search/header-search.tsx:84` (mobilní křížek) — **Oprava:**
`aria-label="Zavřít vyhledávání"`.

### 🔴 A4 — Chybí „Přeskočit na obsah" (skip link)

`src/app/(frontend)/layout.tsx:68` — **Oprava:** skip link + `id="obsah"` na main.

### 🟡 A5 — `<img>` místo `next/image` u avatarů

`src/components/layout/page/collapsible-page-text.tsx:81,92,156,167` — mají rozměry+alt (bez
CLS), chybí lazy. **Oprava:** `next/image` nebo `loading="lazy"`.

### 🟡 A6 — Inputy `outline-none` bez náhrady focusu

`header-search.tsx:73`, `homepage-search.tsx:47` — **Oprava:** `focus-visible:ring-2 …`.

### 🟡 A7 — Nízký kontrast `text-gray-400` (~2.8:1, pod AA)

`places-to-visit.tsx:89`, `articles-list-classic.tsx:57`, `resultlist.tsx:41`,
`homepage-search.tsx:73` — **Oprava:** min. `text-gray-500`/`600`.

### 🟡 A8 — Rozbitá hierarchie nadpisů u turistických bodů

`src/components/layout/page/expandable-tourist-point.tsx:34` — dva sourozenecké `<h2>`.
**Oprava:** `<h3>`.

### 🟡 A9/A10 — Nav regiony bez (českého) `aria-label`

`header.tsx:73`, `hero-section.tsx:37`, `main-content.tsx:208`; anglické „Breadcrumb
navigation" / „Clear search". **Oprava:** české labely („Hlavní navigace", „Drobečková
navigace", „Obsah stránky", „Vymazat hledání").

### 🟢 Drobné

Článek bez drobečků (`article.tsx:69`) · patička ne `<nav>` (`footer.tsx:67`) ·
chybí `scroll-margin-top` na kotvách nadpisů · riziko dvou `<h1>` (rich text vs hero) ·
`toSafeInternalHref` fallback `href="#"` (`google-map.tsx:46`) · chybí `meta theme-color`.

**✅ Dobře:** `<html lang="cs">`; sanitizace vzorová (DOMPurify všude s cíleným whitelistem);
obrázky bez CLS (`next/image` fill+sizes+priority); drobečky sémanticky `nav>ol>li`;
skeletony `role="status"` + drží výšku; mega menu přístupné (aria-haspopup/expanded, focus,
Escape); odkazy vs. tlačítka správně.

---

## Doporučené pořadí

1. **Bezpečnost** (S1, S2, S3) — nejvyšší priorita, malý rozsah.
2. **Výkon** (P1, C1, C2, P3) — největší hmatatelné zisky; ověřit měřením.
3. **Přístupnost** (A1–A4 rychlé výhry, pak A5–A10).
4. **Datová integrita** (D2, D4, D1, D7) — prevence tichých chyb.
