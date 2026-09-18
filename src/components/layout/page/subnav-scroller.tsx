'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Kolik px z položky na kraji musí být vidět (a kolik chybět), aby bylo
 *  zřejmé, že je useknutá — a menu tedy pokračuje. Bez toho rozhoduje náhoda:
 *  na iPhonu u Itálie chybělo z „Měna“ jen 8 px a slovo vypadalo celé. */
const PEEK = 24

/**
 * Posuvný kontejner sekundární navigace s nápovědami, že se dá posouvat:
 * – po načtení posune aktivní položku do záběru (návštěvník vidí, kde je),
 * – hlídá, aby položka na kraji byla zřetelně nakousnutá (vzor Material
 *   „scrollable tabs“, NN/g: useknuté slovo je nejsilnější signál),
 * – na krajích kreslí přechod do bílé a šipku, které zmizí, když je pruh
 *   na začátku / na konci (vzor Google, YouTube).
 * Když se záložky vejdou, žádná nápověda není vidět.
 */
export function SubnavScroller({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)
  // Přechody mezi podstránkami běží po klientu a komponenta u nich zůstává
  // připojená — bez závislosti na cestě by se aktivní položka doprostřed
  // posunula jen při prvním načtení.
  const pathname = usePathname()

  const updateEdges = useCallback(() => {
    const scroller = ref.current
    if (!scroller) return
    const max = scroller.scrollWidth - scroller.clientWidth
    setAtStart(scroller.scrollLeft <= 1)
    setAtEnd(scroller.scrollLeft >= max - 1)
  }, [])

  useEffect(() => {
    const scroller = ref.current
    if (!scroller) return

    const centerActive = () => {
      if (scroller.scrollWidth <= scroller.clientWidth) return
      const active = scroller.querySelector('[aria-current]')
      if (!active) return
      const item = active.getBoundingClientRect()
      const box = scroller.getBoundingClientRect()
      // Vlastní výpočet místo scrollIntoView — ten by mohl hnout i svislým
      // scrollem stránky (např. po návratu zpět s obnovenou pozicí).
      scroller.scrollLeft += item.left - box.left - (box.width - item.width) / 2
    }

    // Položka, kterou protíná kraj, musí být vidět aspoň PEEK px a aspoň
    // PEEK px z ní musí chybět. Když kraj sedí přesně na hranici položek,
    // posune se pruh tak, aby další položka vykoukla.
    const ensurePeek = () => {
      const max = scroller.scrollWidth - scroller.clientWidth
      if (max <= 0) return
      const links = Array.from(scroller.querySelectorAll('a'))
      const activeIndex = links.findIndex((a) => a.hasAttribute('aria-current'))
      // Na začátku s aktivní první položkou (a na konci s poslední) se pruh
      // nehýbe — posun by lhal o tom, kde menu začíná. Tam nese nápovědu
      // přechod a šipka.
      if (activeIndex === 0 && scroller.scrollLeft <= 1) return
      if (activeIndex === links.length - 1 && scroller.scrollLeft >= max - 1) return

      const box = scroller.getBoundingClientRect()
      const fix = (edgeX: number, dir: 1 | -1) => {
        for (const link of links) {
          const r = link.getBoundingClientRect()
          if (r.left < edgeX && r.right > edgeX) {
            const visible = dir > 0 ? edgeX - r.left : r.right - edgeX
            const hidden = r.width - visible
            if (visible < PEEK) scroller.scrollLeft += dir * (PEEK - visible + 4)
            else if (hidden < PEEK) scroller.scrollLeft -= dir * (PEEK - hidden + 4)
            return
          }
          if (Math.abs((dir > 0 ? r.right : r.left) - edgeX) < 2) {
            scroller.scrollLeft -= dir * PEEK
            return
          }
        }
      }
      if (scroller.scrollLeft < max - 1) fix(box.right, 1)
      if (scroller.scrollLeft > 1) fix(box.left, -1)
    }

    const place = () => {
      centerActive()
      ensurePeek()
      updateEdges()
    }

    place()
    // Otočení telefonu mění šířku, a tím i to, které položky se vejdou.
    window.addEventListener('resize', place)
    scroller.addEventListener('scroll', updateEdges, { passive: true })
    return () => {
      window.removeEventListener('resize', place)
      scroller.removeEventListener('scroll', updateEdges)
    }
  }, [pathname, updateEdges])

  const scrollBy = (dir: 1 | -1) => {
    const scroller = ref.current
    if (!scroller) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollBy({
      left: dir * scroller.clientWidth * 0.66,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }

  return (
    <div className="relative max-w-7xl mx-auto">
      <div ref={ref} className={className}>
        {children}
      </div>
      <SubnavEdge side="left" hidden={atStart} onClick={() => scrollBy(-1)} />
      <SubnavEdge side="right" hidden={atEnd} onClick={() => scrollBy(1)} />
    </div>
  )
}

/** Přechod do bílé + šipka na jednom kraji pruhu. `hidden` = pruh je na tom
 *  kraji u konce, nápověda se vytratí (a tlačítko vypadne z tabulátoru). */
function SubnavEdge({
  side,
  hidden,
  onClick,
}: {
  side: 'left' | 'right'
  hidden: boolean
  onClick: () => void
}) {
  const isRight = side === 'right'
  return (
    <div
      className={`subnav-edge absolute inset-y-0 bottom-px flex items-center pointer-events-none transition-opacity duration-150 motion-reduce:transition-none ${
        isRight ? 'right-0 justify-end pr-1.5 subnav-edge-right' : 'left-0 justify-start pl-1.5'
      } ${hidden ? 'opacity-0' : 'opacity-100'}`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={hidden}
        aria-label={isRight ? 'Posunout menu doprava' : 'Posunout menu doleva'}
        className="pointer-events-auto disabled:pointer-events-none size-7 rounded-full border border-line-strong bg-paper text-brand shadow-sm grid place-items-center hover:bg-brand-tint"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={isRight ? 'm6 3 5 5-5 5' : 'M10 3 5 8l5 5'} />
        </svg>
      </button>
    </div>
  )
}
