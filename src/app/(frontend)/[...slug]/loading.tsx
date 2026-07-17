import { StaticHeroWave } from '@/components/features/static-hero-wave'

/**
 * Okamžitá kostra při navigaci mezi obsahovými stránkami.
 *
 * Pozor: kořenový `app/loading.tsx` se při přechodu mezi dvěma stránkami
 * TÉHOŽ segmentu `[...slug]` (např. /norsko → /chorvatsko) nepoužije — boundary
 * musí být uvnitř segmentu. Bez tohoto souboru se při kliknutí v menu pár
 * sekund nedělo vůbec nic a web působil rozbitě.
 *
 * Tvar kopíruje skutečnou stránku (hero 315 px + vlnka + podnavigace + text),
 * aby obsah po dotečení „neskákal". Vlnka `StaticHeroWave` je stejná jako
 * v `HeroSection`, jinak by přechod z rovné hrany kostry na vlnku působil rušivě.
 */
export default function LoadingSlugPage() {
  return (
    <div
      role="status"
      aria-label="Načítání stránky"
      className="flex flex-col bg-white animate-pulse"
    >
      {/* Hero (stejná výška jako HeroSection) */}
      <div className="relative w-full h-[315px] bg-[#3b444f]/80">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="h-10 w-64 md:w-96 rounded bg-white/20" />
          <div className="h-4 w-40 rounded bg-white/10" />
        </div>

        {/* Vlnka na spodní hraně — stejná jako v HeroSection, ať přechod nesekne */}
        <StaticHeroWave />
      </div>

      {/* Podnavigace */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 md:px-12 flex justify-center gap-6 py-4">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200 hidden sm:block" />
          <div className="h-4 w-24 rounded bg-gray-200 hidden sm:block" />
          <div className="h-4 w-16 rounded bg-gray-200 hidden md:block" />
          <div className="h-4 w-20 rounded bg-gray-200 hidden md:block" />
        </div>
      </div>

      {/* Obsah */}
      <div className="max-w-3xl mx-auto w-full px-4 py-10 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-11/12" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-10/12" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-9/12" />
      </div>
    </div>
  )
}
