'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ImageLink, PageCategory } from '@/types/payload'
import { isCloudinary } from '@/lib/cloudinary-loader'
import Search from '@/components/features/search/search'

// Header je client komponenta → cokoli mu předáme se serializuje do RSC payloadu
// na KAŽDÉ stránce. Proto přijímá jen navigační podmnožinu (bez `text`, `meta`,
// `detail`, `featuredImage`, `articles` a bez vnoření hlouběji než přímé děti),
// jinak by se do HTML zdroje propsala plná těla všech stránek i článků.
export type NavPage = {
  id: number | string
  title: string
  fullSlug: string
  category: PageCategory
  children?: {
    docs: { id: number | string; title: string; fullSlug: string }[]
  }
}

export function Header({
  pages,
  headerLogo,
  logoSvgHtml,
}: {
  pages: NavPage[]
  headerLogo?: ImageLink | null
  /** Předsanitizované SVG loga (na serveru přes `sanitizeHeaderLogoSvg`). */
  logoSvgHtml?: string | null
}) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = (pageId: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setActiveDropdown(pageId)
  }

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null)
    }, 150)
  }

  const logo = headerLogo

  // Najdeme aktuálně aktivní stránku pro mega menu
  const activePage = pages?.find((p) => String(p.id) === activeDropdown)

  const CONTINENT_ORDER = ['Evropa', 'Amerika', 'Asie', 'Afrika', 'Austrálie']

  // Main nav lists only top-level destinations (category "Místo k navštívení").
  const navPages = (pages || []).filter((p) => p.category === PageCategory.Misto_k_navstiveni)

  return (
    <header
      onBlur={(e) => {
        // Zavřeme dropdown jen když fokus opustil celou hlavičku — přesun mezi
        // položkami/submenu uvnitř necháváme otevřený (přístupnost klávesnicí).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
          setActiveDropdown(null)
        }
      }}
      className={`absolute top-0 left-0 w-full z-[200] transition-colors duration-300 ${
        activeDropdown ? 'bg-[#215491]' : 'bg-transparent'
      } group/header`}
    >
      <div
        className={`absolute inset-0 h-[65px] bg-gradient-to-b from-black/50 to-transparent z-[-1] transition-opacity duration-300 ${
          activeDropdown ? 'opacity-0' : 'opacity-100'
        }`}
      />

      <nav className="h-[65px] flex items-center">
        <div className="max-w-7xl mx-auto px-4 md:px-12 flex items-center w-full gap-8">
          {logo && (
            <Link href="/" className="flex items-center shrink-0">
              {logoSvgHtml ? (
                <div
                  className="h-[26px] w-auto flex items-center [&_svg]:h-[26px] [&_svg]:w-auto"
                  // Už sanitizované na serveru (sanitizeHeaderLogoSvg) — proto se
                  // DOMPurify nemusí bundlovat do klienta.
                  dangerouslySetInnerHTML={{ __html: logoSvgHtml }}
                />
              ) : (
                logo.image?.url && (
                  <Image
                    src={new URL(
                      logo.image.url,
                      process.env.NEXT_PUBLIC_PAYLOAD_BASE_URL || 'http://localhost:3000',
                    ).toString()}
                    alt={logo.image.alternativeText || 'Logo'}
                    width={132}
                    height={26}
                    className="h-[26px] w-auto object-contain"
                    unoptimized={!isCloudinary(String(logo.image.url))}
                  />
                )
              )}
            </Link>
          )}

          <div className="hidden md:flex items-center gap-0 h-full text-white/90 font-semibold">
            {[...navPages]
              .sort((a, b) => {
                const indexA = CONTINENT_ORDER.indexOf(a.title)
                const indexB = CONTINENT_ORDER.indexOf(b.title)

                if (indexA !== -1 && indexB !== -1) return indexA - indexB
                if (indexA !== -1) return -1
                if (indexB !== -1) return 1

                return a.title.localeCompare(b.title, 'cs')
              })
              .map((page, index) => {
                const hasChildren = (page.children?.docs?.length ?? 0) > 0
                const pageId = page.id || `temp-id-${index}`
                return (
                  <div
                    key={pageId}
                    className="h-[65px] flex items-center"
                    onMouseEnter={() => hasChildren && handleMouseEnter(String(pageId))}
                    onMouseLeave={handleMouseLeave}
                    onFocus={() => hasChildren && handleMouseEnter(String(pageId))}
                  >
                    <Link
                      href={page.fullSlug}
                      onClick={() => setActiveDropdown(null)}
                      aria-haspopup={hasChildren || undefined}
                      aria-expanded={hasChildren ? activeDropdown === String(pageId) : undefined}
                      className="px-5 text-white hover:text-gray-100 transition-colors tracking-wide text-[15px] font-semibold font-heading flex items-center gap-1 whitespace-nowrap"
                    >
                      {page.title}
                      {hasChildren && (
                        <span className="inline-block border-white hover:border-gray-100 border-t-4 border-l-4 border-r-4 border-l-transparent border-r-transparent border-white/60" />
                      )}
                    </Link>
                  </div>
                )
              })}
          </div>

          <div className="ml-auto flex items-center gap-4">
            <Search />
            <Link
              href="/rady-na-cestu"
              className="hidden lg:block px-5 py-1.5 border-2 border-white/50 rounded-full text-white text-[13px] font-bold hover:bg-white hover:text-[#215491] transition-all uppercase tracking-wider font-heading whitespace-nowrap"
            >
              Rady na cestu
            </Link>
          </div>
        </div>
      </nav>

      {/* Mega Menu - Vykresleno pouze jednou mimo loop pro čistší DOM a lepší pozicování */}
      {activePage && (activePage.children?.docs?.length ?? 0) > 0 && (
        <div
          className="absolute left-0 right-0 w-full bg-[#215490] border-b-2 border-[#1A4579] shadow-2xl transition-all duration-300 top-[65px] z-[150] pointer-events-auto animate-in fade-in slide-in-from-top-1 duration-200"
          onMouseEnter={() => handleMouseEnter(String(activePage.id))}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-white py-2">
            <div className="max-w-7xl mx-auto px-4 md:px-12 py-4">
              <div className="grid grid-cols-6 gap-y-1 gap-x-8">
                {[...(activePage.children?.docs || [])]
                  .sort((a, b) => a.title.localeCompare(b.title, 'cs'))
                  .map((child, index) => (
                    <Link
                      key={child.id || `child-${index}`}
                      href={child.fullSlug}
                      onClick={() => setActiveDropdown(null)}
                      className="text-[14px] text-gray-800 py-1 px-3 -mx-3 transition-all inline-block w-full [text-shadow:1px_2px_3px_rgb(255,255,255)] hover:text-white hover:bg-[#3C6EAA] hover:rounded-sm hover:no-underline hover:shadow-none hover:[text-shadow:none]"
                    >
                      {child.title}
                    </Link>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
