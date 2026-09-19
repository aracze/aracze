// GENEROVÁNO skriptem scripts/seo-slugy-diakritika.ts — needitovat ručně, další
// běh skriptu obsah sloučí (podle zdrojové adresy) a přepíše.
// Slugy stránek ošizené o písmena bez NFD rozkladu (Malmö → malm, Schönbrunn →
// schnbrunn) dostaly 19. 9. 2026 tvar podle názvu; tohle jsou 301 ze starých adres.
// Prefixová pravidla `/stará/:rest*` pokrývají stránku (`:rest*` bere i nula
// segmentů), její podstránky i články; řazená od NEJHLUBŠÍ adresy, protože Next
// bere první shodu a potomek s vlastní změnou musí předběhnout pravidlo předka.

/** @type {import("next").Redirect[]} */
const slugyDiakritika = [
  {
    source: '/belgie/brusel/bazilika-sacre-cur/:rest*',
    destination: '/belgie/brusel/bazilika-sacre-coeur/:rest*',
    permanent: true,
  },
  {
    source: '/bosna-a-hercegovina/mostar/karaozbegova-mesita/:rest*',
    destination: '/bosna-a-hercegovina/mostar/karadozbegova-mesita/:rest*',
    permanent: true,
  },
  {
    source: '/bosna-a-hercegovina/sarajevo/basarsija/:rest*',
    destination: '/bosna-a-hercegovina/sarajevo/bascarsija/:rest*',
    permanent: true,
  },
  {
    source: '/chorvatsko/dubrovnik/hora-sr/:rest*',
    destination: '/chorvatsko/dubrovnik/hora-srd/:rest*',
    permanent: true,
  },
  {
    source: '/chorvatsko/split/namesti-bratri-radiu/:rest*',
    destination: '/chorvatsko/split/namesti-bratri-radicu/:rest*',
    permanent: true,
  },
  {
    source: '/dansko/aalborg/lindholm-hje/:rest*',
    destination: '/dansko/aalborg/lindholm-hoje/:rest*',
    permanent: true,
  },
  {
    source: '/dansko/hillerd/zricenina-belholt/:rest*',
    destination: '/dansko/hillerod/zricenina-aebelholt/:rest*',
    permanent: true,
  },
  {
    source: '/dansko/kodan/namesti-grbrdretorv/:rest*',
    destination: '/dansko/kodan/namesti-grabrodretorv/:rest*',
    permanent: true,
  },
  {
    source: '/dansko/kodan/trida-strget/:rest*',
    destination: '/dansko/kodan/trida-stroget/:rest*',
    permanent: true,
  },
  {
    source: '/estonsko/saaremaa/kraaterjrv/:rest*',
    destination: '/estonsko/saaremaa/kraaterjarv/:rest*',
    permanent: true,
  },
  {
    source: '/finsko/helsinky/zabavni-park-linnanmki/:rest*',
    destination: '/finsko/helsinky/zabavni-park-linnanmaki/:rest*',
    permanent: true,
  },
  {
    source: '/finsko/tampere/zabavni-park-srknniemi/:rest*',
    destination: '/finsko/tampere/zabavni-park-sarkanniemi/:rest*',
    permanent: true,
  },
  {
    source: '/finsko/turku/luostarinmki/:rest*',
    destination: '/finsko/turku/luostarinmaki/:rest*',
    permanent: true,
  },
  {
    source: '/francie/avignon/htel-deurope/:rest*',
    destination: '/francie/avignon/hotel-deurope/:rest*',
    permanent: true,
  },
  {
    source: '/francie/toulouse/htel-dassezat/:rest*',
    destination: '/francie/toulouse/hotel-dassezat/:rest*',
    permanent: true,
  },
  {
    source: '/island/akureyri/botanicka-zahrada-lystigarur-akureyrar/:rest*',
    destination: '/island/akureyri/botanicka-zahrada-lystigardur-akureyrar/:rest*',
    permanent: true,
  },
  {
    source: '/island/isafjrur/historicke-domy-nestikaupstaur/:rest*',
    destination: '/island/isafjordur/historicke-domy-nedstikaupstadur/:rest*',
    permanent: true,
  },
  {
    source: '/island/jihozapadni-island/keri/:rest*',
    destination: '/island/jihozapadni-island/kerid/:rest*',
    permanent: true,
  },
  {
    source: '/island/jihozapadni-island/muzeum-geotermalni-energie-hellisheiarvirkjun/:rest*',
    destination: '/island/jihozapadni-island/muzeum-geotermalni-energie-hellisheidarvirkjun/:rest*',
    permanent: true,
  },
  {
    source: '/island/jihozapadni-island/rezervace-orsmrk/:rest*',
    destination: '/island/jihozapadni-island/rezervace-thorsmork/:rest*',
    permanent: true,
  },
  {
    source: '/island/narodni-park-ingvellir/aling-v-ingvelliru/:rest*',
    destination: '/island/narodni-park-thingvellir/althing-v-thingvelliru/:rest*',
    permanent: true,
  },
  {
    source: '/island/narodni-park-ingvellir/jezero-ingvallavatn/:rest*',
    destination: '/island/narodni-park-thingvellir/jezero-thingvallavatn/:rest*',
    permanent: true,
  },
  {
    source: '/island/narodni-park-ingvellir/vodopad-xararfoss/:rest*',
    destination: '/island/narodni-park-thingvellir/vodopad-oxararfoss/:rest*',
    permanent: true,
  },
  {
    source: '/island/narodni-park-ingvellir/zlom-ingvellir/:rest*',
    destination: '/island/narodni-park-thingvellir/zlom-thingvellir/:rest*',
    permanent: true,
  },
  {
    source: '/island/reykjavik/jomenningarhusi/:rest*',
    destination: '/island/reykjavik/thjodmenningarhusid/:rest*',
    permanent: true,
  },
  {
    source: '/island/snaefelsnes/buir/:rest*',
    destination: '/island/snaefelsnes/budir/:rest*',
    permanent: true,
  },
  {
    source: '/island/snaefelsnes/skaly-geruberg/:rest*',
    destination: '/island/snaefelsnes/skaly-gerduberg/:rest*',
    permanent: true,
  },
  {
    source: '/island/snaefelsnes/snaefellsjkull/:rest*',
    destination: '/island/snaefelsnes/snaefellsjokull/:rest*',
    permanent: true,
  },
  {
    source: '/island/snaefelsnes/svrtuloft/:rest*',
    destination: '/island/snaefelsnes/svortuloft/:rest*',
    permanent: true,
  },
  {
    source: '/island/zapadni-fjordy/namorni-muzeum-osvr/:rest*',
    destination: '/island/zapadni-fjordy/namorni-muzeum-osvor/:rest*',
    permanent: true,
  },
  {
    source: '/island/zapadni-pobrezi/bifrst/:rest*',
    destination: '/island/zapadni-pobrezi/bifrost/:rest*',
    permanent: true,
  },
  {
    source: '/island/zapadni-pobrezi/eiriksstair/:rest*',
    destination: '/island/zapadni-pobrezi/eiriksstadir/:rest*',
    permanent: true,
  },
  {
    source: '/island/zapadni-pobrezi/kerlingarskar/:rest*',
    destination: '/island/zapadni-pobrezi/kerlingarskard/:rest*',
    permanent: true,
  },
  {
    source: '/lucembursko/lucemburk/pevnost-thngen/:rest*',
    destination: '/lucembursko/lucemburk/pevnost-thungen/:rest*',
    permanent: true,
  },
  {
    source: '/nemecko/berlin/pamatnik-berlin-hohenschnhausen/:rest*',
    destination: '/nemecko/berlin/pamatnik-berlin-hohenschonhausen/:rest*',
    permanent: true,
  },
  {
    source: '/nemecko/hamburk/reeperbahn-herbertstrae/:rest*',
    destination: '/nemecko/hamburk/reeperbahn-herbertstrasse/:rest*',
    permanent: true,
  },
  {
    source: '/nemecko/lipsko/hfe-am-brhl/:rest*',
    destination: '/nemecko/lipsko/hofe-am-bruhl/:rest*',
    permanent: true,
  },
  {
    source: '/nemecko/mnichov/mnchner-eiszauber/:rest*',
    destination: '/nemecko/mnichov/munchner-eiszauber/:rest*',
    permanent: true,
  },
  {
    source: '/nemecko/mnichov/pamatnik-weie-rose/:rest*',
    destination: '/nemecko/mnichov/pamatnik-weisse-rose/:rest*',
    permanent: true,
  },
  {
    source: '/nemecko/wrlitz/desavsko-wrlitzsky-park/:rest*',
    destination: '/nemecko/worlitz/desavsko-worlitzsky-park/:rest*',
    permanent: true,
  },
  {
    source: '/nemecko/wrlitz/zamek-wrlitz/:rest*',
    destination: '/nemecko/worlitz/zamek-worlitz/:rest*',
    permanent: true,
  },
  {
    source: '/norsko/oslo/socha-kragsttten/:rest*',
    destination: '/norsko/oslo/socha-kragstotten/:rest*',
    permanent: true,
  },
  {
    source: '/norsko/trondheim/arcibiskupsky-palac-erkebispegrden/:rest*',
    destination: '/norsko/trondheim/arcibiskupsky-palac-erkebispegarden/:rest*',
    permanent: true,
  },
  {
    source: '/norsko/trondheim/kralovska-residence-stiftsgrden/:rest*',
    destination: '/norsko/trondheim/kralovska-residence-stiftsgarden/:rest*',
    permanent: true,
  },
  {
    source: '/peru/cusco/kostel-la-compaia-de-jesus/:rest*',
    destination: '/peru/cusco/kostel-la-compania-de-jesus/:rest*',
    permanent: true,
  },
  {
    source: '/polsko/gdansk/ulice-duga-and-dugi-targ/:rest*',
    destination: '/polsko/gdansk/ulice-dluga-and-dlugi-targ/:rest*',
    permanent: true,
  },
  {
    source: '/polsko/krakov/kociuszko-pahorek/:rest*',
    destination: '/polsko/krakov/kosciuszko-pahorek/:rest*',
    permanent: true,
  },
  {
    source: '/polsko/varsava/palac-krasiski/:rest*',
    destination: '/polsko/varsava/palac-krasinski/:rest*',
    permanent: true,
  },
  {
    source: '/portugalsko/lisabon/zamek-so-jorge/:rest*',
    destination: '/portugalsko/lisabon/zamek-sao-jorge/:rest*',
    permanent: true,
  },
  {
    source: '/portugalsko/madeira/jeskyne-a-vulkanicke-centrum-so-vicente/:rest*',
    destination: '/portugalsko/madeira/jeskyne-a-vulkanicke-centrum-sao-vicente/:rest*',
    permanent: true,
  },
  {
    source: '/portugalsko/porto/fundao-serralves-museum/:rest*',
    destination: '/portugalsko/porto/fundacao-serralves-museum/:rest*',
    permanent: true,
  },
  {
    source: '/rakousko/grossglockner-hochalpenstrasse/vyhlidka-franz-josef-hhe/:rest*',
    destination: '/rakousko/grossglockner-hochalpenstrasse/vyhlidka-franz-josef-hohe/:rest*',
    permanent: true,
  },
  {
    source: '/rakousko/viden/schnbrunn/:rest*',
    destination: '/rakousko/viden/schonbrunn/:rest*',
    permanent: true,
  },
  {
    source: '/rumunsko/bukurest/zahrady-cimig/:rest*',
    destination: '/rumunsko/bukurest/zahrady-cismig/:rest*',
    permanent: true,
  },
  {
    source: '/rumunsko/klastery-jizni-bukoviny/klaster-moldovia/:rest*',
    destination: '/rumunsko/klastery-jizni-bukoviny/klaster-moldovita/:rest*',
    permanent: true,
  },
  {
    source: '/rumunsko/klastery-jizni-bukoviny/sucevia/:rest*',
    destination: '/rumunsko/klastery-jizni-bukoviny/sucevita/:rest*',
    permanent: true,
  },
  {
    source: '/rumunsko/rumunska-cast-moldavie/neam/:rest*',
    destination: '/rumunsko/rumunska-cast-moldavie/neamt/:rest*',
    permanent: true,
  },
  {
    source: '/rumunsko/sinaia/zamek-pele/:rest*',
    destination: '/rumunsko/sinaia/zamek-peles/:rest*',
    permanent: true,
  },
  {
    source: '/rusko/kazan/vez-syembik/:rest*',
    destination: '/rusko/kazan/vez-soyembika/:rest*',
    permanent: true,
  },
  {
    source: '/rusko/petrohrad/katedrala-svizaka/:rest*',
    destination: '/rusko/petrohrad/katedrala-sv-izaka/:rest*',
    permanent: true,
  },
  {
    source: '/slovensko/demnovska-dolina/demnovska-jeskyne-svobody/:rest*',
    destination: '/slovensko/demanovska-dolina/demanovska-jeskyne-svobody/:rest*',
    permanent: true,
  },
  {
    source: '/slovensko/demnovska-dolina/demnovska-ledova-jeskyne/:rest*',
    destination: '/slovensko/demanovska-dolina/demanovska-ledova-jeskyne/:rest*',
    permanent: true,
  },
  {
    source: '/slovensko/vysoke-tatry/veke-hincovo-pleso/:rest*',
    destination: '/slovensko/vysoke-tatry/velke-hincovo-pleso/:rest*',
    permanent: true,
  },
  {
    source: '/spanelsko/barcelona/plaa-de-catalunya/:rest*',
    destination: '/spanelsko/barcelona/placa-de-catalunya/:rest*',
    permanent: true,
  },
  {
    source: '/spanelsko/sevilla/plaza-de-espaa/:rest*',
    destination: '/spanelsko/sevilla/plaza-de-espana/:rest*',
    permanent: true,
  },
  {
    source: '/srbsko/nis/vez-ele-kula/:rest*',
    destination: '/srbsko/nis/vez-cele-kula/:rest*',
    permanent: true,
  },
  {
    source: '/srbsko/stari-ras/klaster-sopoani/:rest*',
    destination: '/srbsko/stari-ras/klaster-sopocani/:rest*',
    permanent: true,
  },
  {
    source: '/svedsko/gteborg/lvsborg/:rest*',
    destination: '/svedsko/goteborg/alvsborg/:rest*',
    permanent: true,
  },
  {
    source: '/svedsko/malm/hrad-malmhus/:rest*',
    destination: '/svedsko/malmo/hrad-malmohus/:rest*',
    permanent: true,
  },
  {
    source: '/svedsko/malm/most-resund/:rest*',
    destination: '/svedsko/malmo/most-oresund/:rest*',
    permanent: true,
  },
  {
    source: '/svedsko/stockholm/kaknstornet/:rest*',
    destination: '/svedsko/stockholm/kaknastornet/:rest*',
    permanent: true,
  },
  {
    source: '/svedsko/stockholm/skogskyrkogrden/:rest*',
    destination: '/svedsko/stockholm/skogskyrkogarden/:rest*',
    permanent: true,
  },
  {
    source: '/svycarsko/basilej/lckerli-huus/:rest*',
    destination: '/svycarsko/basilej/lackerli-huus/:rest*',
    permanent: true,
  },
  {
    source: '/svycarsko/bern/brenpark/:rest*',
    destination: '/svycarsko/bern/barenpark/:rest*',
    permanent: true,
  },
  {
    source: '/turecko/ankara/antkabir/:rest*',
    destination: '/turecko/ankara/anitkabir/:rest*',
    permanent: true,
  },
  {
    source: '/vietnam/ho-ci-minovo-mesto/stredni-posta/:rest*',
    destination: '/vietnam/ho-ci-minovo-mesto/ustredni-posta/:rest*',
    permanent: true,
  },
  {
    source: '/bosna-a-hercegovina/biha/:rest*',
    destination: '/bosna-a-hercegovina/bihac/:rest*',
    permanent: true,
  },
  { source: '/dansko/hillerd/:rest*', destination: '/dansko/hillerod/:rest*', permanent: true },
  { source: '/egypt/doli-kralu/:rest*', destination: '/egypt/udoli-kralu/:rest*', permanent: true },
  { source: '/estonsko/prnu/:rest*', destination: '/estonsko/parnu/:rest*', permanent: true },
  {
    source: '/finsko/narodni-park-helvetinjrvi/:rest*',
    destination: '/finsko/narodni-park-helvetinjarvi/:rest*',
    permanent: true,
  },
  { source: '/island/isafjrur/:rest*', destination: '/island/isafjordur/:rest*', permanent: true },
  {
    source: '/island/narodni-park-ingvellir/:rest*',
    destination: '/island/narodni-park-thingvellir/:rest*',
    permanent: true,
  },
  {
    source: '/island/narodni-park-jkulsargljufur/:rest*',
    destination: '/island/narodni-park-jokulsargljufur/:rest*',
    permanent: true,
  },
  {
    source: '/island/narodni-park-snfellsjkull/:rest*',
    destination: '/island/narodni-park-snaefellsjokull/:rest*',
    permanent: true,
  },
  { source: '/malta/nejna-bay/:rest*', destination: '/malta/gnejna-bay/:rest*', permanent: true },
  {
    source: '/nemecko/dessau-rolau/:rest*',
    destination: '/nemecko/dessau-rosslau/:rest*',
    permanent: true,
  },
  { source: '/nemecko/wrlitz/:rest*', destination: '/nemecko/worlitz/:rest*', permanent: true },
  {
    source: '/polsko/biaka-tatrzaska/:rest*',
    destination: '/polsko/bialka-tatrzanska/:rest*',
    permanent: true,
  },
  { source: '/polsko/ywiec/:rest*', destination: '/polsko/zywiec/:rest*', permanent: true },
  {
    source: '/portugalsko/bragana/:rest*',
    destination: '/portugalsko/braganca/:rest*',
    permanent: true,
  },
  {
    source: '/portugalsko/guimares/:rest*',
    destination: '/portugalsko/guimaraes/:rest*',
    permanent: true,
  },
  {
    source: '/rakousko/kitzbhel/:rest*',
    destination: '/rakousko/kitzbuhel/:rest*',
    permanent: true,
  },
  {
    source: '/rumunsko/sighioara/:rest*',
    destination: '/rumunsko/sighisoara/:rest*',
    permanent: true,
  },
  {
    source: '/slovensko/demnovska-dolina/:rest*',
    destination: '/slovensko/demanovska-dolina/:rest*',
    permanent: true,
  },
  { source: '/svedsko/gteborg/:rest*', destination: '/svedsko/goteborg/:rest*', permanent: true },
  { source: '/svedsko/malm/:rest*', destination: '/svedsko/malmo/:rest*', permanent: true },
]

export default slugyDiakritika
