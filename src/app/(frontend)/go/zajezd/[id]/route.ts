import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { cjDeepLink, tourSourceById } from '@/lib/tour-sources'

/**
 * Provizní redirect na konkrétní zájezd u cestovky (karty na podstránce
 * „Zájezdy“). Stejný vzor jako /go/ubytovani: vlastní důvěryhodná adresa na
 * ara.cz místo tracking domény CJ, robots.txt /go/ vylučuje.
 *
 * Cíl se NEBERE z adresy, ale z řádku kolekce `tour-offers` podle id —
 * deep-link je adresa z feedu cestovky (ověřená proti její doméně
 * v `cjDeepLink`), takže z redirectu nejde udělat otevřený redirect jinam.
 * Nabídka, která už v kolekci není (včerejší karta po nočním syncu), vede
 * na obecný odkaz cestovky, když ji adresa nese v `?ck=`; jinak 404.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d{1,10}$/.test(id)) return new NextResponse('Not found', { status: 404 })

  const payload = await getDb()
  try {
    const offer = await payload.findByID({
      collection: 'tour-offers',
      id: Number(id),
      overrideAccess: true,
      depth: 0,
      select: { source: true, detailUrl: true },
    })
    const source = tourSourceById(offer.source)
    if (source) return NextResponse.redirect(cjDeepLink(source, offer.detailUrl), 302)
  } catch {
    /* nenalezeno → níže */
  }
  const fallback = tourSourceById(req.nextUrl.searchParams.get('ck') ?? '')
  if (fallback) return NextResponse.redirect(fallback.cjClickUrl, 302)
  return new NextResponse('Not found', { status: 404 })
}
