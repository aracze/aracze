'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

/**
 * Cloudflare Turnstile — „chytrý strážce", většinou neviditelný. Vloží do
 * formuláře skryté pole `cf-turnstile-response` s tokenem, které ověří server.
 * Vykresluje se explicitně (spolehlivé i po klientské navigaci) a umí se
 * resetovat po odeslání (token je jednorázový).
 */

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return
    if (window.turnstile) return resolve()

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('turnstile load error')))
      return
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('turnstile load error'))
    document.head.appendChild(script)
  })
}

export type TurnstileHandle = { reset: () => void }

export const Turnstile = forwardRef<TurnstileHandle, { siteKey: string }>(function Turnstile(
  { siteKey },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current)
    },
  }))

  useEffect(() => {
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile || widgetId.current) return
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          language: 'cs',
        })
      })
      .catch(() => {
        /* výpadek CF skriptu — server ochranu doplní honeypotem */
      })

    return () => {
      cancelled = true
      if (window.turnstile && widgetId.current) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          /* ignore */
        }
        widgetId.current = null
      }
    }
  }, [siteKey])

  return <div ref={containerRef} className="min-h-[65px]" />
})
