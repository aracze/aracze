'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, X, ChevronDown } from 'lucide-react'
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

  // Mobilní menu (do `md` breakpointu). Vlastní stav nezávislý na desktop mega menu.
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobilePanelRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const closeMobileMenu = () => {
    setMobileOpen(false)
    menuButtonRef.current?.focus()
  }

  // Přechod na jinou stránku menu zavře. Použijeme doporučený vzor React „úprava
  // stavu při renderu" (sledování předchozí cesty přes stav) — bez setState v
  // effectu (kaskádové rendery) i bez sahání na ref během renderu.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    setMobileOpen(false)
    setMobileExpandedId(null)
  }

  // Otevřené menu: přesun fokusu dovnitř, Escape zavírá + vrací fokus na tlačítko,
  // Tab drží fokus v panelu (focus trap) a scroll pozadí zamkneme.
  useEffect(() => {
    if (!mobileOpen) return

    const focusables = () =>
      Array.from(
        mobilePanelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ??
          [],
      )

    focusables()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMobileOpen(false)
        menuButtonRef.current?.focus()
        return
      }
      if (e.key === 'Tab') {
        const items = focusables()
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [mobileOpen])

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

  // Řazení sdílíme mezi desktop navigací a mobilním menu (kontinenty v pořadí,
  // zbytek abecedně česky).
  const sortedNavPages = [...navPages].sort((a, b) => {
    const indexA = CONTINENT_ORDER.indexOf(a.title)
    const indexB = CONTINENT_ORDER.indexOf(b.title)

    if (indexA !== -1 && indexB !== -1) return indexA - indexB
    if (indexA !== -1) return -1
    if (indexB !== -1) return 1

    return a.title.localeCompare(b.title, 'cs')
  })

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
        activeDropdown || mobileOpen ? 'bg-[#215491]' : 'bg-transparent'
      } group/header`}
    >
      <div
        className={`absolute inset-0 h-[65px] bg-gradient-to-b from-black/50 to-transparent z-[-1] transition-opacity duration-300 ${
          activeDropdown || mobileOpen ? 'opacity-0' : 'opacity-100'
        }`}
      />

      <nav aria-label="Hlavní navigace" className="h-[65px] flex items-center">
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
            {sortedNavPages.map((page, index) => {
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
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Zavřít menu' : 'Otevřít menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              className="md:hidden -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-white [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              {mobileOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
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

      {/* Mobilní menu (do `md`) — backdrop + rozbalovací panel s accordionem. */}
      {mobileOpen && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Zavřít menu"
            tabIndex={-1}
            onClick={closeMobileMenu}
            className="fixed top-[65px] right-0 bottom-0 left-0 z-[140] bg-black/40 animate-in fade-in duration-200 motion-reduce:animate-none"
          />
          <div
            id="mobile-menu"
            ref={mobilePanelRef}
            className="fixed top-[65px] right-0 bottom-0 left-0 z-[150] overflow-y-auto [overscroll-behavior:contain] bg-[#215491] text-white animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none"
          >
            <nav aria-label="Hlavní navigace" className="px-4 py-2">
              <ul className="flex flex-col divide-y divide-white/10">
                {sortedNavPages.map((page, index) => {
                  const hasChildren = (page.children?.docs?.length ?? 0) > 0
                  const pageId = String(page.id || `temp-id-${index}`)
                  const expanded = mobileExpandedId === pageId
                  return (
                    <li key={pageId}>
                      <div className="flex items-center">
                        <Link
                          href={page.fullSlug}
                          onClick={() => setMobileOpen(false)}
                          className="flex-1 rounded-sm py-3 font-heading text-[16px] font-semibold text-white [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                        >
                          {page.title}
                        </Link>
                        {hasChildren && (
                          <button
                            type="button"
                            onClick={() => setMobileExpandedId(expanded ? null : pageId)}
                            aria-expanded={expanded}
                            aria-controls={`mobile-submenu-${pageId}`}
                            aria-label={
                              expanded ? `Sbalit ${page.title}` : `Rozbalit ${page.title}`
                            }
                            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                          >
                            <ChevronDown
                              className={`h-5 w-5 transition-transform duration-200 motion-reduce:transition-none ${
                                expanded ? 'rotate-180' : ''
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </div>
                      {hasChildren && expanded && (
                        <ul id={`mobile-submenu-${pageId}`} className="pb-2">
                          {[...(page.children?.docs || [])]
                            .sort((a, b) => a.title.localeCompare(b.title, 'cs'))
                            .map((child, ci) => (
                              <li key={child.id || `child-${ci}`}>
                                <Link
                                  href={child.fullSlug}
                                  onClick={() => setMobileOpen(false)}
                                  className="block rounded-sm py-2 pl-4 text-[15px] text-white/85 hover:text-white [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                                >
                                  {child.title}
                                </Link>
                              </li>
                            ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
                <li className="pt-3 pb-4">
                  <Link
                    href="/rady-na-cestu"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-full border-2 border-white/50 py-2.5 text-center font-heading text-[13px] font-bold uppercase tracking-wider text-white [-webkit-tap-highlight-color:transparent] hover:bg-white hover:text-[#215491] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  >
                    Rady na cestu
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}
