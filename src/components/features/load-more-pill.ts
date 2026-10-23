/**
 * Třídy pilulky „Načíst další…“ sdílené tlačítkem (LoadMoreButton, klient)
 * a odkazy <Link> na stránce zájezdů (server). Samostatný modul BEZ
 * 'use client': export řetězce z klientského souboru by server dostal jako
 * klientskou referenci, ne text (23. 10. 2026: „className.trim is not a function“).
 */
export const loadMorePillClass =
  'inline-flex items-center gap-2 rounded-full border-2 border-brand/30 px-7 py-3 text-sm font-bold uppercase tracking-wider text-brand font-heading transition-all btn-halo hover:border-brand'
export const loadMorePillIconClass = 'h-4 w-4'
