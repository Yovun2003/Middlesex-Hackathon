import { useEffect, useRef, useState } from 'react'
import type { Map as LibreMap, Marker } from 'maplibre-gl'
import { canRenderWebGL, getPlace, markerLabels, prefersReducedMotion, type MapProps } from './geo'
import { ReliefMap } from './Island'
import './visuals.css'

export default function GeoMap(props: MapProps) {
  const mapNode = useRef<HTMLDivElement>(null)
  const map = useRef<LibreMap | null>(null)
  const createMarker = useRef<typeof import('maplibre-gl').Marker | null>(null)
  const markers = useRef(new Map<string, Marker>())
  const pickRef = useRef(props.onPick); pickRef.current = props.onPick
  const pinMarker = useRef<Marker | null>(null)
  const previousSelection = useRef(props.selectedId)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    let disposed = false
    let instance: LibreMap | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    setStatus('loading')
    if (!canRenderWebGL()) {
      setStatus('unavailable')
      return
    }
    async function init() {
      try {
        const [{ Map, Marker, NavigationControl, ScaleControl }] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ])
        if (disposed || !mapNode.current) return
        instance = new Map({
          container: mapNode.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                maxzoom: 19,
                attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>',
              },
            },
            layers: [
              { id: 'ocean', type: 'background', paint: {'background-color': '#b8d9e3'} },
              { id: 'osm-streets', type: 'raster', source: 'osm', paint: {'raster-saturation': -0.22, 'raster-contrast': -0.04} },
            ],
          },
          bounds: [[57.305, -20.535], [57.81, -19.99]],
          fitBoundsOptions: { padding: 42 },
          maxBounds: [[56.9, -20.9], [58.22, -19.59]],
          maxZoom: 19,
          minZoom: 8,
          renderWorldCopies: false,
          dragRotate: false,
          pitchWithRotate: false,
          scrollZoom: false,
          attributionControl: { compact: false },
        })
        if (props.center) instance.jumpTo({ center: props.center, zoom: 14 })
        map.current = instance
        createMarker.current = Marker
        instance.on('click', event => { if (pickRef.current) pickRef.current([Number(event.lngLat.lng.toFixed(6)), Number(event.lngLat.lat.toFixed(6))]) })
        instance.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
        instance.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
        instance.getCanvas().setAttribute('aria-label', 'Mauritius street map. Use arrow keys to move and plus or minus to zoom.')
        let hasRasterTile = false
        let settled = false
        const settle = () => {
          settled = true
          if (timer) clearTimeout(timer)
          setStatus(hasRasterTile ? 'ready' : 'unavailable')
        }
        instance.on('sourcedata', event => {
          if (event.sourceId !== 'osm' || event.tile?.state !== 'loaded') return
          hasRasterTile = true
          if (settled) setStatus('ready')
        })
        instance.on('error', event => { if (!('tile' in event)) settle() })
        instance.on('webglcontextlost', () => setStatus('unavailable'))
        timer = setTimeout(settle, 6500)
        instance.once('idle', settle)
      } catch {
        if (!disposed) setStatus('unavailable')
      }
    }
    void init()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      markers.current.forEach(marker => marker.remove())
      markers.current.clear()
      pinMarker.current?.remove(); pinMarker.current = null
      instance?.remove()
      map.current = null
      createMarker.current = null
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !map.current || !createMarker.current) return
    const active = map.current
    const MarkerClass = createMarker.current
    const seen = new Set<string>()
    for (const incident of props.incidents) {
      const coordinate = incident.coordinate ?? getPlace(incident.town)
      if (!coordinate) continue
      seen.add(incident.id)
      let marker = markers.current.get(incident.id)
      if (!marker) {
        const button = document.createElement('button')
        button.type = 'button'
        marker = new MarkerClass({ element: button }).setLngLat(coordinate).addTo(active)
        markers.current.set(incident.id, marker)
      }
      marker.setLngLat(coordinate)
      const button = marker.getElement()
      button.classList.remove('critical', 'response', 'leak', 'verified')
      button.classList.add('geographic-marker', incident.tone)
      button.setAttribute('aria-label', `${incident.town}, ${markerLabels[incident.tone]}`)
      button.setAttribute('aria-pressed', String(incident.id === props.selectedId))
      button.title = incident.town
      button.onclick = () => props.onSelect(incident.id)
    }
    for (const [id, marker] of markers.current) {
      if (seen.has(id)) continue
      marker.remove()
      markers.current.delete(id)
    }
  }, [status, props.incidents, props.selectedId, props.onSelect])

  useEffect(() => {
    if (status !== 'ready' || previousSelection.current === props.selectedId || !map.current) return
    previousSelection.current = props.selectedId
    const place = props.incidents.find(incident => incident.id === props.selectedId)
    const location = place && (place.coordinate ?? getPlace(place.town))
    if (!location) return
    if (prefersReducedMotion()) map.current.jumpTo({ center: location, zoom: 11.4 })
    else map.current.flyTo({ center: location, zoom: 11.4, duration: 1100 })
  }, [props.selectedId, props.incidents, status])

  useEffect(() => {
    if (!props.pin || !map.current || !createMarker.current) return
    if (!pinMarker.current) { pinMarker.current = new createMarker.current({ color: '#b94930', draggable: true }).setLngLat(props.pin).addTo(map.current); pinMarker.current.on('dragend', () => { const p = pinMarker.current!.getLngLat(); pickRef.current?.([Number(p.lng.toFixed(6)), Number(p.lat.toFixed(6))]) }) }
    else pinMarker.current.setLngLat(props.pin)
  }, [props.pin, status])

  return <div className="geographic-map">
    {status !== 'ready' && <ReliefMap {...props} loading={status === 'loading'} />}
    {!props.onPick && status === 'ready' && <button className="map-center-pick" type="button" onClick={()=>map.current?.fitBounds([[57.305,-20.535],[57.81,-19.99]],{padding:42,duration:prefersReducedMotion()?0:500})}>Show all Mauritius</button>}
    {props.onPick && status === 'ready' && <button type="button" className="map-center-pick" onClick={() => { const p=map.current?.getCenter(); if(p) props.onPick?.([Number(p.lng.toFixed(6)),Number(p.lat.toFixed(6))]) }}>Use centre of map</button>}
    {status === 'loading' && <div className="street-loading" role="status">Loading street map…</div>}
    <div className={`geographic-map-layer ${status === 'ready' ? 'is-loaded' : ''}`} ref={mapNode} aria-hidden={status !== 'ready'} inert={status !== 'ready'} />
  </div>
}
