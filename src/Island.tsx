/// <reference types="vite/client" />
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { Compass, Minus, Plus, RotateCcw } from 'lucide-react'
import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BufferAttribute, BufferGeometry, Color, OrthographicCamera, PlaneGeometry, SRGBColorSpace, TextureLoader, Vector3 } from 'three'
import { canRenderWebGL, elevationScale, getPlace, markerLabels, prefersReducedMotion, terrainLength, terrainPosition, terrainWidth, type Coordinate, type MapProps } from './geo'
import './visuals.css'

type Heightmap = { values: Float32Array; width: number; height: number }
type View = { azimuth: number; elevation: number; zoom: number; x: number; z: number }
type Size = { width: number; height: number }
const initialView: View = { azimuth: -0.52, elevation: 0.88, zoom: 1, x: 0.04, z: 0.06 }
const asset = (name: string) => import.meta.env.BASE_URL + name
const viewScale = (size: Size, zoom: number) => Math.min(size.width / 10.8, size.height / 9.5) * zoom

export class RenderBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export function useElementSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 700, height: 420 })
  useLayoutEffect(() => {
    if (!ref.current) return
    const sizeNode = ref.current
    const measure = () => setSize({ width: Math.max(1, sizeNode.clientWidth), height: Math.max(1, sizeNode.clientHeight) })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(sizeNode)
    return () => observer.disconnect()
  }, [])
  return { ref, size }
}

function getTerrainHeight(data: Heightmap | undefined, x: number, z: number) {
  if (!data) return 0
  const row = Math.max(0, Math.min(data.height - 1, Math.round((z / terrainLength + 0.5) * (data.height - 1))))
  const column = Math.max(0, Math.min(data.width - 1, Math.round((x / terrainWidth + 0.5) * (data.width - 1))))
  return data.values[row * data.width + column] * elevationScale
}

function useElevation(onError: () => void) {
  const [heightmap, setHeightmap] = useState<Heightmap>()
  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth
      const height = image.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        onError()
        return
      }
      context.drawImage(image, 0, 0)
      const raw = context.getImageData(0, 0, width, height).data
      const values = new Float32Array(width * height)
      for (let index = 0; index < values.length; index++) {
        values[index] = (raw[index * 4] * 256 + raw[index * 4 + 1]) / 16
      }
      setHeightmap({ values, width, height })
    }
    image.onerror = onError
    image.src = asset('mauritius-height.png')
    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [onError])
  return heightmap
}

function makeCamera(view: View, {width, height}: Size, flat = false) {
  const scale = viewScale({width, height}, view.zoom)
  const camera = new OrthographicCamera(-width / (2 * scale), width / (2 * scale), height / (2 * scale), -height / (2 * scale), 0.1, 100)
  Object.assign(camera, { manual: true })
  const elevation = flat ? 1.46 : view.elevation
  const azimuth = flat ? view.azimuth * 0.65 : view.azimuth
  const horizontal = 18 * Math.cos(elevation)
  camera.position.set(view.x + horizontal * Math.sin(azimuth), 18 * Math.sin(elevation), view.z + horizontal * Math.cos(azimuth))
  camera.lookAt(view.x, flat ? 0 : 0.24, view.z)
  camera.updateMatrixWorld()
  return camera
}

export function projectPoint(camera: OrthographicCamera, { width, height }: Size, x: number, y: number, z: number) {
  const point = new Vector3(x, y, z).project(camera)
  return { left: (point.x * 0.5 + 0.5) * width, top: (0.5 - point.y * 0.5) * height }
}

function CameraSync({ camera }: { camera: OrthographicCamera }) {
  const set = useThree(state => state.set)
  const invalidate = useThree(state => state.invalidate)
  useLayoutEffect(() => {
    set({ camera })
    invalidate()
  }, [camera, set, invalidate])
  return null
}

function Terrain({ heightmap, onReady }: { heightmap: Heightmap; onReady: () => void }) {
  const texture = useLoader(TextureLoader, asset('mauritius-colour.webp'))
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  const geometry = useMemo(() => {
    const surface = new PlaneGeometry(terrainWidth, terrainLength, 168, 196)
    surface.rotateX(-Math.PI / 2)
    const vertex = surface.getAttribute('position')
    const weights = new Float32Array(vertex.count * 3)
    const illuminated = new Color('#fff8d8')
    const neutral = new Color('#ffffff')
    const colour = new Color()
    for (let index = 0; index < vertex.count; index++) {
      const y = getTerrainHeight(heightmap, vertex.getX(index), vertex.getZ(index))
      vertex.setY(index, y)
      colour.copy(neutral).lerp(illuminated, Math.min(0.8, y * 0.45)).toArray(weights, index * 3)
    }
    surface.setAttribute('color', new BufferAttribute(weights, 3))
    surface.computeVertexNormals()
    return surface
  }, [heightmap])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(onReady, [onReady])
  return <mesh geometry={geometry}><meshStandardMaterial map={texture} vertexColors roughness={0.88} metalness={0} transparent /></mesh>
}

function GuideLines() {
  const geometry = useMemo(() => {
    const points: number[] = []
    for (let index = -8; index <= 8; index++) {
      points.push(index, -0.02, -8, index, -0.02, 8, -8, -0.02, index, 8, -0.02, index)
    }
    const grid = new BufferGeometry()
    grid.setAttribute('position', new BufferAttribute(new Float32Array(points), 3))
    return grid
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#78b0bc" transparent opacity={0.13} depthWrite={false} /></lineSegments>
}

function ReliefImage({ camera, size }: { camera: OrthographicCamera; size: Size }) {
  const start = projectPoint(camera, size, -terrainWidth / 2, 0, -terrainLength / 2)
  const east = projectPoint(camera, size, terrainWidth / 2, 0, -terrainLength / 2)
  const south = projectPoint(camera, size, -terrainWidth / 2, 0, terrainLength / 2)
  const imageWidth = 840
  const imageHeight = 980
  const transform = [
    (east.left - start.left) / imageWidth, (east.top - start.top) / imageWidth,
    (south.left - start.left) / imageHeight, (south.top - start.top) / imageHeight,
    start.left, start.top,
  ].join(',')
  return <img src={asset('mauritius-relief.webp')} className="island-relief" width={imageWidth} height={imageHeight} style={{transform: `matrix(${transform})`}} alt="" draggable={false} />
}

function MapMarkers({ incidents, selectedId, onSelect, position }: MapProps & { position: (coordinate: Coordinate) => { left: number; top: number } }) {
  return incidents.map(incident => {
    const coordinate = getPlace(incident.town)
    if (!coordinate) return null
    const direction = ['Beau Bassin', 'Port Louis', 'Bambous', 'Mahébourg'].includes(incident.town) ? 'marker-left' : 'marker-right'
    return <button
      type="button"
      className={`island-marker ${direction} ${incident.tone}`}
      key={incident.id}
      style={position(coordinate)}
      aria-label={`${incident.town}, ${markerLabels[incident.tone]}`}
      aria-pressed={selectedId === incident.id}
      onClick={() => onSelect(incident.id)}
    >
      <span className="map-marker-dot" aria-hidden="true" />
      <span className="map-marker-label">{incident.town}</span>
    </button>
  })
}

function MapCredits() {
  return <details className="map-credits" onKeyDown={event => {
    if (event.key === 'Escape' && event.currentTarget.open) {
      event.stopPropagation()
      event.currentTarget.open = false
      event.currentTarget.querySelector('summary')?.focus()
    }
  }}>
    <summary>Map credits</summary>
    <div>Elevation from Mapzen Terrain Tiles. Coastline made with Natural Earth.</div>
  </details>
}

export function ReliefMap(props: MapProps & { loading?: boolean }) {
  const { ref, size } = useElementSize()
  const selected = props.incidents.find(incident => incident.id === props.selectedId)
  const coordinate = selected && getPlace(selected.town)
  const [x, z] = coordinate ? terrainPosition(coordinate) : [0, 0]
  const camera = useMemo(() => makeCamera({ ...initialView, azimuth: 0, x: x * 0.72, z: z * 0.72, zoom: selected ? 1.16 : 0.88 }, size, true), [selected, size, x, z])
  return <div className="island-map relief-map" ref={ref} aria-label="Mauritius relief map with selectable incident locations">
    <ReliefImage camera={camera} size={size} />
    <MapMarkers {...props} position={coordinate => {
      const [x, z] = terrainPosition(coordinate)
      return projectPoint(camera, size, x, 0, z)
    }} />
    <div className="terrain-caption"><Compass size={14} /> {props.loading ? 'Relief map' : 'Relief map · street tiles unavailable'}</div>
    <div className="island-attribution relief-attribution"><MapCredits /></div>
  </div>
}

export default function Island({ incidents, selectedId, onSelect }: MapProps) {
  const { ref, size } = useElementSize()
  const [available, setAvailable] = useState(canRenderWebGL)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState(initialView)
  const activeTween = useRef<gsap.core.Tween | undefined>(undefined)
  const drag = useRef<{ startX: number; startY: number; azimuth: number; elevation: number } | undefined>(undefined)
  const previousSelection = useRef(selectedId)
  const fail = useMemo(() => () => setAvailable(false), [])
  const finish = useMemo(() => () => setReady(true), [])
  const heightmap = useElevation(fail)
  const camera = useMemo(() => makeCamera(view, size), [view, size])
  const real = available && ready

  useEffect(() => {
    const node = ref.current
    node?.addEventListener('webglcontextlost', fail, true)
    return () => {
      node?.removeEventListener('webglcontextlost', fail, true)
      activeTween.current?.kill()
    }
  }, [fail, ref])

  const move = useCallback((destination: Partial<View>) => {
    activeTween.current?.kill()
    if (prefersReducedMotion()) {
      setView({ ...view, ...destination })
      return
    }
    const model = {...view}
    activeTween.current = gsap.to(model, { ...destination, duration: 0.66, ease: 'power2.inOut', onUpdate: () => setView({...model}) })
  }, [view])

  useEffect(() => {
    if (previousSelection.current === selectedId) return
    previousSelection.current = selectedId
    if (!selectedId) {
      move(initialView)
      return
    }
    const incident = incidents.find(item => item.id === selectedId)
    const coordinate = incident && getPlace(incident.town)
    if (coordinate) {
      const [x, z] = terrainPosition(coordinate)
      move({ x: x * 0.78, z: z * 0.76, zoom: 1.32 })
    }
  }, [incidents, move, selectedId])

  const zoom = (increment: number) => move({zoom: Math.max(0.75, Math.min(2.3, view.zoom + increment))})

  return <div
    className="island-map"
    ref={ref}
    role="region"
    aria-label="Interactive Mauritius terrain. Use arrow keys to tilt or rotate, plus or minus to zoom, and Home to reset."
    tabIndex={0}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return
      switch (event.key) {
        case 'ArrowLeft': move({ azimuth: view.azimuth - 0.26 }); break
        case 'ArrowRight': move({ azimuth: view.azimuth + 0.26 }); break
        case 'ArrowUp': move({ elevation: Math.min(1.42, view.elevation + 0.12) }); break
        case 'ArrowDown': move({ elevation: Math.max(0.5, view.elevation - 0.12) }); break
        case '+':
        case '=': zoom(0.24); break
        case '-': zoom(-0.24); break
        case 'Home': move(initialView); break
        default: return
      }
      event.preventDefault()
    }}
    onPointerDown={event => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button, a, summary, details')) return
      activeTween.current?.kill()
      drag.current = {startX: event.clientX, startY: event.clientY, azimuth: view.azimuth, elevation: view.elevation}
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event => {
      const origin = drag.current
      if (!origin) return
      setView(current => ({
        ...current,
        azimuth: origin.azimuth - (event.clientX - origin.startX) * 0.006,
        elevation: Math.min(1.45, Math.max(0.5, origin.elevation + (event.clientY - origin.startY) * 0.004)),
      }))
    }}
    onLostPointerCapture={() => { drag.current = undefined }}
  >
    <ReliefImage camera={camera} size={size} />
    {available && heightmap && <div className={`island-canvas ${ready ? 'is-loaded' : ''}`} aria-hidden="true">
      <RenderBoundary onError={fail}>
        <Canvas camera={camera} dpr={[1, 1.35]} frameloop="demand" gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
          <CameraSync camera={camera} />
          <ambientLight intensity={1.0} color="#bfdae4" />
          <directionalLight intensity={2.25} color="#fff0c6" position={[-7, 11, -5]} />
          <Suspense fallback={null}><Terrain heightmap={heightmap} onReady={finish} /></Suspense>
          <GuideLines />
        </Canvas>
      </RenderBoundary>
    </div>}
    <div className="island-vignette" aria-hidden="true" />
    <MapMarkers incidents={incidents} selectedId={selectedId} onSelect={onSelect} position={coordinate => {
      const [x, z] = terrainPosition(coordinate)
      return projectPoint(camera, size, x, real ? getTerrainHeight(heightmap, x, z) + 0.04 : 0, z)
    }} />
    <div className="terrain-caption island-caption"><Compass size={14} /> {real ? 'Drag to rotate' : 'Relief view'}</div>
    <div className="island-scale" aria-hidden="true" style={{width: viewScale(size, view.zoom) * 0.74}}>5 km</div>
    <div className="island-attribution"><MapCredits /></div>
    <div className="map-tools" aria-label="Terrain view controls">
      <button type="button" onClick={() => zoom(0.24)} aria-label="Zoom in"><Plus size={17} /></button>
      <button type="button" onClick={() => zoom(-0.24)} aria-label="Zoom out"><Minus size={17} /></button>
      <button type="button" onClick={() => move(initialView)} aria-label="Reset terrain view"><RotateCcw size={15} /></button>
    </div>
  </div>
}
