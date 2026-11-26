import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle, Check, ChevronDown, CircleHelp, Droplet, Droplets,
  MapPin, Radio, ShieldCheck, Truck, Waves, X,
} from 'lucide-react'
import gsap from 'gsap'
import type { MapIncident } from './geo'
import { TOWNS, publicIncidents, type NouDiloStore } from './model'
import { useSession } from './session'
import { SignIn } from './Access'
import { Stage } from './Stage'
import type { Account } from '../server/db'
import { Coordinator, FieldWorkspace, ResidentDialog, reportConditions } from './Workflow'

const Island = lazy(() => import('./Island'))
const GeoMap = lazy(() => import('./GeoMap'))
const reliefAsset = `${import.meta.env.BASE_URL}mauritius-relief.webp`

type Store = NouDiloStore
type PublicIncident = ReturnType<typeof publicIncidents>[number]
type Role = 'user' | 'coordinator' | 'workers' | 'signin'
type Dialog = 'shortage' | 'leak' | 'track'

const tones = {
  red: { icon: AlertCircle, label: 'Critical shortage', map: 'critical' },
  amber: { icon: Truck, label: 'Response underway', map: 'response' },
  blue: { icon: Droplets, label: 'Public infrastructure leak', map: 'leak' },
  green: { icon: ShieldCheck, label: 'Outcome verified', map: 'verified' },
} as const

function getRole(): Role {
  const [hash] = window.location.hash.split('?')
  switch (hash) {
    case '#overview':
    case '#water-map':
    case '#/user':
      return 'user'
    case '#/coordinator':
      return 'coordinator'
    case '#/workers':
    case '#/field':
      return 'workers'
    case '#/signin':
      return 'signin'
    default:
      return 'user'
  }
}

function Brand() {
  return (
    <a className="brand" href="#/" aria-label="NouDilo home">
      <span className="brand-mark"><Droplet size={21} strokeWidth={2.15} /></span>
      <span>Nou<span>Dilo</span></span>
    </a>
  )
}

function MapLoading({ label }: { label?: string }) {
  return (
    <div className={`map-loading${label ? '' : ' map-loading--relief'}`} role="status">
      {!label && <img src={reliefAsset} width="840" height="980" alt="" />}
      <p>{label ?? 'Loading Mauritius map…'}</p>
    </div>
  )
}

class VisualBoundary extends Component<{ children: ReactNode; subject: string }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed
      ? <p className="visual-error" role="status">{this.props.subject} could not load. Use the incident details or refresh the page to retry.</p>
      : this.props.children
  }
}

function PublicMap({ incidents, selected, onSelect, onClose }: {
  incidents: PublicIncident[]
  selected?: PublicIncident
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'island' | 'street'>('island')
  const mapIncidents = incidents.map(toMapIncident)

  return (
    <section id="water-map" className="public-map" aria-labelledby="map-heading">
      <div className="map-window">
        <div className="map-top">
          <div className="map-caption">
            <span><MapPin size={13} /> Published incidents</span>
            <h2 id="map-heading" tabIndex={-1}>Mauritius</h2>
          </div>
          <div className="map-switch" role="group" aria-label="Map view">
            <button type="button" aria-pressed={mode === 'island'} onClick={() => setMode('island')}>3D island</button>
            <button type="button" aria-pressed={mode === 'street'} onClick={() => setMode('street')}>2D map</button>
          </div>
        </div>
        <VisualBoundary key={mode} subject="The map">
          <Suspense fallback={<MapLoading />}>
            {mode === 'island'
              ? <Island incidents={mapIncidents} selectedId={selected?.id} onSelect={onSelect} />
              : <GeoMap incidents={mapIncidents} selectedId={selected?.id} onSelect={onSelect} />}
          </Suspense>
        </VisualBoundary>
      </div>
      {selected && (
        <aside id="incident-detail" className="map-incident" aria-label={`${selected.town} incident details`} tabIndex={-1}>
          <div>
            <span className={`status-text tone-${selected.tone}`}><i />{selected.label}</span>
            <h3>{selected.town}</h3>
            <p>{selected.summary}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close incident details" onClick={onClose}><X size={17} /></button>
        </aside>
      )}
    </section>
  )
}

function toMapIncident(incident: PublicIncident): MapIncident {
  return { id: incident.id, town: incident.town, title: incident.title, tone: tones[incident.tone].map }
}

function IncidentList({ incidents, onSelect, town, setTown, notices }: {
  incidents: PublicIncident[]
  onSelect: (id: string, trigger: HTMLButtonElement) => void
  town: string
  setTown: (town: string) => void
  notices: Store['state']['notices']
}) {
  const visible = incidents.filter((incident) => !town || incident.town === town)
  const nearbyNotices = notices.filter((notice) => !town || notice.town === town)
  return (
    <section className="local-section" aria-labelledby="local-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Local incidents</p>
          <h2 id="local-heading">What’s happening nearby</h2>
          <p>Verified incidents and response updates by neighbourhood.</p>
        </div>
        <label className="town-picker">
          <MapPin size={17} aria-hidden="true" />
          <span className="sr-only">Choose a neighbourhood</span>
          <select value={town} onChange={(event) => setTown(event.target.value)}>
            <option value="">All neighbourhoods</option>
            {TOWNS.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
      </div>
      {nearbyNotices.length > 0 && (
        <div className="public-notices">
          <h3><Radio size={16} /> Verified public notices</h3>
          <ul>
            {nearbyNotices.map((notice) => (
              <li key={notice.id}><strong>{notice.town}</strong><p>{notice.text}</p></li>
            ))}
          </ul>
        </div>
      )}
      <div className="incident-grid">
        {visible.map((incident) => {
          const Icon = tones[incident.tone].icon
          return (
            <article className="incident-card" key={incident.id}>
              <div className={`incident-emblem tone-${incident.tone}`}><Icon size={20} strokeWidth={1.8} /></div>
              <div className="incident-copy">
                <span className={`status-text tone-${incident.tone}`}>{incident.label}</span>
                <h3>{incident.town}</h3>
                <p>{incident.summary}</p>
                <button type="button" className="text-button" onClick={(event) => onSelect(incident.id, event.currentTarget)}>View on map</button>
              </div>
            </article>
          )
        })}
        {visible.length === 0 && <p className="empty-copy">There are no verified incidents for {town || 'this view'} in the demo.</p>}
      </div>
    </section>
  )
}

function Overview({ store, onReport, canReport, initialMap }: {
  store: Store
  onReport: (mode: Dialog, initialTown?: string, condition?: string) => void
  canReport: boolean
  initialMap: boolean
}) {
  const incidents = publicIncidents(store.state)
  const [view, setView] = useState<'report' | 'map'>(initialMap ? 'map' : 'report')
  const [issue, setIssue] = useState<'shortage' | 'leak'>('shortage')
  const [condition, setCondition] = useState('')
  const showMap = !canReport || view === 'map'
  const shortage = issue === 'shortage'
  const [town, setTown] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const intro = useRef<HTMLDivElement>(null)
  const selectionTrigger = useRef<HTMLButtonElement | null>(null)
  const selected = incidents.find((item) => item.id === selectedId)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const context = gsap.context(() => {
      gsap.from('[data-intro]', { y: 12, opacity: 0, duration: 0.5, stagger: 0.065, ease: 'power2.out', clearProps: 'all' })
    }, intro)
    return () => context.revert()
  }, [])

  return (
    <main id="main-content" tabIndex={-1}>
      <section id="overview" className="hero-shell working-hero">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-copy" ref={intro}>
              <p className="app-mode-label" data-intro>Mauritius water response</p>
              <h1 data-intro>{showMap ? 'Community water map' : 'Report a water issue'}</h1>
              <p className="hero-description" data-intro>{showMap ? 'Explore published incidents and response updates for Mauritius.' : 'Choose what you’re seeing. The illustration changes as you fill in your report.'}</p>
              {canReport && <div className="report-choices">
                {showMap && <a href="#/user" className="button primary" onClick={() => setView('report')}>Report a water issue</a>}
                {!showMap && <>
                  <div className="workspace-views" role="group" aria-label="Issue type">
                    <button type="button" aria-pressed={shortage} onClick={() => { setIssue('shortage'); setCondition('') }}>Water shortage</button>
                    <button type="button" aria-pressed={!shortage} onClick={() => { setIssue('leak'); setCondition('') }}>Public leak</button>
                  </div>
                  <label>What are you seeing?
                    <select value={condition} onChange={event => setCondition(event.target.value)}>
                      <option value="">Choose the condition</option>
                      {reportConditions[issue].map(label => <option key={label}>{label}</option>)}
                    </select>
                  </label>
                  <div className="hero-actions">
                    <button type="button" className="button primary" onClick={() => onReport(issue, town, condition)}>
                      {shortage ? <Droplet size={17} /> : <Waves size={18} />}{shortage ? 'Report a shortage' : 'Report a public leak'}
                    </button>
                  </div>
                </>}
                <button type="button" className="text-button track-link" onClick={() => onReport('track')}><CircleHelp size={17} /> Track my reports</button>
              </div>}
            </div>
            {showMap ? <PublicMap incidents={incidents} selected={selected} onSelect={(id) => {
              selectionTrigger.current = null
              setSelectedId(id)
            }} onClose={() => {
              setSelectedId(undefined)
              const target = selectionTrigger.current ?? document.getElementById('map-heading')
              target?.focus()
            }} /> : <Stage
              title={shortage ? 'At the tap' : 'Under the road'}
              visual={shortage ? 'tap' : 'pipe'}
              phase={shortage && condition === 'Low pressure' ? .28 : 0}
              strength={!shortage ? condition === 'Heavy flow' ? 1 : condition === 'Continuous flow' ? .62 : .25 : undefined}
              status={condition || (shortage ? 'How to describe a shortage' : 'How to locate a public leak')}>
              {shortage
                ? 'Choose low pressure when some water still flows. Choose no running water when the tap stays dry.'
                : 'Use a road or nearby landmark the crew can recognise. Add a photo from a safe place if you have one.'}
            </Stage>}
          </div>
          <div className="status-strip" aria-label="Public incident summary">
            <div className="status-strip-heading">
              <strong>Island status</strong>
              <span>Public updates</span>
            </div>
            {(Object.keys(tones) as Array<keyof typeof tones>).map((tone) => {
              const { icon: Icon, label } = tones[tone]
              return (
                <div className="status-stat" key={tone}>
                  <span className={`legend-icon tone-${tone}`}><Icon size={18} strokeWidth={1.85} /></span>
                  <div><strong>{incidents.filter((incident) => incident.tone === tone).length}</strong><span>{label}</span></div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
      <div className="container">
        <IncidentList incidents={incidents} town={town} setTown={setTown} notices={store.state.notices} onSelect={(id, trigger) => {
          selectionTrigger.current = trigger
          setSelectedId(id)
          setView('map')
          window.requestAnimationFrame(() => {
            document.getElementById('water-map')?.scrollIntoView({ block: 'start' })
            document.getElementById('incident-detail')?.focus({ preventScroll: true })
          })
        }} />
      </div>
    </main>
  )
}

function accountHome(account: Account) {
  return account.role === 'coordinator' ? '#/coordinator' : account.role === 'worker' ? '#/workers' : '#/user'
}

export default function App() {
  const store = useSession()
  const { dispatch } = store
  const [role, setRole] = useState(getRole)
  const [anchor, setAnchor] = useState(window.location.hash)
  const [dialog, setDialog] = useState<{ mode: Dialog; town?: string; condition?: string }>()
  const prevHash = useRef(window.location.hash)
  const [intent, setIntent] = useState<{ mode: Dialog; town?: string; condition?: string }>()

  useEffect(() => {
    const handleHash = () => {
      const currentHash = window.location.hash
      const nextRole = getRole()
      setRole(nextRole)
      setAnchor(currentHash)
      if (currentHash !== prevHash.current) {
        prevHash.current = currentHash
        dispatch({ type: 'dismissNotice' })
        window.requestAnimationFrame(() => {
          if (currentHash === '#water-map') {
            document.getElementById('water-map')?.scrollIntoView()
            document.getElementById('map-heading')?.focus({ preventScroll: true })
          } else {
            window.scrollTo(0, 0)
            document.getElementById('main-content')?.focus({ preventScroll: true })
          }
        })
      }
    }
    if (window.location.hash === '#water-map') window.requestAnimationFrame(() => document.getElementById('water-map')?.scrollIntoView())
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [dispatch])

  const onReport = (mode: Dialog, town?: string, condition?: string) => {
    if (store.account?.role === 'resident') setDialog({ mode, town, condition })
    else if (!store.account) {
      setIntent({ mode, town, condition })
      window.location.hash = '#/signin'
    }
  }
  function onSignIn(account: Account) {
    window.location.hash = accountHome(account)
    setDialog(account.role === 'resident' ? intent : undefined)
    setIntent(undefined)
  }

  const publicStore = { ...store, state: store.account?.role === 'resident' ? store.state : store.publicState ?? store.state }
  const mapIncidents = publicIncidents(publicStore.state).map(toMapIncident)
  const route = new URLSearchParams(anchor.split('?')[1])
  const tab = route.get('tab')
  const focusId = route.get('id') ?? undefined
  const hasPendingReports = store.state.reports.some((report) => report.status !== 'verified')
  const coordinatorTab = tab === 'register' || tab === 'review' || tab === 'resources' || tab === 'notices' || tab === 'audit'
    ? tab
    : hasPendingReports ? 'review' : 'register'
  const fieldTab = tab === 'tankers' || tab === 'repairs' ? tab : undefined
  const visuals = {
    map: ({ selectedId, onSelect }: { selectedId?: string; onSelect: (id: string) => void }) => (
      <VisualBoundary subject="The incident map">
        <Suspense fallback={<MapLoading />}><Island incidents={mapIncidents} selectedId={selectedId} onSelect={onSelect} /></Suspense>
      </VisualBoundary>
    ),
  }
  const requiredRole = role === 'coordinator' ? 'coordinator' : role === 'workers' ? 'worker' : null

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault()
        document.getElementById('main-content')?.focus()
      }}>Skip to content</a>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav className="site-nav" aria-label="Main">
            <a href="#/user" aria-current={role === 'user' && anchor !== '#water-map' ? 'page' : undefined}>Report &amp; track</a>
            <a href="#water-map" aria-current={anchor === '#water-map' ? 'location' : undefined}>Water map</a>
            {store.account?.role === 'coordinator' && <a href="#/coordinator" aria-current={role === 'coordinator' ? 'page' : undefined}>Coordinator</a>}
            {store.account?.role === 'worker' && <a href="#/workers" aria-current={role === 'workers' ? 'page' : undefined}>Workers</a>}
          </nav>
          <div className="header-actions">
            {store.account ? <button type="button" className="button header-demo" onClick={() => { setDialog(undefined); setIntent(undefined); void store.signOut() }}>Sign out</button>
              : <a className="button header-demo" href="#/signin">Sign in</a>}
          </div>
        </div>
      </header>
      {role === 'user' && <Overview key={anchor === '#water-map' ? 'map' : 'report'} initialMap={anchor === '#water-map'} store={publicStore} onReport={onReport} canReport={!store.account || store.account.role === 'resident'} />}
      {(role === 'signin' || requiredRole) && (!store.ready
        ? <main id="main-content" className="container account-page" tabIndex={-1}><p role="status">Checking your session…</p></main>
        : !store.account
          ? <SignIn key={role} audience={requiredRole ?? (intent ? 'resident' : null)} registerFirst={intent?.mode !== 'track' && !!intent}
              offline={store.offline} signIn={store.signIn} onSuccess={onSignIn} />
          : requiredRole && store.account.role !== requiredRole
            ? <main id="main-content" className="container account-page" tabIndex={-1}>
                <h1>This workspace requires a different account</h1>
                <p>Sign in with an authorised staff account to open this workspace.</p>
                <a className="button primary" href={accountHome(store.account)}>Go to my workspace</a>
              </main>
            : requiredRole
              ? <main id="main-content" className={`workspace-shell workspace-${role}`} tabIndex={-1}>
                  <div className="container">
                    {requiredRole === 'coordinator' && <Coordinator key={anchor} store={store} visuals={visuals} initialTab={coordinatorTab} initialId={focusId} />}
                    {requiredRole === 'worker' && <FieldWorkspace key={anchor} store={store} initialTab={fieldTab} initialId={focusId} />}
                  </div>
                </main>
              : <main id="main-content" className="container account-page" tabIndex={-1}>
                  <h1>Your NouDilo account</h1><p>{store.account.email}</p>
                  <a className="button primary" href={accountHome(store.account)}>Open my workspace</a>
                </main>)}
      <footer className="site-footer">
        <div className="container footer-inner">
          <Brand />
          <p>Mauritius water response</p>
          <a href="#water-map">Water map</a>
        </div>
      </footer>
      {dialog && store.account?.role === 'resident' && <ResidentDialog mode={dialog.mode} store={store} initialTown={dialog.town} initialCondition={dialog.condition} onClose={() => {
        setDialog(undefined)
        store.clearNotice()
      }} />}
      {store.notice && (
        <div className={`notice${store.notice.error ? ' notice-error' : ''}`} role={store.notice.error ? 'alert' : 'status'}>
          {store.notice.error ? <AlertCircle size={18} /> : <Check size={18} />}<span>{store.notice.message}</span>
          <button className="icon-button" type="button" aria-label="Dismiss update" onClick={store.clearNotice}><X size={16} /></button>
        </div>
      )}
    </>
  )
}
