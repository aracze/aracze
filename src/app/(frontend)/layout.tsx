/**
 * KOŘENOVÝ LAYOUT (Root Layout)
 * ----------------------------
 * Tento soubor definuje strukturu HTML, která obaluje všechny stránky v aplikaci.
 * Next.js ho automaticky použije pro každou trasu (route).
 */

import type { Metadata } from 'next'
import { Open_Sans, Poppins } from 'next/font/google'
import './globals.css'
import { isProduction } from '@/lib/utils'
import { Header } from '@/components/layout/header/header'
import { sanitizeHeaderLogoSvg } from '@/lib/rich-text-html'
import { Footer } from '@/components/layout/footer/footer'
import { WebVitals } from '@/components/features/web-vitals'
import { fetchRootPages } from '@/lib/payload'

// 1. NASTAVENÍ PÍSEM (Google Fonts)
const openSans = Open_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-open-sans',
  display: 'swap',
})

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-poppins',
  display: 'swap',
})

// 2. SEO METADATA
// Definují <title> a <meta name="description"> v hlavičce webu
export const metadata: Metadata = {
  title: {
    template: '%s | Ara.cz - Cestovní průvodce',
    default: 'Ara.cz - Cestovní průvodce',
  },
  description: 'Váš průvodce po světě',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { data } = await fetchRootPages()

  // Ořežeme navigační strom jen na pole, která Header reálně používá. Bez toho by se
  // celý `depth=2` strom (včetně `text`/`meta`/… všech stránek a článků) serializoval
  // do RSC payloadu na každé stránce a nafoukl HTML zdroj o megabajty.
  const headerPages = (data.pages ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    fullSlug: p.fullSlug,
    category: p.category,
    children: p.children?.docs
      ? {
          docs: p.children.docs.map((c) => ({
            id: c.id,
            title: c.title,
            fullSlug: c.fullSlug,
          })),
        }
      : undefined,
  }))

  // Logo SVG sanitizujeme na SERVERU a Headeru (klient) předáme hotový string —
  // tím se DOMPurify nedostane do klientského bundlu.
  const headerLogo = data.global?.header?.logo ?? null
  const headerLogoSvg = headerLogo?.svgCode ? sanitizeHeaderLogoSvg(headerLogo.svgCode) : null

  return (
    <html lang="cs" className={`${openSans.variable} ${poppins.variable}`}>
      <body className="antialiased">
        {!isProduction() && <WebVitals />}

        {/* HLAVNÍ KONTEJNER: flex rozložení pro menu a obsah */}
        <div className="flex flex-col min-h-screen">
          {headerPages.length > 0 && (
            <Header pages={headerPages} headerLogo={headerLogo} logoSvgHtml={headerLogoSvg} />
          )}
          <div className="grow w-full">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  )
}
