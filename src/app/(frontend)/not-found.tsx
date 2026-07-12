import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-[#215491]">Chyba 404</p>
      <h1 className="text-3xl font-bold text-[#1a3f6c]">Stránka nenalezena</h1>
      <p className="max-w-md text-gray-600">
        Omlouváme se, ale požadovaná stránka neexistuje nebo byla přesunuta.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-[#215491] px-6 py-2.5 font-semibold text-white transition-colors hover:bg-[#1a4579]"
      >
        Zpět na úvodní stránku
      </Link>
    </div>
  )
}
