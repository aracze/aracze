'use client'

/**
 * NAVIGAČNÍ PROGRESS BAR
 * ----------------------
 * Tenká modrá linka u horní hrany okna (styl GitHub/YouTube), která se objeví,
 * jen když přechod mezi stránkami trvá déle než SHOW_DELAY_MS. Rychlé prokliky
 * (typicky vše z produkční cache) tak proběhnou úplně bez vizuálního šumu —
 * stará stránka zůstane stát a plynule se vymění obsah. Pomalé přechody dostanou
 * okamžitou zpětnou vazbu, takže web nikdy nepůsobí zamrzle.
 *
 * Nahrazuje dřívější `loading.tsx` kostry: ty se ukazovaly OKAMŽITĚ, takže při
 * rychlém přechodu stránka dvakrát „probleskla" (obsah → kostra → obsah)
 * a působila pomaleji, než reálně byla.
 *
 * Proč vlastní implementace: App Router nemá globální router události. Start
 * navigace proto detekujeme odposlechem kliků na interní odkazy (+ popstate pro
 * tlačítka zpět/vpřed) a konec změnou usePathname()/useSearchParams(). Kolečko
 * v záložce prohlížeče se při klientské navigaci netočí (prohlížeč ji nepovažuje
 * za načítání stránky), takže indikaci si web musí kreslit sám.
 *
 * Vzhled (třídy .nav-progress*) je definovaný v globals.css.
 */

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/** Jak dlouho po kliknutí čekáme, než bar ukážeme — rychlé přechody ho nikdy neuvidí. */
const SHOW_DELAY_MS = 250
/** Pojistka: kdyby navigace nikam nevedla (např. chyba), bar po této době uklidíme. */
const FAILSAFE_MS = 12_000
/** Délka závěrečné animace (dojezd na 100 % + zeslábnutí) před odebráním z DOM. */
const DONE_MS = 400

type Status = 'idle' | 'pending' | 'running' | 'done'

function NavigationProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<Status>('idle')
  // Zrcadlo stavu pro handlery registrované jednou při mountu (mají starou closure).
  const statusRef = useRef<Status>('idle')
  const showTimer = useRef<number | undefined>(undefined)
  const failsafeTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    const clearTimers = () => {
      window.clearTimeout(showTimer.current)
      window.clearTimeout(failsafeTimer.current)
    }

    const start = () => {
      clearTimers()
      failsafeTimer.current = window.setTimeout(() => setStatus('idle'), FAILSAFE_MS)
      // Když už bar běží (uživatel kliknul jinam dřív, než dojel), nech ho běžet —
      // jinak by zmizel a po prodlevě se znovu objevil od nuly.
      if (statusRef.current === 'running') return
      setStatus('pending')
      showTimer.current = window.setTimeout(() => setStatus('running'), SHOW_DELAY_MS)
    }

    const onClick = (event: MouseEvent) => {
      // Jen čistý levý klik, který žádný jiný handler nezrušil.
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!anchor || !anchor.getAttribute('href')) return
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Stejná cesta i query = žádná navigace (kotvy #obsah, odkaz na aktuální stránku).
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      start()
    }

    // Zpět/vpřed v prohlížeči: většinou doběhne hned z router cache (bar se pod
    // prahem vůbec neukáže), ale pomalé případy dostanou stejnou indikaci.
    const onPopState = () => start()

    document.addEventListener('click', onClick)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('popstate', onPopState)
      clearTimers()
    }
  }, [])

  // Změna URL = navigace doběhla a nová stránka je vykreslená.
  useEffect(() => {
    window.clearTimeout(showTimer.current)
    window.clearTimeout(failsafeTimer.current)
    // Změna pathname/searchParams JE externí signál routeru (přesně to, k čemu
    // efekty jsou) — a komponenta renderuje jen prázdný div/null, takže jeden
    // re-render navíc za navigaci nic nestojí.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus((prev) => {
      if (prev === 'idle') return prev // první mount / nesledovaná navigace
      if (prev === 'pending') return 'idle' // stihlo se to pod prahem — bar se vůbec neukázal
      return 'done' // bar je vidět → dojezd na 100 % a zeslábnutí
    })
  }, [pathname, searchParams])

  // Po závěrečné animaci bar odebereme z DOM.
  useEffect(() => {
    if (status !== 'done') return
    const timer = window.setTimeout(() => setStatus('idle'), DONE_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  if (status !== 'running' && status !== 'done') return null

  // aria-hidden: čistě vizuální indikátor — změnu stránky čtečkám hlásí sám Next.js.
  return (
    <div
      aria-hidden="true"
      className={status === 'done' ? 'nav-progress nav-progress--done' : 'nav-progress'}
    >
      <div className="nav-progress__bar" />
    </div>
  )
}

/**
 * useSearchParams() vyžaduje Suspense boundary (jinak by při buildu spadl
 * prerender statických stránek) — proto obal tady, ne v layoutu.
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  )
}
