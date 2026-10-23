'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal, preconnect } from 'react-dom'
import DOMPurify from 'isomorphic-dompurify'
import { MapPin, X } from 'lucide-react'
import type * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { googleMapsSearchUrl, tripadvisorSearchUrl } from '@/lib/tour-reviews'
import { ReviewChips } from './review-chips'
import { Stars } from './tour-row'
import { priceCzk } from './deals-section'

/**
 * Mapa hotelů na podstránce „Zájezdy“ (maketa B, 23. 10. 2026): malý náhled
 * v pravém panelu se shluky podle oblastí a po kliku celoobrazovkový překryv
 * — vlevo mapa s cenovými piny, vpravo seznam hotelů, který se přizpůsobuje
 * výřezu mapy (vzor Booking na počítači). Karty v seznamu stránky odkazují
 * přes `#hotel-<id>` a překryv se otevře vycentrovaný na hotel.
 *
 * Mapa: MapLibre + dlaždice OpenFreeMap ve vlastním stylu, stejně jako
 * MapLibreMap u míst (worker ze statického souboru kvůli Turbopacku, viz
 * tamní poznámka). Shluky dělá GeoJSON zdroj s `cluster: true` (kruhy
 * s počtem), jednotlivé hotely jsou HTML piny s cenou, které se při posunu
 * mapy dopočítávají z `querySourceFeatures` — 230 pinů na pobřeží by bez
 * shlukování byla nečitelná kaše.
 *
 * Data přicházejí ze serveru už odfiltrovaná (stejné filtry jako seznam);
 * hotely bez souřadnic na mapě nejsou.
 */

export interface TourMapHotel {
  id: number
  title: string
  stars: number | null
  /** „Marsa Alam · all inclusive · 7 nocí · odlet 22. 11. 2026 z Prahy“ */
  meta: string
  price: number
  originalPrice: number | null
  /** Cestovka („Čedok“). */
  source: string
  photoUrl: string | null
  lat: number
  lng: number
  /** Provizní odkaz (/go/zajezd/<id>). */
  href: string
  /** Letovisko pro hledání recenzí. */
  area: string | null
  /** Stránka hotelu u Invie (recenze), když je spárovaná. */
  inviaUrl: string | null
}

interface Props {
  hotels: TourMapHotel[]
  /** „do Egypta“ — pro nadpis překryvu. */
  genitive: string
  /** Krátký popis aktivních filtrů do záhlaví překryvu („all inclusive · týden · odlet z Česka“). */
  filtersSummary: string
}

const STYLE_URL = '/map-styles/aracze.json'
const SOURCE_ID = 'hotels'
/** `#mapa` otevře mapu celou, `#hotel-<id>` vycentrovanou na hotel (odkazy z karet). */
const HASH_PATTERN = /^#(?:mapa|hotel-(\d+))$/

/** Barvy tokenů z globals.css — MapLibre paint neumí CSS proměnné. */
function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const escapeHtml = (v: string) =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

type MapLib = typeof maplibregl
type MapInstance = maplibregl.Map

/** Minimální GeoJSON bez závislosti na @types/geojson (strukturálně sedí na MapLibre). */
interface HotelCollection {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { id: number; price: number }
  }[]
}

function toGeoJson(hotels: TourMapHotel[]): HotelCollection {
  return {
    type: 'FeatureCollection',
    features: hotels.map((h) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: { id: h.id, price: h.price },
    })),
  }
}

function boundsOf(lib: MapLib, hotels: TourMapHotel[]): maplibregl.LngLatBounds {
  const b = new lib.LngLatBounds()
  for (const h of hotels) b.extend([h.lng, h.lat])
  return b
}

/** Společný start mapy: worker, styl, atribuce; vrátí mapu až po `load`. */
async function createMap(
  lib: MapLib,
  container: HTMLElement,
  options: Partial<maplibregl.MapOptions>,
): Promise<MapInstance> {
  lib.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
  const map = new lib.Map({
    container,
    style: STYLE_URL,
    attributionControl: { compact: true },
    ...options,
  })
  await new Promise<void>((resolve, reject) => {
    map.once('load', () => resolve())
    map.once('error', (e: maplibregl.ErrorEvent) =>
      reject(new Error(e?.error?.message ?? 'Mapu se nepodařilo načíst')),
    )
  })
  return map
}

/** Zdroj + vrstvy shluků (kruh s počtem) — sdílí náhled i překryv. */
function addClusterLayers(map: MapInstance, hotels: TourMapHotel[], radius: number) {
  // Záloha pojmenovanou barvou (žádné hexy v komponentách); tokeny jsou vždy v globals.css.
  const fill = token('--color-brand-deep', 'navy')
  const stroke = token('--color-white', 'white')
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: toGeoJson(hotels),
    cluster: true,
    clusterRadius: radius,
    clusterMaxZoom: 12,
  })
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': fill,
      'circle-stroke-color': stroke,
      'circle-stroke-width': 2,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 22],
    },
  })
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Noto Sans Bold'],
      'text-size': 12,
    },
    paint: { 'text-color': stroke },
  })
}

export function TourMapPanel({ hotels, genitive, filtersSummary }: Props) {
  const [open, setOpen] = useState(false)
  const [focusId, setFocusId] = useState<number | null>(null)

  // Odkazy „Na mapě“ z karet: #hotel-<id> otevře překryv na daném hotelu.
  useEffect(() => {
    const check = () => {
      const m = HASH_PATTERN.exec(window.location.hash)
      if (m) {
        setFocusId(m[1] ? Number(m[1]) : null)
        setOpen(true)
      }
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setFocusId(null)
    if (HASH_PATTERN.test(window.location.hash)) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  if (hotels.length === 0) return null

  return (
    <>
      <MapPreview hotels={hotels} onOpen={() => setOpen(true)} />
      {open &&
        createPortal(
          <MapOverlay
            hotels={hotels}
            genitive={genitive}
            filtersSummary={filtersSummary}
            focusId={focusId}
            onClose={close}
          />,
          document.body,
        )}
    </>
  )
}

/** Tlačítko „Mapa“ pro šířky bez pravého panelu (otevře týž překryv přes hash). */
export function TourMapButton({ className }: { className?: string }) {
  return (
    <a href="#mapa" className={className}>
      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
      Mapa
    </a>
  )
}

/** Náhled v panelu: neinteraktivní mapa jen se shluky; celý je tlačítko. */
function MapPreview({ hotels, onOpen }: { hotels: TourMapHotel[]; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  preconnect('https://tiles.openfreemap.org', { crossOrigin: 'anonymous' })

  useEffect(() => {
    let map: MapInstance | null = null
    let cancelled = false
    ;(async () => {
      try {
        const lib = await import('maplibre-gl')
        if (cancelled || !ref.current) return
        map = await createMap(lib, ref.current, {
          interactive: false,
          attributionControl: false,
          bounds: boundsOf(lib, hotels),
          fitBoundsOptions: { padding: 28, maxZoom: 9 },
        })
        if (cancelled) return
        addClusterLayers(map, hotels, 40)
      } catch (err) {
        console.warn('[TourMap] náhled:', err)
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      map?.remove()
    }
  }, [hotels])

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative mb-4 block h-36 w-full overflow-hidden rounded-[10px] border border-line bg-surface-2 text-left"
      aria-label="Zobrazit hotely na mapě"
    >
      {!failed && <div ref={ref} className="h-full w-full" />}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/60 to-night/0 px-3 pt-7 pb-2.5 text-center font-heading text-label font-semibold text-white">
        Zobrazit na mapě
      </span>
    </button>
  )
}

function MapOverlay({
  hotels,
  genitive,
  filtersSummary,
  focusId,
  onClose,
}: {
  hotels: TourMapHotel[]
  genitive: string
  filtersSummary: string
  focusId: number | null
  onClose: () => void
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<MapInstance | null>(null)
  const pinsRef = useRef<Map<number, maplibregl.Marker>>(new Map())
  const [visibleIds, setVisibleIds] = useState<Set<number> | null>(null)
  const [activeId, setActiveId] = useState<number | null>(focusId)
  // Ref pro updatePins: efekt mapy běží jednou a jinak by držel počáteční activeId.
  const activeIdRef = useRef<number | null>(focusId)
  const [error, setError] = useState<string | null>(null)
  const byId = useRef(new Map(hotels.map((h) => [h.id, h])))

  // Překryv: zámek scrollu stránky + Escape.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const highlight = useCallback((id: number | null) => {
    setActiveId(id)
    activeIdRef.current = id
    for (const [pinId, marker] of pinsRef.current) {
      marker.getElement().classList.toggle('is-active', pinId === id)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const pins = pinsRef.current
    ;(async () => {
      try {
        const lib = await import('maplibre-gl')
        if (cancelled || !mapRef.current) return
        const focus = focusId !== null ? byId.current.get(focusId) : undefined
        const map = await createMap(lib, mapRef.current, {
          ...(focus
            ? { center: [focus.lng, focus.lat], zoom: 12 }
            : { bounds: boundsOf(lib, hotels), fitBoundsOptions: { padding: 60, maxZoom: 11 } }),
          locale: {
            'NavigationControl.ZoomIn': 'Přiblížit',
            'NavigationControl.ZoomOut': 'Oddálit',
            'NavigationControl.ResetBearing': 'Natočit na sever',
          },
        })
        if (cancelled) {
          map.remove()
          return
        }
        mapInstance.current = map
        map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-left')
        addClusterLayers(map, hotels, 55)

        const popup = new lib.Popup({
          offset: 14,
          closeButton: true,
          closeOnClick: true,
          focusAfterOpen: false,
          maxWidth: '260px',
        })
        const openPopup = (h: TourMapHotel) => {
          const photo = h.photoUrl?.startsWith('https://')
            ? `<img class="tour-popup__photo" src="${escapeHtml(h.photoUrl)}" alt="">`
            : ''
          const html = `
            <div class="tour-popup">
              ${photo}
              <div class="tour-popup__body">
                <div class="tour-popup__title">${escapeHtml(h.title)}</div>
                <div class="tour-popup__meta">${escapeHtml(h.meta)}</div>
                <div class="tour-popup__price">${escapeHtml(priceCzk(h.price))}
                  <span>za osobu · ${escapeHtml(h.source)}</span></div>
                <a class="tour-popup__cta" href="${escapeHtml(h.href)}" target="_blank" rel="nofollow sponsored noopener">Zobrazit zájezd</a>
                <div class="tour-popup__reviews">
                  <a class="tour-chip" href="${escapeHtml(tripadvisorSearchUrl(h.title, h.area))}" target="_blank" rel="nofollow noopener" aria-label="Recenze na Tripadvisoru"><img src="/assets/partners/tripadvisor.svg" alt="" class="tour-chip__logo" style="height:14px"><span class="tour-chip__wm">Tripadvisor</span></a><a class="tour-chip" href="${escapeHtml(googleMapsSearchUrl(h.title, h.area))}" target="_blank" rel="nofollow noopener" aria-label="Hodnocení na Mapách Google"><img src="/assets/partners/google-maps.svg" alt="" class="tour-chip__logo" style="height:14px"><span class="tour-chip__wm">Google</span></a>${
                    h.inviaUrl
                      ? `<a class="tour-chip" href="${escapeHtml(h.inviaUrl)}" target="_blank" rel="nofollow noopener" aria-label="Recenze na Invii"><img src="/assets/partners/invia.svg" alt="Invia" class="tour-chip__logo" style="height:10px"></a>`
                      : ''
                  }
                </div>
              </div>
            </div>`
          // Projektové pravidlo: každé HTML do DOM přes DOMPurify (odkaz ven potřebuje target/rel).
          popup
            .setLngLat([h.lng, h.lat])
            .setHTML(DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] }))
            .addTo(map)
        }

        // Piny jednotlivých hotelů podle toho, co zrovna není ve shluku.
        const updatePins = () => {
          if (!map.isSourceLoaded(SOURCE_ID)) return
          const features = map.querySourceFeatures(SOURCE_ID, {
            filter: ['!', ['has', 'point_count']],
          })
          const seen = new Set<number>()
          for (const f of features) {
            const id = Number(f.properties?.id)
            const h = byId.current.get(id)
            if (!h || seen.has(id)) continue
            seen.add(id)
            if (pins.has(id)) continue
            const el = document.createElement('button')
            el.type = 'button'
            el.className = 'tour-pin'
            el.textContent = priceCzk(h.price)
            el.setAttribute('aria-label', `${h.title}, ${priceCzk(h.price)}`)
            if (id === activeIdRef.current) el.classList.add('is-active')
            el.addEventListener('click', (e) => {
              e.stopPropagation()
              highlight(id)
              openPopup(h)
              document
                .getElementById(`tour-map-item-${id}`)
                ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            })
            const marker = new lib.Marker({ element: el, anchor: 'bottom' })
              .setLngLat([h.lng, h.lat])
              .addTo(map)
            pins.set(id, marker)
          }
          for (const [id, marker] of pins) {
            if (!seen.has(id)) {
              marker.remove()
              pins.delete(id)
            }
          }
        }
        const updateList = () => {
          const b = map.getBounds()
          const ids = new Set<number>()
          for (const h of hotels) if (b.contains([h.lng, h.lat])) ids.add(h.id)
          setVisibleIds(ids)
        }
        map.on('sourcedata', (e: maplibregl.MapSourceDataEvent) => {
          if (e.sourceId === SOURCE_ID && map.isSourceLoaded(SOURCE_ID)) updatePins()
        })
        map.on('moveend', () => {
          updatePins()
          updateList()
        })
        map.on('zoomend', updatePins)
        updatePins()
        updateList()

        // Klik na shluk → přiblížit, až se rozpadne.
        map.on('click', 'clusters', async (e: maplibregl.MapMouseEvent) => {
          const feature = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]
          const clusterId = feature?.properties?.cluster_id
          const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
          if (clusterId === undefined || !source) return
          const zoom = await source.getClusterExpansionZoom(clusterId)
          const [lng, lat] = (feature.geometry as { coordinates: [number, number] }).coordinates
          map.easeTo({ center: [lng, lat], zoom })
        })
        map.on('mouseenter', 'clusters', () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', 'clusters', () => (map.getCanvas().style.cursor = ''))

        if (focus) openPopup(focus)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Mapu se nepodařilo načíst')
      }
    })()
    return () => {
      cancelled = true
      for (const marker of pins.values()) marker.remove()
      pins.clear()
      mapInstance.current?.remove()
      mapInstance.current = null
    }
    // Mapa se staví jednou za otevření překryvu; hotely i focus jsou dané při otevření.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const listed = visibleIds ? hotels.filter((h) => visibleIds.has(h.id)) : hotels

  const showAll = useCallback(async () => {
    const map = mapInstance.current
    if (!map) return
    const lib = await import('maplibre-gl')
    map.fitBounds(boundsOf(lib, hotels), { padding: 60, maxZoom: 11 })
  }, [hotels])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Hotely na mapě ${genitive}`}
      className="tour-map-overlay fixed inset-0 z-[300] flex flex-col bg-white"
    >
      <style>{`
        .tour-pin { position: relative; background: var(--color-white); border: 1.5px solid var(--color-brand); color: var(--color-brand-deep); font: 700 var(--text-label) / 1 var(--font-heading); padding: 6px 9px; border-radius: 999px; white-space: nowrap; box-shadow: 0 2px 8px color-mix(in srgb, var(--color-night) 18%, transparent); cursor: pointer; }
        .tour-pin::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 8px; height: 8px; background: inherit; border-right: 1.5px solid var(--color-brand); border-bottom: 1.5px solid var(--color-brand); transform: translateX(-50%) rotate(45deg); }
        .tour-pin:hover, .tour-pin.is-active { background: var(--color-brand); color: var(--color-white); }
        .maplibregl-marker:has(.tour-pin:hover), .maplibregl-marker:has(.tour-pin.is-active) { z-index: 2; }
        .tour-pin:focus-visible { outline: 3px solid color-mix(in srgb, var(--color-brand) 35%, transparent); outline-offset: 2px; }
        .tour-popup { font-family: var(--font-sans); }
        .tour-popup__photo { width: 100%; height: 110px; object-fit: cover; display: block; }
        .tour-popup__body { padding: 10px 12px 12px; }
        .tour-popup__title { font-family: var(--font-heading); font-weight: 600; font-size: var(--text-label); line-height: 1.3; color: var(--color-ink); }
        .tour-popup__meta { color: var(--color-ink-3); font-size: var(--text-meta); margin-top: 2px; }
        .tour-popup__price { margin-top: 6px; font-family: var(--font-heading); font-weight: 700; color: var(--color-brand-deep); font-size: var(--text-body); font-variant-numeric: tabular-nums; }
        .tour-popup__price span { font-family: var(--font-sans); font-weight: 400; font-size: var(--text-meta); color: var(--color-ink-3); }
        .tour-popup__cta { display: inline-block; margin-top: 8px; background: var(--color-brand); color: var(--color-white); border-radius: 999px; padding: 6px 12px; font-family: var(--font-heading); font-size: var(--text-meta); font-weight: 700; text-decoration: none; }
        .tour-popup__cta:hover { background: var(--color-brand-deep); text-decoration: none; }
        .tour-popup__reviews { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .tour-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; border: 1px solid var(--color-line); border-radius: 999px; padding: 0 10px; color: var(--color-ink-3); text-decoration: none; }
        .tour-chip:hover { border-color: var(--color-line-strong); color: var(--color-ink); text-decoration: none; }
        .tour-chip__logo { width: auto; filter: grayscale(1); opacity: .7; transition: filter .15s, opacity .15s; }
        .tour-chip:hover .tour-chip__logo { filter: none; opacity: 1; }
        .tour-chip__wm { font: 700 var(--text-meta) / 1 var(--font-heading); }
        .tour-map-overlay .maplibregl-popup-content { padding: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 28px color-mix(in srgb, var(--color-brand-deep) 25%, transparent); }
        .tour-map-overlay .maplibregl-popup-close-button { top: 6px; right: 6px; width: 30px; height: 30px; border-radius: 50%; background: color-mix(in srgb, var(--color-night) 55%, transparent); color: var(--color-white); font-size: var(--text-lead-lg); line-height: 1; z-index: 10; }
        .tour-map-overlay .maplibregl-ctrl-group { box-shadow: 0 2px 8px color-mix(in srgb, var(--color-night) 18%, transparent); }
      `}</style>
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h2 className="font-heading text-lead font-semibold text-ink">
            Hotely na mapě {genitive}
          </h2>
          <p className="truncate text-label text-ink-3">
            {listed.length === hotels.length
              ? `${hotels.length} hotelů`
              : `${listed.length} z ${hotels.length} hotelů ve výřezu`}
            {filtersSummary ? ` · ${filtersSummary}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít mapu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink-2 hover:bg-surface-2"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[55vh] min-h-0 flex-1 lg:h-auto">
          {error ? (
            <div className="flex h-full items-center justify-center bg-surface p-6 text-center text-small text-ink-2">
              Mapa není dostupná: {error}
            </div>
          ) : (
            <div ref={mapRef} className="h-full w-full" />
          )}
        </div>
        <div
          ref={listRef}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-t border-line bg-surface p-3 lg:w-[360px] lg:flex-none lg:border-t-0 lg:border-l"
        >
          {listed.map((h) => (
            <article
              key={h.id}
              id={`tour-map-item-${h.id}`}
              onMouseEnter={() => highlight(h.id)}
              onMouseLeave={() => highlight(null)}
              className={`relative grid grid-cols-[84px_1fr] gap-3 rounded-xl border bg-white p-2 ${
                activeId === h.id
                  ? 'border-brand shadow-[0_6px_18px_rgba(26,63,108,0.15)]'
                  : 'border-line'
              }`}
            >
              <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-surface-2">
                {h.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={h.photoUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <a
                  href={h.href}
                  target="_blank"
                  rel="nofollow sponsored noopener"
                  className="font-heading text-label leading-snug font-semibold text-ink after:absolute after:inset-0 hover:no-underline"
                >
                  {h.title}
                  {h.stars ? (
                    <>
                      {' '}
                      <Stars count={h.stars} />
                    </>
                  ) : null}
                </a>
                <p className="truncate text-meta text-ink-3">{h.meta}</p>
                <p className="mt-0.5 font-heading text-small font-semibold text-brand-deep tabular-nums">
                  {priceCzk(h.price)}{' '}
                  <span className="font-sans text-meta font-normal text-ink-3">{h.source}</span>
                </p>
                <ReviewChips
                  title={h.title}
                  area={h.area}
                  inviaUrl={h.inviaUrl}
                  label={false}
                  className="mt-1.5"
                />
              </div>
            </article>
          ))}
          {listed.length === 0 && (
            <div className="p-4 text-center text-small text-ink-3">
              <p>V tomhle výřezu žádný hotel není.</p>
              <button
                type="button"
                onClick={showAll}
                className="mt-3 rounded-full border border-line-strong px-4 py-2 font-heading text-label font-semibold text-ink hover:bg-surface-2"
              >
                Zobrazit všechny hotely
              </button>
            </div>
          )}
          <p className="px-2 pt-1 text-center text-meta text-ink-3">
            Posuň mapu a seznam se přizpůsobí.
          </p>
        </div>
      </div>
    </div>
  )
}
