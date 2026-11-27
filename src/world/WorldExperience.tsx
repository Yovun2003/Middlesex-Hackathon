import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Compass, Eye, Map, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { canRenderWebGL } from '../geo'
import { publicIncidents, type State } from '../model'
import { focusIncident, useWorld } from './state'

const WorldScene = lazy(() => import('./WorldScene'))
const GeoMap = lazy(() => import('../GeoMap'))
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

class WorldBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { useWorld.setState({ graphicsFailed: true, mode: '2d' }) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function WorldExperience({ state, publicMap = false }: { state: State; publicMap?: boolean }) {
  const [supported] = useState(canRenderWebGL)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const mode = useWorld(s => s.mode); const destination = useWorld(s => s.destination); const label = useWorld(s => s.label); const town = useWorld(s => s.town)
  const kind = useWorld(s => s.kind); const duration = useWorld(s => s.duration); const paused = useWorld(s => s.paused); const quality = useWorld(s => s.quality)
  const condition = useWorld(s=>s.condition)
  const conditionLabel = () => condition === 'No running water' ? 'No water: the tap stays dry' : condition === 'Low pressure' ? 'Low pressure: a weak stream' : condition === 'Supply restored' ? 'Water restored: the tap flows again' : 'Normal flow: water moves freely'
  const depotLabel = useWorld(s => s.depotLabel)
  const transitioning = useWorld(s => s.transitioning); const explore = useWorld(s => s.explore); const graphicsFailed = useWorld(s => s.graphicsFailed); const selectedId = useWorld(s => s.incidentId); const signal = useWorld(s => s.signal); const playback = useWorld(s => s.showRoute)
  const id = useRef(crypto.randomUUID())
  const incidents = publicIncidents(state)
  const selected = incidents.find(i => i.id === selectedId)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReduced(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  const select = (id: string) => focusIncident(state, id)
  const poster = <div className="world-poster"><img src={asset('mauritius-relief.webp')} width="840" height="980" alt="Relief of Mauritius" /><span role="status">{graphicsFailed || !supported ? 'Relief view · reporting remains available' : 'Preparing the Mauritius environment…'}</span></div>
  const map = <Suspense fallback={poster}><GeoMap incidents={incidents.map(i => ({ id: i.id, town: i.town, title: i.title, tone: ({ red: 'critical', amber: 'response', blue: 'leak', green: 'verified' } as const)[i.tone] }))} selectedId={selectedId} onSelect={select} /></Suspense>
  const show2d = publicMap || mode === '2d' || !supported || graphicsFailed
  return <section className="persistent-world" tabIndex={explore ? 0 : -1} aria-label={explore ? 'Shared Mauritius environment. Arrow keys turn and tilt; plus and minus zoom; Home returns to the island.' : 'Shared Mauritius environment'} data-world-id={id.current} data-camera-destination={destination} data-world-kind={kind} onKeyDown={event => {
    if (event.target !== event.currentTarget || !explore) return
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) { event.preventDefault(); useWorld.getState().nudge(event.key) }
    if (event.key === 'Home') { event.preventDefault(); useWorld.getState().overview() }
  }}>
    <div className="world-render" style={{ visibility: show2d ? 'hidden' : 'visible' }}>
      {supported && <WorldBoundary fallback={poster}><Suspense fallback={poster}><WorldScene state={state} reduced={reduced} onSelect={select} /></Suspense></WorldBoundary>}
    </div>
    {show2d && <div className="world-map-alternative">{map}</div>}
    {selected && <aside className="world-selected"><span className={`status-text tone-${selected.tone}`}>{selected.label}</span><strong>{selected.town}</strong><p>{selected.summary}</p><button type="button" className="text-button" onClick={() => useWorld.getState().overview()}>Close update</button></aside>}
    {!publicMap && kind !== 'overview' && <aside className="example-caption"><strong>{kind==='shortage' ? conditionLabel() : kind==='leak' ? 'Example: a leaking public pipe' : 'Example: your delivery’s recorded progress'}</strong><p>{kind==='shortage'?condition === 'No running water' ? 'X-ray illustration: water has stopped inside the pipe and at the tap.' : condition === 'Low pressure' ? 'X-ray illustration: slower water in the pipe and a weak stream at the tap.' : 'X-ray illustration: strong water flow through the connected pipe and tap.':kind==='leak'?'Describe the real location in your report so the crew can find it.':'The vehicle illustrates recorded updates. It is not live tracking.'}</p>{(!reduced && (kind==='shortage'&&condition!=='No running water'||kind==='leak'||kind==='tanker'||transitioning))&&<button type="button" className="text-button" onClick={()=>useWorld.getState().setPaused(!paused)}>{paused?'Play animation':'Pause animation'}</button>}</aside>}


  </section>
}
