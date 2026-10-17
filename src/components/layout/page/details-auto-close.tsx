'use client'

import { useEffect } from 'react'

/**
 * Rozbalovací filtry jsou `<details>` (fungují bez JS, drží stav i přes
 * navigaci, takže vícenásobný výběr letišť nezavře panel po každém kliku).
 * Prohlížeč je ale sám nezavře klikem mimo ani klávesou Escape — tohle to
 * doplní pro všechny `details[data-autoclose]` na stránce. Bez JS zůstává
 * původní chování (zavření klikem na záhlaví).
 */
export function DetailsAutoClose() {
  useEffect(() => {
    const closeOthers = (target: Node | null) => {
      document
        .querySelectorAll<HTMLDetailsElement>('details[data-autoclose][open]')
        .forEach((d) => {
          if (!target || !d.contains(target)) d.removeAttribute('open')
        })
    }
    const onPointerDown = (e: PointerEvent) => closeOthers(e.target as Node)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOthers(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  return null
}
