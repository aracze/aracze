'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Star } from 'lucide-react'
import { createReview, type ReviewFormState } from '@/lib/review-actions'
import { Turnstile, type TurnstileHandle } from '@/components/features/comments/turnstile'

/**
 * Lišta „Byl jsi zde? Ohodnoť to!" + sbalený formulář recenze (legacy
 * `.rating-review`). Hvězdičky v liště JSOU vstup hodnocení — kliknutí nastaví
 * počet hvězd a rozbalí formulář (stejně jako raty + collapse na starém webu).
 * Tlačítko „Napiš vlastní recenzi" pod výpisem posílá event `ara:review-open`.
 *
 * Ochrana: skrytý honeypot `website`, čas načtení `renderedAt` a volitelně
 * Cloudflare Turnstile — stejné vrstvy jako u komentářů. Po úspěchu se přes
 * router.refresh() objeví nová recenze nahoře ve výpisu.
 */
export function ReviewRatingBox({
  pageId,
  turnstileSiteKey,
}: {
  pageId: number
  turnstileSiteKey: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<ReviewFormState>({ status: 'idle' })
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  // Čas načtení — jednou při mountu (anti-bot timing, viz komentáře).
  const [renderedAt] = useState(() => Date.now())

  const boxRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)

  const openForm = () => {
    setOpen(true)
    // Fokus až po vykreslení rozbaleného formuláře.
    window.setTimeout(() => bodyRef.current?.focus(), 100)
  }

  // „Napiš vlastní recenzi" (řádek pod výpisem) → naroluj na lištu a otevři formulář.
  useEffect(() => {
    const onOpen = () => {
      boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setOpen(true)
      window.setTimeout(() => bodyRef.current?.focus(), 400)
    }
    window.addEventListener('ara:review-open', onOpen)
    return () => window.removeEventListener('ara:review-open', onOpen)
  }, [])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Legacy validační hláška — hvězdičky se vybírají v liště, ne ve formuláři.
    if (!rating) {
      setState({
        status: 'error',
        message: 'Je zapotřebí přidat hvězdičky k danému turistickému cíli.',
      })
      return
    }
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createReview(state, formData)
      setState(result)
      if (result.status === 'success') {
        formRef.current?.reset()
        turnstileRef.current?.reset()
        setRating(0)
        router.refresh()
      }
    })
  }

  const shownStars = hover || rating

  return (
    <div ref={boxRef} id="ohodnotit" className="scroll-mt-24 border border-[#d7d7d7]">
      {/* Hlavička lišty — nadpis, hvězdičkový vstup, tlačítko vpravo */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <h2 className="text-[16px] font-bold text-[#004d94]">Byl jsi zde? Ohodnoť to!</h2>

        <div className="flex items-center" aria-label="Tvé hodnocení (1–5 hvězdiček)">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rating === n}
              aria-label={`Ohodnotit ${n} z 5 hvězdiček`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => {
                setRating(n)
                openForm()
              }}
              className="p-0.5"
            >
              <Star
                aria-hidden="true"
                className={`h-[19px] w-[19px] transition-colors ${
                  n <= shownStars ? 'fill-[#f5a623] text-[#f5a623]' : 'fill-none text-[#9aa6b1]'
                }`}
                strokeWidth={1.5}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={openForm}
          className="ml-auto rounded-2xl bg-[#115094] px-5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#0d3f75]"
        >
          Napsat recenzi
        </button>
      </div>

      {open && (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="border-t border-[#e6eaee] bg-[#fafafa] px-4 py-5"
        >
          <input type="hidden" name="pageId" value={pageId} />
          <input type="hidden" name="renderedAt" value={renderedAt} />
          <input type="hidden" name="rating" value={rating || ''} />

          {/* Honeypot — skryté pole; vyplní ho jen robot. Mimo tab pořadí i čteček. */}
          <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label>
              Nevyplňuj toto pole
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <div className="mb-4">
            <label
              htmlFor="review-body"
              className="mb-1.5 block text-sm font-semibold text-gray-500"
            >
              Recenze
            </label>
            <textarea
              id="review-body"
              ref={bodyRef}
              name="body"
              required
              maxLength={5000}
              rows={8}
              placeholder="Poděl se o své zkušenosti a zážitky a buď inspirací pro ostatní cestovatele. Odkazy či jiné html prvky nelze vkládat pro snížení spamu bez přidané hodnoty. Nekvalitní či bez hodnotné recenze budou automaticky mazané."
              className="min-h-[140px] w-full resize-y rounded-xl border-[1.5px] border-[#e6eaee] bg-white px-3.5 py-3 text-[15px] leading-relaxed text-[#2c3643] outline-none transition focus:border-[#215491] focus:ring-[3px] focus:ring-[#e9f1f9]"
            />
          </div>

          <div className="mb-4 max-w-xs">
            <label
              htmlFor="review-name"
              className="mb-1.5 block text-sm font-semibold text-gray-500"
            >
              Jméno
            </label>
            <input
              id="review-name"
              name="authorName"
              type="text"
              required
              maxLength={80}
              placeholder="Tvé jméno"
              className="w-full rounded-xl border-[1.5px] border-[#e6eaee] bg-white px-3.5 py-3 text-[15px] text-[#2c3643] outline-none transition focus:border-[#215491] focus:ring-[3px] focus:ring-[#e9f1f9]"
            />
          </div>

          {turnstileSiteKey && (
            <div className="mb-4">
              <Turnstile ref={turnstileRef} siteKey={turnstileSiteKey} />
            </div>
          )}

          {state.status === 'error' && (
            <p role="alert" className="mb-4 text-sm font-medium text-red-600">
              {state.message}
            </p>
          )}
          {state.status === 'success' && (
            <p role="status" className="mb-4 text-sm font-medium text-green-700">
              Děkujeme! Recenze byla přidána.
            </p>
          )}

          <div className="flex items-center gap-3.5">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-2xl bg-[#115094] px-6 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#0d3f75] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Odesílám…' : 'Vložit recenzi'}
            </button>
            {!turnstileSiteKey && (
              <span className="text-[12.5px] text-gray-500">
                Chráněno proti spamu · bez opisování captchy
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
