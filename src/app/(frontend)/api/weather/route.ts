import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const { lat, lng } = await request.json()

    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !isFinite(lat) ||
      !isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return NextResponse.json(
        { error: 'Valid latitude and longitude are required' },
        { status: 400 },
      )
    }

    const premiumKey = process.env.OPENWEATHER_API_KEY
    if (!premiumKey) {
      console.error('OPENWEATHER_API_KEY is not defined in environment variables')
      return NextResponse.json({ error: 'OpenWeather API configuration missing' }, { status: 500 })
    }

    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&appid=${premiumKey}&units=metric&exclude=minutely,alerts`

    // Zrušíme požadavek po 10 s, ať se route nezasekne na pomalém upstreamu.
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    const weatherJson = await response.json()

    if (!response.ok) {
      // Nevracíme tělo upstreamu (může nést interní detaily) — jen generická
      // chyba s upstream statusem.
      return NextResponse.json(
        { error: 'Failed to fetch weather forecast' },
        { status: response.status },
      )
    }

    return NextResponse.json(weatherJson)
  } catch {
    // Bez objektu chyby / URL — URL obsahuje API klíč, nesmí do logu.
    console.error('Error fetching weather forecast')
    return NextResponse.json({ error: 'Failed to fetch weather forecast' }, { status: 500 })
  }
}
