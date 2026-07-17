'use client'

import { useEffect } from 'react'
import Link from 'next/link'

// Error boundary frontendu. Bez ní by výpadek DB při načítání stránky/článku
// buď spadl na generickou 500, nebo (dřív) se schoval za 404 „nenalezeno".
// Datová vrstva teď chybu DB záměrně propouští (viz fetchPageByFullSlug /
// fetchArticleBySlug v src/lib/payload.ts) a skončí tady — viditelně, se
// zalogováním, s možností „Zkusit znovu".
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Server chybu loguje sám; na klientu ji zalogujeme pro úplnost (a kvůli
    // `digest`, přes který se dá spárovat se serverovým logem v produkci).
    console.error('[frontend] neočekávaná chyba stránky:', error)
  }, [error])

  return (
    <main
      id="obsah"
      tabIndex={-1}
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 py-20 text-center focus:outline-none"
    >
      <p className="text-sm font-bold uppercase tracking-widest text-[#215491]">Chyba</p>
      <h1 className="text-3xl font-bold text-[#1a3f6c]">Něco se pokazilo</h1>
      <p className="max-w-md text-gray-600">
        Stránku se teď nepodařilo načíst. Zkuste to prosím za chvíli znovu.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-[#215491] px-6 py-2.5 font-semibold text-white transition-colors hover:bg-[#1a4579]"
        >
          Zkusit znovu
        </button>
        <Link
          href="/"
          className="rounded-full border border-[#215491] px-6 py-2.5 font-semibold text-[#215491] transition-colors hover:bg-[#215491]/10"
        >
          Zpět na úvodní stránku
        </Link>
      </div>
    </main>
  )
}
