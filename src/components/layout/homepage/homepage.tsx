import { StaticHeroWave } from '@/components/features/static-hero-wave'
import { Homepage as HomepageType } from '@/types/payload'
import { StaticHeroOverlay } from '@/components/features/static-hero-overlay'
import { StaticHeroTitle } from './static-hero-title'
import { StaticHeroImage } from '@/components/features/static-hero-image'

// Konfigurovatelné přes env (fallback zachovává původní chování), ať URL není
// natvrdo v kódu.
const HOMEPAGE_HERO_IMAGE =
  process.env.NEXT_PUBLIC_HOMEPAGE_HERO_IMAGE ||
  'https://res.cloudinary.com/ara/image/upload/homepage.jpg'

export const Homepage = ({ homepage }: { homepage?: HomepageType | null }) => {
  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative w-full h-[315px] overflow-hidden bg-[#3b444f]">
        <StaticHeroImage imageUrl={HOMEPAGE_HERO_IMAGE} />

        <StaticHeroTitle title={'Najdi si svůj cíl'} />

        <StaticHeroOverlay filterId="blurFilterHome" />

        <StaticHeroWave />
      </section>

      <main className="max-w-7xl mx-auto px-4 md:px-12 py-16 text-center">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 uppercase tracking-wider">
          {homepage?.title}
        </h2>
      </main>
    </div>
  )
}
