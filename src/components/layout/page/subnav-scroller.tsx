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

    const place = () => {
      const active = scroller.querySelector('[aria-current]')
      if (active && scroller.scrollWidth > scroller.clientWidth) {
        const item = active.getBoundingClientRect()
        const box = scroller.getBoundingClientRect()
        // Vlastní výpočet místo scrollIntoView — ten by mohl hnout i svislým
        // scrollem stránky (např. po návratu zpět s obnovenou pozicí).
        const centered = scroller.scrollLeft + item.left - box.left - (box.width - item.width) / 2
        scroller.scrollLeft = adjustForPeek(scroller, centered)
      }
      updateEdges()
    }

    place()
    // Otočení telefonu mění šířku, a tím i to, které položky se vejdou.
    window.addEventListener('resize', place)
    // Po posunu prstem či kolečkem se poloha neopravuje — pruh, který se po
    // švihnutí sám pohne, působí jako chyba (Material ani štítky Googlu
    // nepřiskakují). Nápovědu tam nesou přechod a šipka.
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
    // Cíl posunu se dopočítá tak, aby i po něm byla položka na kraji nakousnutá.
    const target = adjustForPeek(scroller, scroller.scrollLeft + dir * scroller.clientWidth * 0.66)
    scroller.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' })
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

/**
 * Upraví zamýšlenou polohu posunu `left` tak, aby položka, kterou protíná kraj,
 * byla vidět aspoň PEEK px a aspoň PEEK px z ní chybělo. Když kraj sedí přesně
 * na hranici položek, posune se tak, aby další položka vykoukla. Počítá se
 * v souřadnicích obsahu pruhu, takže funguje i pro polohu, kde pruh ještě není.
 */
function adjustForPeek(scroller: HTMLElement, left: number): number {
  const max = scroller.scrollWidth - scroller.clientWidth
  if (max <= 0) return 0
  const clamp = (x: number) => Math.max(0, Math.min(max, x))
  let next = clamp(left)
  const links = Array.from(scroller.querySelectorAll('a'))
  const activeIndex = links.findIndex((a) => a.hasAttribute('aria-current'))
  // Na začátku s aktivní první položkou (a na konci s poslední) se pruh nehýbe —
  // posun by lhal o tom, kde menu začíná. Tam nese nápovědu přechod a šipka.
  if (activeIndex === 0 && next <= 1) return next
  if (activeIndex === links.length - 1 && next >= max - 1) return next

  const box = scroller.getBoundingClientRect()
  const offset = scroller.scrollLeft - box.left
  const fix = (edgeX: number, dir: 1 | -1) => {
    for (const link of links) {
      const r = link.getBoundingClientRect()
      const l = r.left + offset
      const rr = r.right + offset
      if (l < edgeX && rr > edgeX) {
        const visible = dir > 0 ? edgeX - l : rr - edgeX
        const hidden = r.width - visible
        if (visible < PEEK) next += dir * (PEEK - visible)
        else if (hidden < PEEK) next -= dir * (PEEK - hidden)
        return
      }
      if (Math.abs((dir > 0 ? rr : l) - edgeX) < 2) {
        next -= dir * PEEK
        return
      }
    }
  }
  // Oprava jednoho kraje může druhý kraj o pár px rozhodit — proto se oba
  // kraje projdou znovu, dokud se poloha mění (nejvýš třikrát, ať nekmitá).
  for (let pass = 0; pass < 3; pass++) {
    const before = next
    if (next < max - 1) fix(next + scroller.clientWidth, 1)
    if (next > 1) fix(next, -1)
    if (next === before) break
  }
  return clamp(next)
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
