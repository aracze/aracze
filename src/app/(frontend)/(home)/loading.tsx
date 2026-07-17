import Loading from '@/components/layout/loading/loading-page'

/**
 * Okamžitá kostra pro HOME (`/`).
 *
 * Home je v route group `(home)`, aby mohla mít vlastní loading boundary. Dřív
 * tuhle roli plnil `(frontend)/loading.tsx`, ten ale musel padnout: obaloval by
 * i `[...slug]`, a jakákoliv loading vrstva NAD `[...slug]/layout.tsx` by rozbila
 * tvrdý 404 (viz komentář v tom layoutu). Route group URL nemění (`/` zůstává).
 */
export default function LoadingHome() {
  return <Loading />
}
