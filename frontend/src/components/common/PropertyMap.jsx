// Stohill Properties - Property map (Leaflet)
//
// Tiles come from OpenStreetMap by default, which needs no API key. To use a
// commercial provider (MapTiler, Mapbox, Thunderforest...), set at build time:
//   VITE_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=YOUR_KEY
//   VITE_MAP_ATTRIBUTION="&copy; MapTiler &copy; OpenStreetMap contributors"
//
// Two uses:
//   <PropertyMap properties={rows} onSelect={(p) => ...} />      markers for properties
//   <PropertyMap picker value={{ lat, lng }} onPick={setLatLng} />  click to set a location
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION
  || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
// Harare: the company's home market, used when nothing is plotted yet.
const DEFAULT_CENTER = [-17.8292, 31.0522]

const STATUS_COLOURS = {
  available: '#10b981',
  occupied: '#3b82f6',
  listed_sale: '#E5A645',
  listed_rent: '#a855f7',
  under_contract: '#f59e0b',
  sold: '#6b7280',
}

export const hasCoordinates = (p) =>
  p && p.latitude !== null && p.latitude !== undefined && p.latitude !== '' &&
  p.longitude !== null && p.longitude !== undefined && p.longitude !== '' &&
  !Number.isNaN(parseFloat(p.latitude)) && !Number.isNaN(parseFloat(p.longitude))

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export default function PropertyMap({ properties = [], onSelect, picker = false, value, onPick, className = 'h-[28rem]' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const onPickRef = useRef(onPick)
  onSelectRef.current = onSelect
  onPickRef.current = onPick

  // Create the map once.
  useEffect(() => {
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(DEFAULT_CENTER, 6)
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: ATTRIBUTION,
      // The site sends Referrer-Policy: same-origin; OpenStreetMap's tile
      // servers refuse requests without a referrer, so send the origin.
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    if (picker) {
      map.on('click', (e) => onPickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    }
    mapRef.current = map
    // The container may have been sized after mount (tabs, side panels).
    const resize = setTimeout(() => map.invalidateSize(), 200)
    return () => {
      clearTimeout(resize)
      map.remove()
      mapRef.current = null
    }
  }, [picker])

  // Markers for the property list.
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer || picker) return
    layer.clearLayers()
    const points = properties.filter(hasCoordinates)
    points.forEach((p) => {
      const latlng = [parseFloat(p.latitude), parseFloat(p.longitude)]
      const marker = L.circleMarker(latlng, {
        radius: 9, weight: 2, color: '#ffffff', fillColor: STATUS_COLOURS[p.status] || '#E5A645', fillOpacity: 0.95,
      })
      marker.bindTooltip(
        `<strong>${escapeHtml(p.name)}</strong><br/>${escapeHtml([p.suburb, p.city].filter(Boolean).join(', '))}`,
        { direction: 'top', offset: [0, -8] },
      )
      marker.on('click', () => onSelectRef.current?.(p))
      marker.addTo(layer)
    })
    if (points.length === 1) {
      map.setView([parseFloat(points[0].latitude), parseFloat(points[0].longitude)], 14)
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map((p) => [parseFloat(p.latitude), parseFloat(p.longitude)])), { padding: [40, 40] })
    }
  }, [properties, picker])

  // The picked location.
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer || !picker) return
    layer.clearLayers()
    if (value && hasCoordinates({ latitude: value.lat, longitude: value.lng })) {
      const latlng = [parseFloat(value.lat), parseFloat(value.lng)]
      L.circleMarker(latlng, { radius: 9, weight: 2, color: '#ffffff', fillColor: '#E5A645', fillOpacity: 0.95 }).addTo(layer)
      map.setView(latlng, Math.max(map.getZoom(), 15))
    }
  }, [value, picker])

  return <div ref={containerRef} className={`w-full rounded-xl overflow-hidden border border-white/10 z-0 ${className}`} />
}
