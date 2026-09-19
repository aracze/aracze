import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // jsdom (isomorphic-dompurify) nesmi byt zabaleny bundlerem: (1) cte sve
  // soubory relativne k __dirname (ENOENT na default-stylesheet.css),
  // (2) zabaleny v dev rezimu je extremne pomaly - stranky s rich textem
  // pak trvaji desitky sekund. Externalizovany bezi nativne z node_modules.
  serverExternalPackages: [
    'jsdom',
    'isomorphic-dompurify',
    // Databázová/serverová vrstva Payloadu MUSÍ běžet nativně z node_modules.
    // Zabalená Turbopackem v dev je extrémně pomalá (dotaz 222 ms → 29 s v RSC).
    'payload',
    '@payloadcms/db-postgres',
    'drizzle-orm',
    'pg',
    // GA4 sync endpoint (gRPC/protobuf) — zabalené bundlerem stejně extrémně
    // pomalé/zamrzávající jako jsdom výše.
    '@google-analytics/data',
  ],
  experimental: {
    serverActions: {
      // Avatar smí mít 2 MB (viz kolekce Avatars). Výchozí strop server akcí je
      // 1 MB, takže by se větší fotka utnula dřív, než by se dostala k validaci.
      // POZOR: platí pro VŠECHNY server akce, ne jen pro nahrávání fotky —
      // Next to jinak nastavit neumí. Vlastní meze (délky textů, velikost
      // souboru) proto musí hlídat každá akce sama, viz src/lib/profile-limits.ts.
      bodySizeLimit: '3mb',
    },
  },
  images: {
    // Zmenšování obrázků dělá Cloudinary (viz loader), ne Next server —
    // funguje to tak i se standalone outputem bez další zátěže.
    loader: 'custom',
    loaderFile: './src/lib/cloudinary-loader.ts',
    // Výchozí sada Next.js obsahuje i 2048 a 3840 px — 4K varianty dělaly
    // většinu přenosů z Cloudinary. Strop 1920 px drží i loader
    // (MAX_IMAGE_WIDTH v cloudinary-loader.ts), tady jen srcset větší
    // varianty vůbec nenabízí.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  // SEO redirecty ze starého (Grails) webu na nový. Držet zde, ne v Payload
  // kolekci - jde o malou, stabilní sadu 301, ne o obsah editovaný v adminu.
  async redirects() {
    return [
      // Provizní redirecty /go/* NEJSOU tady — čtou cíle z adminu (globál
      // Homepage → Připrav se na cestu), takže běží jako route handlery
      // v src/app/(frontend)/go/. Statický redirect by cíl zapekl do buildu.
      // Starý web měl /kontakt jako statickou stránku s kontaktními údaji;
      // na novém webu ji nahrazuje /o-nas.
      {
        source: '/kontakt',
        destination: '/o-nas',
        permanent: true,
      },
      // Ikona zásuvky typu C bývala PNG (i na starém webu); teď jsou všechny
      // typy SVG a skládají se podle titulku karty (outletIconsHtml).
      {
        source: '/assets/outlets/typeC.png',
        destination: '/assets/outlets/TypeC.svg',
        permanent: true,
      },
      // Spolupráce a Pírka byly sekce redakčního systému starého webu (nábor
      // autorů, resp. bodování příspěvků). Na novém webu ten systém není a
      // nechystá se, takže tu nejsou náhradní stránky — jen nejbližší smysluplný
      // cíl. Obojí má Google zaindexované z odkazů v patičce starého webu.
      {
        // Nábor autorů: na novém webu o něm mluví „O nás" (kdo web píše).
        source: '/spoluprace',
        destination: '/o-nas',
        permanent: true,
      },
      {
        // Pírka byla bodovací hra pro přispěvatele — nemá nic, co by ji
        // nahradilo, takže domů.
        source: '/pirka',
        destination: '/',
        permanent: true,
      },
      {
        // Rozbitý duplikát z migrace: norský text o jídle omylem pod
        // Portugalskem (časové razítko ve slugu = automatické přejmenování při
        // srážce). Smazaný 17. 8. 2026 skriptem cleanup-currency-timezone.sql;
        // správnou stránku má Norsko, tak tam posíláme i zaindexované odkazy.
        source: '/portugalsko/jidlo1726123756332',
        destination: '/norsko/jidlo',
        permanent: true,
      },
      // Kalifornie jako mezistupeň v adrese - stará i nová hierarchie ji
      // z URL schovávají (viz Pages.includeInChildUrlPaths), ale konkrétně
      // tyhle staré odkazy ji ještě obsahují (ověřeno proti aktuálním fullSlug
      // v DB). MUSÍ být před obecnými pravidly níže, jinak "clanky*" pravidlo
      // shodí jen kategorii a "kalifornie" zůstane v URL (viz odkaz na
      // průvodce San Franciskem, který má oba problémy najednou).
      {
        source: '/usa/kalifornie/san-francisco',
        destination: '/usa/san-francisco',
        permanent: true,
      },
      {
        source: '/usa/kalifornie/narodni-park-yosemite',
        destination: '/usa/narodni-park-yosemite',
        permanent: true,
      },
      {
        source: '/usa/kalifornie/los-angeles',
        destination: '/usa/los-angeles',
        permanent: true,
      },
      {
        source:
          '/usa/kalifornie/san-francisco/:category(clanky|clanky-cestopisy|clanky-a-cestopisy)/:slug',
        destination: '/usa/san-francisco/:slug',
        permanent: true,
      },
      // Legacy podstránka profilu (/profil/<user>/clanky/...) NENÍ článek -
      // "clanky" tu značí sekci profilu, řeší ji už
      // src/app/(frontend)/profil/[username]/[...rest]/page.tsx (přesměruje
      // na /profil/<user>#clanky). MUSÍ být před obecným pravidlem níže,
      // jinak by ho to obecné pravidlo předběhlo a smazalo kotvu na sekci.
      {
        source: '/profil/:username/clanky/:rest*',
        destination: '/profil/:username#clanky',
        permanent: true,
      },
      // Články pod zrušeným kořenem /destinace. MUSÍ být před obecným pravidlem
      // pro "clanky" níž - to by ze staré adresy udělalo /destinace/{slug}
      // a odtud /{slug}, což článek na novém webu nemá (bydlí pod místem, resp.
      // rubrikou, o které píše - stejná adresa, jakou udává `rel=canonical`).
      {
        source: '/destinace/clanky/10-uzasnych-mist-k-navsteve-pred-tim-nez-zmizi',
        destination: '/top-ze-sveta/10-uzasnych-mist-k-navsteve-pred-tim-nez-zmizi',
        permanent: true,
      },
      {
        source: '/destinace/clanky/krasa-a-tajemstvi-evropskych-termalnich-lazni',
        destination: '/evropa/krasa-a-tajemstvi-evropskych-termalnich-lazni',
        permanent: true,
      },
      {
        source: '/destinace/clanky/nejkrasnejsi-ledove-sochy-a-jejich-vystavy',
        destination: '/festivaly-a-udalosti/nejkrasnejsi-ledove-sochy-a-jejich-vystavy',
        permanent: true,
      },
      {
        source: '/destinace/clanky/sri-lanka-3-tydny-v-upocenem-raji',
        destination: '/sri-lanka/sri-lanka-3-tydny-v-upocenem-raji',
        permanent: true,
      },
      // Staré URL článků měly vždy segment "clanky" mezi rodičovskou stránkou
      // a slugem článku (`{rodic}/clanky/{slug}`), nový web ho v URL nemá
      // (`{rodic}/{slug}`) - viz src/app/(frontend)/[...slug]. Zahrnuje i
      // starší varianty téhož segmentu, které Grails postupně nahrazoval
      // jednotným "clanky" (a část odkazů ještě používá).
      {
        source: '/:path+/:category(clanky|clanky-cestopisy|clanky-a-cestopisy)/:slug',
        destination: '/:path+/:slug',
        permanent: true,
      },
      // Staré VÝPISOVÉ podstránky míst. V Grails to byly samostatné stránky
      // (`{rodic}/mista` = DESTINATION_LIST, `{rodic}/clanky` = ARTICLE_LIST);
      // na novém webu jsou to sekce na stránce rodiče, takže míříme na kotvu.
      // Ověřeno proti staré DB: 495x `%/mista`, 673x `%/clanky` - a v aktuální
      // sitemapě (3155 URL) nekončí na tyhle segmenty ANI JEDNA stránka, takže
      // pravidlo nemá co zastínit. POZOR: `prakticke-informace` a `ubytovani`
      // sem nepatří - to jsou na novém webu skutečné podstránky (71, resp. 8).
      // MUSÍ být až za pravidlem pro články výše: tohle chytá jen adresu, která
      // segmentem končí, takže `{rodic}/clanky/{slug}` propadne správně tam.
      {
        source: '/:path+/:section(mista|clanky|clanky-cestopisy|clanky-a-cestopisy)',
        destination: '/:path+#clanky',
        permanent: true,
      },
      // Staré segmenty `turisticke-cile/{zajimavosti|aktivity|zabava}` mezi místem
      // a cílem. Grails je z adresy obvykle sám vyhazoval (Page.groovy:
      // `uniqueUrl - "turisticke-cile/" - "zajimavosti/" ...`), takže ve staré DB
      // nemají ani jednu stránku - Google je ale pořád zkouší (9 adres v exportu
      // 19. 9. 2026). Segment byl vždy v MNOŽNÉM čísle.
      {
        source: '/:path+/turisticke-cile/:kind(zajimavosti|aktivity|zabava)/:slug',
        destination: '/:path+/:slug',
        permanent: true,
      },
      // —— Adresy z exportu Search Console (19. 9. 2026) ————————————————————
      // Níž jsou jednotlivé staré adresy, ne obecná pravidla: hierarchie se
      // stěhovala po kusech, takže `{starý předek}/:rest*` by shodil i adresy,
      // které dál platí (/novy-zeland/jizni-ostrov/lake-tekapo,
      // /usa/kalifornie/pocasi). Prefixové pravidlo je proto jen tam, kde se
      // celá větev opravdu přestěhovala.
      //
      // Keflavík je dnes pod poloostrovem Reykjanes.
      {
        source: '/island/keflavik',
        destination: '/island/poloostrov-reykjanes/keflavik',
        permanent: true,
      },
      {
        source: '/island/keflavik/:rest*',
        destination: '/island/poloostrov-reykjanes/keflavik/:rest*',
        permanent: true,
      },
      // Grand Canyon dostal vlastní stránku, oba jeho okraje se pod ni přesunuly.
      { source: '/usa/north-rim', destination: '/usa/grand-canyon/north-rim', permanent: true },
      {
        source: '/usa/north-rim/:rest*',
        destination: '/usa/grand-canyon/north-rim/:rest*',
        permanent: true,
      },
      { source: '/usa/south-rim', destination: '/usa/grand-canyon/south-rim', permanent: true },
      {
        source: '/usa/south-rim/:rest*',
        destination: '/usa/grand-canyon/south-rim/:rest*',
        permanent: true,
      },
      // Novozélandská města visela pod Jižním ostrovem, dnes jsou přímo pod zemí
      // (samotný Jižní ostrov ale existuje dál, proto výčet a ne `/:rest*`).
      {
        source:
          '/novy-zeland/jizni-ostrov/:mesto(hokitika|queenstown|fox-glacier|arthurs-pass)/:rest*',
        destination: '/novy-zeland/:mesto/:rest*',
        permanent: true,
      },
      {
        source: '/novy-zeland/jizni-ostrov/:mesto(hokitika|queenstown|fox-glacier|arthurs-pass)',
        destination: '/novy-zeland/:mesto',
        permanent: true,
      },
      // Kalifornie zmizela z adres měst (viz pravidla výš) i z jejich podstránek.
      // Až ZA pravidly pro `clanky`, aby si je nevzalo tohle obecnější.
      {
        source: '/usa/kalifornie/:mesto(san-francisco|los-angeles|narodni-park-yosemite)/:rest*',
        destination: '/usa/:mesto/:rest*',
        permanent: true,
      },
      // Kontinenty: „Austrálie a Oceánie" se zkrátila, „Jižní Amerika" se
      // sloučila do Ameriky.
      { source: '/australie-oceanie', destination: '/australie', permanent: true },
      { source: '/australie-oceanie/:rest*', destination: '/australie/:rest*', permanent: true },
      { source: '/jizni-amerika', destination: '/amerika', permanent: true },
      { source: '/jizni-amerika/:rest*', destination: '/amerika/:rest*', permanent: true },
      // Rubriky vylezly ze společného rozcestníku /inspirace přímo pod kořen.
      { source: '/inspirace', destination: '/', permanent: true },
      { source: '/inspirace/:rest*', destination: '/:rest*', permanent: true },
      // /destinace byl kořen stromu míst starého webu; dnes je jím rovnou mapa
      // světa na homepage.
      { source: '/destinace', destination: '/', permanent: true },
      { source: '/destinace/:rest*', destination: '/:rest*', permanent: true },
      // Nejstarší vrstva adres: místa ještě bez země v cestě.
      { source: '/chania', destination: '/recko/kreta/chania', permanent: true },
      {
        source: '/agios-nikolaos/:rest*',
        destination: '/recko/kreta/agios-nikolaos/:rest*',
        permanent: true,
      },
      { source: '/agios-nikolaos', destination: '/recko/kreta/agios-nikolaos', permanent: true },
      {
        source: '/klaster-moni-arkadiou',
        destination: '/recko/kreta/klaster-moni-arkadiou',
        permanent: true,
      },
      { source: '/kreta', destination: '/recko/kreta', permanent: true },
      { source: '/korfu', destination: '/recko/korfu', permanent: true },
      { source: '/kassiopi', destination: '/recko/korfu/kassiopi', permanent: true },
      { source: '/palia-perithia', destination: '/recko/korfu/palia-perithia', permanent: true },
      { source: '/ostruvek-vidos', destination: '/recko/korfu/ostruvek-vidos', permanent: true },
      { source: '/kos', destination: '/recko/kos', permanent: true },
      { source: '/santorini', destination: '/recko/santorini', permanent: true },
      { source: '/delft', destination: '/nizozemsko/delft', permanent: true },
      { source: '/kinderdijk', destination: '/nizozemsko/kinderdijk', permanent: true },
      { source: '/lake-district', destination: '/anglie/lake-district', permanent: true },
      { source: '/st-albans', destination: '/anglie/st-albans', permanent: true },
      // Místa, která se v CMS přestěhovala pod svého skutečného předka.
      {
        source: '/portugalsko/paul-do-mar',
        destination: '/portugalsko/madeira/paul-do-mar',
        permanent: true,
      },
      {
        source: '/rumunsko/sucevia',
        destination: '/rumunsko/klastery-jizni-bukoviny/sucevia',
        permanent: true,
      },
      {
        source: '/rumunsko/klaster-curtea-de-arges',
        destination: '/rumunsko/valassko/klaster-curtea-de-arges',
        permanent: true,
      },
      { source: '/italie/rim/vatikan', destination: '/italie/vatikan', permanent: true },
      // Useknutý odkaz na Achilleion (starý web měl v adrese jen část slugu).
      {
        source: '/recko/korfu/letohradek-',
        destination: '/recko/korfu/letohradek-cisarovny-sissi-achilleion',
        permanent: true,
      },
      // Články, které starý web držel v kořeni `/clanky/{slug}` (dnes jsou pod
      // místem, o kterém píšou - cíl je jejich DOMOVSKÁ stránka, tedy tatáž
      // adresa, kterou udává `rel=canonical`).
      {
        source: '/clanky/5-romantickych-mest-pro-oslavu-valentyna-v-evrope',
        destination: '/evropa/5-romantickych-mest-pro-oslavu-valentyna-v-evrope',
        permanent: true,
      },
      {
        source: '/clanky/krasa-a-tajemstvi-evropskych-termalnich-lazni',
        destination: '/evropa/krasa-a-tajemstvi-evropskych-termalnich-lazni',
        permanent: true,
      },
      {
        source: '/clanky/nejlepsi-evropske-hudebni-festivaly-letosniho-leta',
        destination: '/evropa/nejlepsi-evropske-hudebni-festivaly-letosniho-leta',
        permanent: true,
      },
      {
        source: '/clanky/nejoblibenejsi-evropske-destinace-pro-leto',
        destination: '/evropa/nejoblibenejsi-evropske-destinace-pro-leto',
        permanent: true,
      },
      {
        source: '/clanky/skocjanske-jeskyne-prirodni-poklad-slovinska',
        destination: '/slovinsko/skocjanske-jeskyne-prirodni-poklad-slovinska',
        permanent: true,
      },
      {
        source: '/clanky/tajemstvi-finske-sauny',
        destination: '/finsko/tajemstvi-finske-sauny',
        permanent: true,
      },
      {
        source: '/clanky/zeme-nezapadajiciho-slunce',
        destination: '/norsko/zeme-nezapadajiciho-slunce',
        permanent: true,
      },
      // Zkrácené adresy 15 turistických cílů, které nový web nesl od migrace do
      // 19. 9. 2026, než dostaly zpět slug rovný názvu (viz
      // scripts/seo-canonical-and-slugs.ts). Krátkou variantu mohl Google mezitím
      // zaindexovat, tak ať nepadá.
      {
        source: '/anglie/windsor/castle',
        destination: '/anglie/windsor/windsor-castle',
        permanent: true,
      },
      {
        source: '/kypr/paphos/acropolis',
        destination: '/kypr/paphos/paphos-acropolis',
        permanent: true,
      },
      {
        source: '/recko/lefkada/nidri/dimossari-waterfalls',
        destination: '/recko/lefkada/nidri/nidri-dimossari-waterfalls',
        permanent: true,
      },
      {
        source: '/severni-irsko/armagh/gaol',
        destination: '/severni-irsko/armagh/armagh-gaol',
        permanent: true,
      },
      {
        source: '/severni-irsko/armagh/county-museum',
        destination: '/severni-irsko/armagh/armagh-county-museum',
        permanent: true,
      },
      {
        source: '/tunisko/djerba/explore-park',
        destination: '/tunisko/djerba/djerba-explore-park',
        permanent: true,
      },
      {
        source: '/belorusko/brest/fortress',
        destination: '/belorusko/brest/brest-fortress',
        permanent: true,
      },
      {
        source: '/novy-zeland/hokitika/gorge',
        destination: '/novy-zeland/hokitika/hokitika-gorge',
        permanent: true,
      },
      {
        source: '/recko/santorini/foto-safari',
        destination: '/recko/santorini/santorini-foto-safari',
        permanent: true,
      },
      {
        source: '/chorvatsko/ostrov-krk/baska/akvarium',
        destination: '/chorvatsko/ostrov-krk/baska/baska-akvarium',
        permanent: true,
      },
      {
        source: '/nemecko/konstanz/minster',
        destination: '/nemecko/konstanz/konstanz-minster',
        permanent: true,
      },
      {
        source: '/usa/fairbanks/ice-museum',
        destination: '/usa/fairbanks/fairbanks-ice-museum',
        permanent: true,
      },
      {
        source: '/polsko/lodz/pohadkova-lodz-bajkowa',
        destination: '/polsko/lodz/lodz-pohadkova-lodz-bajkowa',
        permanent: true,
      },
      {
        source: '/thajsko/chiang-mai/grand-canyon',
        destination: '/thajsko/chiang-mai/chiang-mai-grand-canyon',
        permanent: true,
      },
      {
        source: '/myanmar/mingun/pahtodawgyi-pagoda',
        destination: '/myanmar/mingun/mingun-pahtodawgyi-pagoda',
        permanent: true,
      },
      // Podstránky „Praktické informace", které na novém webu nevznikly - místo
      // 404 posíláme na jejich místo (praktické informace má v panelu u sebe).
      { source: '/evropa/prakticke-informace', destination: '/evropa', permanent: true },
      { source: '/italie/rim/prakticke-informace', destination: '/italie/rim', permanent: true },
      {
        source: '/novy-zeland/severni-ostrov/prakticke-informace',
        destination: '/novy-zeland/severni-ostrov',
        permanent: true,
      },
      {
        source: '/peru/ica-a-nazca/prakticke-informace',
        destination: '/peru/ica-a-nazca',
        permanent: true,
      },
      {
        source: '/peru/region-arequipa/prakticke-informace',
        destination: '/peru/region-arequipa',
        permanent: true,
      },
      { source: '/recko/kreta/prakticke-informace', destination: '/recko/kreta', permanent: true },
      {
        source: '/recko/rhodos/prakticke-informace',
        destination: '/recko/rhodos',
        permanent: true,
      },
      {
        source: '/rumunsko/valassko/prakticke-informace',
        destination: '/rumunsko/valassko',
        permanent: true,
      },
      {
        source: '/skotsko/narodni-park-loch-lomond-a-trossachs/prakticke-informace',
        destination: '/skotsko/narodni-park-loch-lomond-a-trossachs',
        permanent: true,
      },
      {
        source: '/skotsko/perthshire/prakticke-informace',
        destination: '/skotsko/perthshire',
        permanent: true,
      },
    ]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
