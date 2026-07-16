import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  try {
    return new NextResponse(null, { status: 200 })
  } catch {
    return new NextResponse(null, { status: 503 })
  }
}
