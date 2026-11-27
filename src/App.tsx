import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Bell, Check, ChevronDown, CircleHelp, ClipboardList, Droplet, Droplets, MapPin, ShieldCheck, Truck, Waves, X } from 'lucide-react'
import { publicIncidents, TOWNS, type PublicIncident } from './model'
import { useSession } from './session'
import { SignIn } from './Access'
import { Stage } from './Stage'
import { Coordinator, FieldWorkspace, ResidentDialog, reportConditions } from './Workflow'
import { WorldExperience } from './world/WorldExperience'
import { focusIncident, useWorld } from './world/state'
import type { Account } from '../server/db'
import './experience.css'
import './world/world.css'

type Store = ReturnType<typeof useSession>
type Dialog = 'shortage' | 'leak' | 'track'
type Role = 'home' | 'user' | 'coordinator' | 'workers' | 'signin' | 'help' | 'map'
const tones = { red: AlertCircle, amber: Truck, blue: Droplets, green: ShieldCheck }
function getRole(): Role {
  const [hash] = location.hash.split('?')
  if (['#/coordinator'].includes(hash)) return 'coordinator'
  if (['#/workers', '#/field'].includes(hash)) return 'workers'
  if (hash === '#/map') return 'map'
  if (hash === '#/signin') return 'signin'
  if (hash === '#help' || hash === '#how-it-works') return 'help'
  if (hash === '#/user') return 'user'
  return 'home'
}
const accountHome = (account: Account) => account.role === 'coordinator' ? '#/coordinator' : account.role === 'worker' ? '#/workers' : '#/user'
function Brand({ onHome }: { onHome: () => void }) { return <a onClick={event => { event.preventDefault(); onHome() }} className="brand" href="#/" aria-label="NouDilo home"><span className="brand-mark"><Droplet size={21} strokeWidth={1.7} /></span><span>Nou<span>Dilo</span></span></a> }

function Nearby({ store }: { store: Store }) {
  const town = useWorld(s => s.town)
  const incidents = publicIncidents(store.publicState ?? store.state).filter(i => i.town === town)
  const notices = store.state.notices.filter(n => n.town === town)
  return <section className="nearby-incidents" aria-labelledby="nearby-heading">
    <div className="nearby-heading"><h2 id="nearby-heading">Near {town}</h2><span>Published updates</span></div>
    {!store.ready ? <p role="status" className="panel-empty">Loading reviewed incidents…</p> : store.offline ? <p role="status" className="panel-empty">Updates are unavailable. Reconnecting automatically.</p> : !incidents.length ? <p className="panel-empty">No published incidents here. This does not confirm that supply is normal.</p> : <ul className="nearby-list">{incidents.map(incident => {
      const Icon = tones[incident.tone]
      return <li key={incident.id}><button type="button" onClick={() => focusIncident(store.publicState ?? store.state, incident.id)}><Icon size={20} /><span><strong>{incident.type === 'shortage' ? 'Water shortage' : 'Public infrastructure leak'}</strong><small className={`tone-${incident.tone}`}>{incident.label}</small></span><span className="nearby-view">View</span></button></li>
    })}</ul>}
    {notices.map(n => <p className="nearby-notice" key={n.id}>{n.text}</p>)}
  </section>
}
function TownPicker() {
  const town = useWorld(s => s.town)
  return <label className="resident-town"><span>Your town or village</span><div><MapPin size={18} /><select value={town} onChange={e => useWorld.getState().setTown(e.target.value)}>{TOWNS.map(town => <option key={town}>{town}</option>)}</select><ChevronDown size={16} /></div></label>
}

function Home({ store, onReport }: { store: Store; onReport: (mode: Dialog, town?: string, condition?: string) => void }) {
  const town = useWorld(s => s.town)
  const incidents = publicIncidents(store.publicState ?? store.state)
  const staff = store.account && store.account.role !== 'resident' ? store.account : null
  return <main id="main-content" className="journey-panel resident-home" tabIndex={-1}>
    <div className="panel-intro"><p className="location-kicker">Mauritius water response</p><h1>Our island.<br />Our water.</h1><p>A dry tap. A leaking pipe.<br />A clearer way to get a response.</p></div>
    <TownPicker />
    {staff ? <a className="button primary" href={accountHome(staff)}><ClipboardList size={18} /> Open my workspace</a> : <div className="resident-actions">
      <button className="button primary" type="button" onClick={() => onReport('shortage', town, 'No running water')}><Droplet size={19} /> No water</button>
      <button className="button secondary" type="button" onClick={() => onReport('leak', town)}><Waves size={20} /> Report a public leak</button>
      <button className="button secondary" type="button" onClick={() => onReport('shortage', town, 'Low pressure')}><Droplets size={19} /> Low pressure</button><button className="text-button" type="button" onClick={() => onReport('shortage', town, 'No running water')}><Truck size={18} /> Request a tanker delivery</button>
      <button className="text-button" type="button" onClick={() => onReport('track')}><ClipboardList size={17} /> Track my reports</button>
    </div>}
    <Nearby store={store} />
    <section className="island-record-summary" aria-label="Island published incident summary"><div><strong>{!store.ready || store.offline ? '—' : (store.publicState ?? store.state).shortages.filter(i => i.status === 'critical' && i.priority === 'Critical').length}</strong><span>Critical shortages</span></div><div><strong>{!store.ready || store.offline ? '—' : incidents.filter(i => i.tone === 'amber').length}</strong><span>Responses underway</span></div><div><strong>{!store.ready || store.offline ? '—' : incidents.filter(i => i.tone === 'blue').length}</strong><span>Public leaks</span></div></section>
    <p className="review-note"><ShieldCheck size={17} /> Public incidents are reviewed before publication.</p>
    <a className="text-button panel-help" href="#help"><CircleHelp size={17} /> How reporting works</a>
  </main>
}

function ResidentWorkspace({ store, onReport }: { store: Store; onReport: (mode: Dialog, town?: string, condition?: string) => void }) {
  const initialKind = useWorld.getState().kind
  const [kind, setKind] = useState<'shortage' | 'leak'>(initialKind === 'leak' ? 'leak' : 'shortage')
  const [condition, setCondition] = useState(useWorld.getState().condition)
  const town = useWorld(s => s.town)
  const staff = store.account && store.account.role !== 'resident'
  if (staff) return <main id="main-content" className="journey-panel" tabIndex={-1}><h1>Your staff workspace</h1><p>Reporting is available through a resident account. Continue with your assigned operations.</p><a className="button primary" href={accountHome(store.account!)}>Open my workspace</a></main>
  return <main id="main-content" className="journey-panel report-workspace" tabIndex={-1}>
    <p className="location-kicker">Resident services</p><h1>Tell us what<br />you’re seeing.</h1><p className="panel-description">Choose what is wrong, then add your location and send your report.</p>
    <TownPicker />
    <div className="workspace-views" role="group" aria-label="Issue type"><button type="button" aria-pressed={kind === 'shortage'} onClick={() => { setKind('shortage'); setCondition('') }}>Water shortage</button><button type="button" aria-pressed={kind === 'leak'} onClick={() => { setKind('leak'); setCondition('') }}>Public leak</button></div>
    <label className="resident-condition">What are you seeing?<select value={reportConditions[kind].includes(condition) ? condition : ''} onChange={e => setCondition(e.target.value)}><option value="">Choose the condition</option>{reportConditions[kind].map(c => <option key={c}>{c}</option>)}</select></label>
    <Stage town={town} visual={kind === 'shortage' ? 'tap' : 'pipe'} phase={condition === 'Low pressure' ? .28 : 0} condition={condition} strength={condition === 'Heavy flow' ? 1 : condition === 'Continuous flow' ? .62 : .25} title={kind === 'shortage' ? 'At your household' : 'Public infrastructure'} status={condition || 'Choose the problem that matches your situation'}>{kind === 'shortage' ? 'No running water and low pressure are different conditions. Choose the one that matches your tap.' : 'Include a road or landmark the repair crew can recognise. Add a photo from a safe place.'}</Stage>
    <button className="button primary" type="button" onClick={() => onReport(kind, town, condition)}><Droplet size={18} /> {kind === 'shortage' ? 'Continue shortage report' : 'Continue leak report'}</button>
    <button className="text-button" type="button" onClick={() => onReport('shortage', town, 'No running water')}><Truck size={18} /> Request a tanker delivery</button>
    <button className="text-button" type="button" onClick={() => onReport('track')}><Truck size={18} /> Track tanker</button>
    <button className="text-button track-link" type="button" onClick={() => onReport('track')}><ClipboardList size={18} /> Track my reports</button>
    <Nearby store={store} />
  </main>
}

function Help() {
  return <main id="main-content" className="journey-panel help-panel" tabIndex={-1}><p className="location-kicker">Reporting help</p><h1>A connected<br />response.</h1><p className="panel-description">Your report and the community response are separate records, connected through review.</p>
    <ol className="help-steps"><li><strong>Report what you see</strong><p>Choose your village and describe the shortage or public leak. Your account and individual details remain private.</p></li><li><strong>Review and group</strong><p>A coordinator reviews the complaint and links related reports to a community incident.</p></li><li><strong>Assign a response</strong><p>A coordinator checks priority and resources, then assigns a tanker or maintenance crew.</p></li><li><strong>Record the actual outcome</strong><p>A driver records litres delivered. A maintenance crew records inspection, repair, and supporting evidence.</p></li><li><strong>Verify before publication</strong><p>A coordinator reviews the result. Water delivery and restoration of regular supply are separate outcomes.</p></li></ol>
    <details open><summary>Can I use NouDilo without 3D?</summary><p>Yes. Every task works through labelled forms and buttons. Use the 2D map, pause animation, or skip camera travel. The scene is never a required input.</p></details>
    <details><summary>What is shown in the world?</summary><p>The terrain and towns use geographic data. Houses, infrastructure, and water levels explain the process and are illustrative. Vehicle journeys are demonstration playback, not GPS tracking or safe route guidance.</p></details>
    <details><summary>Who can see my report?</summary><p>You and authorised coordinators can read your report. Assigned workers receive the task details they need. Public views show published community summaries.</p></details>
    <a className="button primary" href="#/user">Report a water issue</a>
  </main>
}

export default function App() {
  const store = useSession()
  const [route, setRoute] = useState(() => ({ role: getRole(), hash: location.hash }))
  const [dialog, setDialog] = useState<{ mode: Dialog; town?: string; condition?: string }>()
  const [intent, setIntent] = useState<{ mode: Dialog; town?: string; condition?: string }>()
  const [demoError, setDemoError] = useState('')
  const [homeDetails, setHomeDetails] = useState(false)
  const [mapFilter,setMapFilter]=useState('active')
  const [sceneHidden,setSceneHidden]=useState(true)
  const taskView = ['user','coordinator','workers'].includes(route.role)
  useEffect(() => { useWorld.getState().setPaused(taskView && sceneHidden) }, [taskView,sceneHidden])
  const mainScroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const changed = () => {
      const role = getRole(); setRoute({ role, hash: location.hash }); store.clearNotice()
      if (role === 'home') useWorld.getState().focus({ kind: 'overview', destination: 'ResidentVillage', label: 'Your neighbourhood · connected water response' })
      if (role === 'coordinator') useWorld.getState().overview(true)
      requestAnimationFrame(() => { mainScroll.current?.scrollTo(0, 0); document.getElementById('main-content')?.focus({ preventScroll: true }) })
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  const onReport = (mode: Dialog, town?: string, condition?: string) => {
    if (mode !== 'track') { useWorld.setState({ incidentId: undefined, signal: undefined }); useWorld.getState().focus({ kind: mode, town, condition: condition || '', phase: 0, label: mode === 'shortage' ? 'Household shortage report' : 'Public leak report', destination: mode === 'shortage' ? 'ResidentHouse' : 'PublicLeakScene' }) }
    if (store.account?.role === 'resident') setDialog({ mode, town, condition })
    else if (!store.account) { setIntent({ mode, town, condition }); location.hash = '#/signin' }
    else location.hash = accountHome(store.account)
  }
  const signedIn = (account: Account) => { location.hash = accountHome(account); setDialog(account.role === 'resident' ? intent : undefined); setIntent(undefined) }
  const publicState = store.publicState ?? store.state
  const mapIncidents = publicIncidents(publicState).filter(i => mapFilter === 'all' || mapFilter === 'active' ? mapFilter === 'all' || i.tone !== 'green' : i.type === mapFilter && i.tone !== 'green')
  const mapIds = new Set(mapIncidents.map(i=>i.id))
  const visibleState = route.role === 'map' ? { ...publicState, shortages: publicState.shortages.filter(i=>mapIds.has(i.id)), leaks: publicState.leaks.filter(i=>mapIds.has(i.id)) } : publicState
  const params = new URLSearchParams(route.hash.split('?')[1]); const tab = params.get('tab'); const focusId = params.get('id') ?? undefined
  const coordinatorTab = tab === 'register' || tab === 'review' || tab === 'resources' || tab === 'notices' || tab === 'audit' ? tab : store.state.reports.some(r => r.status !== 'verified') ? 'review' : 'register'
  const requiredRole = route.role === 'coordinator' ? 'coordinator' : route.role === 'workers' ? 'worker' : null
  const visuals = { map: ({ selectedId }: { selectedId?: string; onSelect: (id: string) => void }) => <WorldMapContext state={store.state} selectedId={selectedId} /> }
  return <div className={`world-app ${route.role === 'home' ? 'cinematic-home' : ''} ${homeDetails ? 'home-details-open' : ''} ${taskView && sceneHidden ? 'scene-is-hidden' : ''} ${requiredRole === 'coordinator' ? 'world-app--operations' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); setHomeDetails(true); requestAnimationFrame(() => document.getElementById('main-content')?.focus()) }}>Skip to tasks</a>
    <header className="site-header"><div className="header-inner"><Brand onHome={() => { setDialog(undefined); setIntent(undefined); setHomeDetails(false); location.hash='#/'; setRoute({role:'home',hash:'#/'}); useWorld.getState().focus({ kind:'overview', destination:'ResidentVillage', label:'Home' }); useWorld.getState().setExplore(false) }} /><nav className="site-nav" aria-label="Main"><a href="#/" aria-current={route.role === 'home' ? 'page' : undefined}>Home</a><a href="#/map" aria-current={route.role === 'map' ? 'page' : undefined}>Water problems map</a><a href="#/user" aria-current={route.role === 'user' ? 'page' : undefined}>Report &amp; track</a>{store.account?.role === 'coordinator' && <a href="#/coordinator" aria-current={route.role === 'coordinator' ? 'page' : undefined}>Operations centre</a>}{store.account?.role === 'worker' && <a href="#/workers" aria-current={route.role === 'workers' ? 'page' : undefined}>Field assignments</a>}<a href="#help" aria-current={route.role === 'help' ? 'page' : undefined}>Help</a></nav><div className="header-actions">
      {store.environment?.demo && <details className="demo-roles"><summary>Demo roles <ChevronDown size={14} /></summary><div><p>Isolated local demonstration</p>{[['resident', 'Resident'], ['resident2', 'Neighbour'], ['coordinator', 'Coordinator'], ['driver', 'Tanker driver'], ['crew', 'Maintenance crew']].map(([role, name]) => <button key={role} type="button" disabled={store.pending} onClick={async event => { const menu = event.currentTarget.closest('details'); setDemoError(''); try { const account = await store.signInDemo(role); if (account) signedIn(account); menu?.removeAttribute('open') } catch (error) { setDemoError((error as Error).message) } }}>{name}</button>)}{demoError && <p role="alert">{demoError}</p>}</div></details>}
      {store.account ? <button type="button" className="button header-demo" disabled={store.pending} onClick={() => { setDialog(undefined); setIntent(undefined); void store.signOut().then(success => { if (success) location.hash = '#/' }) }}>Sign out</button> : <a className="button header-demo" href="#/signin">Sign in</a>}
    </div></div></header>
    <div className={`environment-note ${store.offline ? 'environment-note--offline' : ''}`} role="status"><span>{store.environment?.demo ? 'Demo · sample reports' : 'Mauritius water response'}</span><p>{store.offline ? 'Service unavailable. Your form stays open; retry when the connection returns.' : 'Report a problem, follow your response, and see community updates.'}</p>{store.pending && <span className="saving-state">Saving…</span>}</div>
    <WorldExperience state={visibleState} publicMap={route.role === 'map'} />
    {taskView && !dialog && <button className="scene-toggle" type="button" aria-expanded={!sceneHidden} onClick={()=>setSceneHidden(!sceneHidden)}>{sceneHidden?'Show example':'Hide example'}</button>}
    {route.role === 'home' && !homeDetails && <section className="cinematic-intro" aria-labelledby="island-title">
      <p className="cinematic-eyebrow">MAURITIUS · A CONNECTED WATER RESPONSE</p>
      <h1 id="island-title">Report a water<br />problem.</h1>
      <p className="cinematic-description">Report a problem. Follow your delivery.<br />Keep your neighbourhood connected.</p>
      <div className="cinematic-actions"><button className="button" type="button" onClick={() => setHomeDetails(true)}>Report a water issue</button><button className="cinematic-link" type="button" onClick={() => onReport('track')}>Track my reports</button><a className="cinematic-link" href="#/map">View water problems map</a></div>
    </section>}

    {route.role === 'home' && homeDetails && <button type="button" className="home-drawer-close" onClick={() => setHomeDetails(false)} aria-label="Close reporting panel"><X size={20} /></button>}
    <div className="task-scroll" ref={mainScroll} inert={route.role === 'home' && !homeDetails}>
      {route.role === 'home' && <Home store={store} onReport={onReport} />}
      {route.role === 'help' && <Help />}
      {route.role === 'map' && <main id="main-content" className="journey-panel" tabIndex={-1}><p className="location-kicker">Community updates</p><h1>Water problems<br />in Mauritius</h1><p>See reviewed shortages, leaks and response updates. Select a place for details.</p><label className="resident-condition">Show<select value={mapFilter} onChange={e=>setMapFilter(e.target.value)}><option value="active">Active problems</option><option value="shortage">Water shortages</option><option value="leak">Pipe leaks</option><option value="all">All updates, including resolved</option></select></label><p className="review-note">Markers show community areas, not private household addresses. An area without a report does not confirm normal supply.</p>{!store.ready?<p>Loading updates…</p>:store.offline?<p role="status">Updates are unavailable. Please try again.</p>:mapIncidents.length ? <ul className="nearby-list">{mapIncidents.map(i=><li key={i.id}><button type="button" onClick={()=>focusIncident(publicState,i.id)}><MapPin size={22}/><span><strong>{i.town}</strong><small>{i.type==='leak'?'Pipe leak':'Water shortage'} · {i.label}</small><small>{i.summary}</small></span></button></li>)}</ul>:<p>No reviewed problems match this filter.</p>}<a className="button primary" href="#/user">Report a problem</a></main>}
      {route.role === 'user' && <ResidentWorkspace store={store} onReport={onReport} />}
      {(route.role === 'signin' || requiredRole) && (!store.ready ? <main id="main-content" className="journey-panel" tabIndex={-1}><p role="status">Checking your session…</p></main> : !store.account ? <SignIn key={route.role} audience={requiredRole ?? (intent ? 'resident' : null)} registerFirst={!!intent && intent.mode !== 'track'} offline={store.offline} signIn={store.signIn} onSuccess={signedIn} /> : requiredRole && store.account.role !== requiredRole ? <main id="main-content" className="journey-panel" tabIndex={-1}><h1>A different account is required</h1><p>Use an authorised staff account for this workspace.</p><a className="button primary" href={accountHome(store.account)}>Open my workspace</a></main> : requiredRole ? <main id="main-content" className="workspace-shell" tabIndex={-1}><div className="container"><fieldset className="command-boundary" disabled={store.pending} aria-label="Workspace commands">{requiredRole === 'coordinator' ? <Coordinator key={route.hash} store={store} visuals={visuals} initialTab={coordinatorTab} initialId={focusId} /> : <FieldWorkspace key={route.hash + store.account.id} store={store} resource={store.account.resource} initialTab={tab === 'tankers' || tab === 'repairs' ? tab : undefined} initialId={focusId} />}</fieldset></div></main> : <main id="main-content" className="journey-panel" tabIndex={-1}><h1>Your NouDilo account</h1><p>{store.account.email}</p><a className="button primary" href={accountHome(store.account)}>Open my workspace</a></main>)}
      {!!store.notifications?.length && <details className="resident-notifications"><summary><Bell size={16} /> Your recorded updates ({store.notifications.length})</summary><ul>{store.notifications.map(n => <li key={n.id}><p>{n.message}</p><time dateTime={n.created_at}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Indian/Mauritius' }).format(new Date(n.created_at))}</time></li>)}</ul></details>}
      <footer className="task-footer"><span>NouDilo · Mauritius</span><a href="#help">Reporting &amp; privacy</a></footer>
    </div>
    {dialog && store.account?.role === 'resident' && <ResidentDialog sceneHidden={sceneHidden} onToggleScene={()=>setSceneHidden(!sceneHidden)} mode={dialog.mode} store={store} initialTown={dialog.town} initialCondition={dialog.condition} onClose={() => { setDialog(undefined); store.clearNotice() }} />}
    {store.notice && <div className={`notice ${store.notice.error ? 'notice-error' : ''}`} role={store.notice.error ? 'alert' : 'status'}>{store.notice.error ? <AlertCircle size={18} /> : <Check size={18} />}<span>{store.notice.message}</span><button type="button" className="icon-button" aria-label="Dismiss update" onClick={store.clearNotice}><X size={17} /></button></div>}
  </div>
}

function WorldMapContext({ state, selectedId }: { state: Store['state']; selectedId?: string }) {
  const latest = useRef(state)
  latest.current = state
  useEffect(() => { if (selectedId) focusIncident(latest.current, selectedId) }, [selectedId])
  return <div className="world-map-context"><MapPin size={18} /><p>The shared map follows your selected incident.</p><button className="text-button" type="button" onClick={() => useWorld.getState().overview(true)}>See the whole island</button></div>
}
