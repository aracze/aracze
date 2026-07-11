import { NextRequest, NextResponse } from 'next/server'
import { getFuse } from '@/lib/search'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const params = new URLSearchParams(searchParams)

  const fuse = await getFuse()
  const results = fuse.search(params.get('q') || '')

  return NextResponse.json({
    success: true,
    message: results,
  })
}
