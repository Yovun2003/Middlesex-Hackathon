import { LocationPicker } from './LocationPicker'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  BadgeCheck,
  ClipboardList,
  Clock3,
  Droplet,
  FileText,
  ImagePlus,
  MapPin,
  ShieldCheck,
  Truck,
  Wrench,
  X,
} from 'lucide-react'
import {
  crewsFor,
  fleetFor,
  TOWNS,
  REPORT_CONDITIONS,
  REPORT_DURATIONS,
  availableWater,
  createReference,
  crewAvailable,
  formatLitres,
  linkedReports,
  publicIncidents,
  vehicleAvailable,
  type Evidence,
  type Leak,
  type NouDiloStore,
  type PublicIncident,
  type RepairOrder,
  type Report,
  type ReportKind,
  type TankerAssignment,
  type Tone,
  type State,
} from './model'
import { Stage } from './Stage'
import { assessPriority } from './priority'
import { useWorld, focusIncident } from './world/state'
import './workflow.css'

export type Visuals = {
  map?: ReactNode | ((props: { selectedId?: string; onSelect: (id: string) => void }) => ReactNode)
}

type ResidentMode = 'shortage' | 'leak' | 'track'
export const reportConditions = REPORT_CONDITIONS
const tankerLabels = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  'en-route': 'En route',
  arrived: 'Arrived',
  delivered: 'Awaiting publication',
  published: 'Delivery published',
  declined: 'Declined',
} as const
const repairLabels = {
  assigned: 'Crew assigned',
  'in-progress': 'Under maintenance',
  submitted: 'Awaiting verification',
  verified: 'Repair verified',
} as const
const leakStages: Record<Leak['status'], number> = {
  verified: 0,
  assigned: 1,
  'in-progress': 3,
  'awaiting-verification': 5,
  repaired: 6,
}

const tankerPhases: Record<TankerAssignment['status'], number> = {
  assigned: 0, accepted: 0, 'en-route': .48, arrived: .88, delivered: 1, published: 1, declined: 0,
}

function TankerOperation({ assignment, town, state }: { assignment?: TankerAssignment; town: string; state: State }) {
  if (!assignment) return <Stage visual="tap" town={town} condition="No running water" title={`${town} · Community shortage`} phase={0} status="Awaiting an authorised response">Review the assessed need and available resources before dispatching a tanker.</Stage>
  const vehicle = fleetFor(state).find(v => v.id === assignment.vehicleId)
  const depotTown = TOWNS.find(t => vehicle?.name.includes(t)) ?? town
  return <Stage depotTown={depotTown} depotLabel={vehicle?.name ?? 'Illustrative dispatch depot'} visual="tanker" title={`${town} · Tanker response`} phase={assignment ? tankerPhases[assignment.status] : 0}
    focus={assignment?.status === 'published' ? .24 : 0}
    status={assignment ? tankerLabels[assignment.status] : 'Awaiting assignment'}>
    {assignment?.actualLitres !== undefined
      ? `${formatLitres(assignment.actualLitres)} recorded. The scene illustrates the assignment status, with no live vehicle location.`
      : 'The vehicle moves as assignment milestones are confirmed. The route is an illustration.'}
  </Stage>
}

function PipeOperation({ town, status, label, waterRestoredAt }: { town: string; status: Leak['status']; label: string; waterRestoredAt?: string }) {
  return <Stage destination={waterRestoredAt ? 'WaterShortageScene' : undefined} condition={waterRestoredAt ? 'Supply restored' : undefined} visual="pipe" title={`${town} · Pipe cutaway`} phase={leakStages[status] / 6} status={label}
    focus={status === 'repaired' ? .35 : 0}>
    {status === 'repaired' ? 'The coordinator verified the repair and published the outcome.' :
      status === 'awaiting-verification' ? 'The crew submitted the repair. It is waiting for an independent check.' :
      status === 'in-progress' ? 'The crew started work. The illustration shows the damaged section being isolated.' :
      status === 'assigned' ? 'A crew has the work order and reported location.' :
      'This leak is verified. Assign a crew to begin the repair.'}
  </Stage>
}

function ReportStage({ kind, condition, town, step, duration }: {
  kind: ReportKind
  condition: string
  town?: string
  duration?: string
  step: 'details' | 'review' | 'complete'
}) {
  const shortage = kind === 'shortage'
  return <Stage destination={step === 'complete' && shortage ? 'ResidentVillage' : undefined} town={town} duration={duration} condition={condition} visual={shortage ? 'tap' : 'pipe'} title={town ? `${town} · Report` : shortage ? 'At the tap' : 'Under the road'}
    phase={shortage && condition === 'Low pressure' ? .28 : 0}
    strength={!shortage ? condition === 'Heavy flow' ? 1 : condition === 'Continuous flow' ? .62 : .25 : undefined}
    focus={step === 'review' ? .32 : step === 'complete' ? .58 : 0}
    status={step === 'complete' ? 'Report received' : step === 'review' ? 'Ready for your review' : condition || 'Describe what you see'}>
    {step === 'complete' ? 'Your reference is saved. Track it to see when a coordinator reviews the report.' :
      step === 'review' ? 'Check the locality and condition before sending the report.' :
      shortage ? 'No running water and low pressure are different conditions. Select what matches your tap.' :
      'Choose the flow and add a road or landmark so the crew can find the pipe.'}
  </Stage>
}

function displayDate(time: string) {
  return new Intl.DateTimeFormat('en-MU', {
    timeZone: 'Indian/Mauritius',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(time))
}

function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`wf-status wf-status--${tone}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  )
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="wf-empty">
      <ClipboardList size={25} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}

function readEvidence(file?: File): Promise<Evidence | undefined> {
  if (!file) return Promise.resolve(undefined)
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    return Promise.reject(new Error('Choose a JPEG, PNG or WebP photo.'))
  if (file.size > 500_000) return Promise.reject(new Error('Choose a photo smaller than 500 KB.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, preview: String(reader.result) })
    reader.onerror = () => reject(new Error('This photo could not be opened.'))
    reader.readAsDataURL(file)
  })
}

function EvidenceField({
  value,
  onChange,
}: {
  value?: Evidence
  onChange: (evidence: Evidence | undefined) => void
}) {
  const [message, setMessage] = useState('')
  async function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    try {
      onChange(await readEvidence(file))
      setMessage('')
    } catch (error) {
      onChange(undefined)
      setMessage(error instanceof Error ? error.message : 'This photo could not be opened.')
    }
  }
  return (
    <label className="wf-evidence">
      <span>
        <ImagePlus size={18} aria-hidden="true" /> Supporting photo <small>Optional · up to 500 KB</small>
      </span>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={change} />
      {value && <span className="wf-muted">{value.name}</span>}
      {message && (
        <span role="alert" className="wf-error">
          {message}
        </span>
      )}
    </label>
  )
}

function EvidencePreview({ evidence }: { evidence?: Evidence }) {
  if (!evidence) return null
  return (
    <figure className="wf-evidence-preview">
      {evidence.preview && <img src={evidence.preview} alt="Supporting photo supplied with this record" />}
      <figcaption>{evidence.name}</figcaption>
    </figure>
  )
}

function ResidentTimeline({ store, report, showScene = false }: { store: NouDiloStore; report: Report; showScene?: boolean }) {
  const incident = publicIncidents(store.state).find((item) => item.id === report.incidentId)
  const response = incident?.type === 'shortage'
    ? store.state.tankers.find(item => item.incidentId === incident.id && item.status !== 'declined')
    : undefined
  const timeline: { title: string; detail: string }[] = [
    { title: 'Report received', detail: displayDate(report.createdAt) },
  ]
  if (report.incidentId && report.type === 'shortage')
    timeline.push({
      title: 'Community report linked',
      detail: `Linked to ${report.incidentId} in ${report.town}.`,
    })
  if (report.status === 'verified') {
    timeline.push({ title: 'Report verified', detail: 'The coordinator verified this report.' })
  } else {
    timeline.push({
      title: 'Coordinator review pending',
      detail: 'Your individual report is visible to you and the coordinator.',
    })
  }
  if (incident?.type === 'shortage') {
    if (
      ['responding', 'relief-delivered', 'restored'].includes(incident.status) &&
      store.state.tankers.some((item) => item.incidentId === incident.id)
    ) {
      timeline.push({
        title: 'Tanker assigned',
        detail: 'A coordinator approved a tanker for the community.',
      })
    }
    if (response && ['accepted', 'en-route', 'arrived', 'delivered', 'published'].includes(response.status)) timeline.push({ title: 'Driver accepted', detail: 'The assigned driver accepted the task.' })
    if (response && ['en-route', 'arrived', 'delivered', 'published'].includes(response.status)) timeline.push({ title: 'Response underway', detail: 'The driver recorded departure. The world illustrates the milestone; it is not GPS tracking.' })
    if (response && ['arrived', 'delivered', 'published'].includes(response.status)) timeline.push({ title: 'Arrival recorded', detail: 'The driver confirmed arrival at the community distribution point.' })
    if (response?.status === 'delivered') timeline.push({ title: 'Outcome recorded; review pending', detail: 'The driver submitted the delivery record. Actual litres appear after coordinator approval.' })
    if (incident.actualLitres !== undefined) {
      const detail =
        incident.actualLitres > 0
          ? `${formatLitres(incident.actualLitres)} delivered at the distribution point.`
          : 'No water was delivered on this assignment.'
      timeline.push({ title: 'Delivery update approved', detail })
    }
    if (incident.status === 'restored')
      timeline.push({
        title: 'Water restored',
        detail: 'The coordinator verified normal supply recovery.',
      })
  }
  if (incident?.type === 'leak') {
    if (incident.status !== 'verified')
      timeline.push({
        title: 'Maintenance crew assigned',
        detail: 'The crew received a work order to inspect and repair the public pipe.',
      })
    if (['in-progress', 'awaiting-verification', 'repaired'].includes(incident.status))
      timeline.push({ title: 'Maintenance started', detail: 'The field crew started on-site work.' })
    if (['awaiting-verification', 'repaired'].includes(incident.status))
      timeline.push({
        title: 'Repair submitted',
        detail: 'The field crew submitted the completed work for independent review.',
      })
    if (incident.status === 'repaired')
      timeline.push({
        title: 'Repair verified',
        detail: 'The coordinator confirmed the repair at this location.',
      })
  }
  const restored = store.state.leaks.find(l => l.id === incident?.id)?.waterRestoredAt
  if (restored) timeline.push({ title: 'Water restored', detail: `The coordinator confirmed water at the affected home. ${displayDate(restored)}` })
  const lastUpdate = report.updatedAt ?? restored ?? response?.submittedAt ?? report.createdAt
  return (
    <section className="wf-track-detail" aria-label={`Timeline for ${report.id}`}>
      <div className="wf-card-head">
        <div>
          <span className="wf-kicker">{report.id}</span>
          <h3>
            {report.town} {report.type === 'shortage' ? 'water shortage' : 'public leak'}
          </h3>
        </div>
        {incident && <Status tone={incident.tone}>{incident.label}</Status>}
      </div>
      {showScene && (incident?.type === 'shortage' && incident.status === 'restored'
        ? <Stage visual="tap" town={report.town} condition="Supply restored" phase={1} title="Household water supply" status="Water restored">The coordinator confirmed normal supply at the affected home.</Stage>
        : incident?.type === 'leak'
        ? <PipeOperation town={report.town} status={incident.status as Leak['status']} label={incident.label} waterRestoredAt={restored} />
        : response ? <TankerOperation assignment={response} town={report.town} state={store.state} />
        : <ReportStage kind={report.type} condition={report.condition} town={report.town} step="complete" />)}
      <SavedLocation point={report.coordinates} />
      <p className="wf-muted">Last update: {displayDate(lastUpdate)}</p>
      {response && <p className="wf-callout">{response.status === 'delivered' || response.status === 'published' ? 'Water delivered' : response.status === 'arrived' ? 'Tanker arrived' : response.status === 'en-route' ? 'Tanker on the way' : 'Tanker assigned'} · No arrival estimate available.</p>}
      <ol className="wf-timeline">
        {timeline.map((step) => (
          <li key={step.title}>
            <span aria-hidden="true" />
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function TrackReports({ store, reference }: { store: NouDiloStore; reference?: string }) {
  const reports = store.state.reports.filter((item) => item.source === 'resident')
  const [query, setQuery] = useState(reference ?? '')
  const [selected, setSelected] = useState<string | undefined>(reference ?? reports[0]?.id)
  const report = reports.find((item) => item.id === selected)
  const [message, setMessage] = useState('')
  function search(event: FormEvent) {
    event.preventDefault()
    const id = query.trim().toUpperCase()
    const match = reports.find((item) => item.id === id)
    setSelected(match?.id)
    setMessage(match ? '' : 'No report with that reference was found in your account.')
  }
  return (
    <>
      <p className="wf-muted">
        See verification, assignments and approved updates for reports submitted in your account.
      </p>
      <form className="wf-inline-form" onSubmit={search}>
        <label>
          Report reference
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ND-XXXXXXXX"
            required
          />
        </label>
        <button className="wf-button" type="submit">
          Find report
        </button>
      </form>
      {message && (
        <p className="wf-error" role="status">
          {message}
        </p>
      )}
      {reports.length > 0 && (
        <div className="wf-track-choices" aria-label="Recent reports">
          {reports.map((item) => (
            <button
              key={item.id}
              className="wf-button wf-button--quiet"
              type="button"
              aria-pressed={selected === item.id}
              onClick={() => {
                setSelected(item.id)
                setQuery(item.id)
                setMessage('')
              }}
            >
              {item.town} · {item.id}
            </button>
          ))}
        </div>
      )}
      {report ? (
        <ResidentTimeline store={store} report={report} showScene />
      ) : (
        !reports.length && (
          <Empty title="No reports yet">Submit a shortage or public leak report to track it here.</Empty>
        )
      )}
    </>
  )
}

export function ResidentDialog({
  mode,
  store,
  onClose,
  initialTown,
  initialCondition,
  sceneHidden,
  onToggleScene,
}: {
  mode: ResidentMode
  store: NouDiloStore
  onClose: () => void
  initialTown?: string
  initialCondition?: string
  sceneHidden?: boolean
  onToggleScene?: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState<'details' | 'review' | 'complete' | 'track'>(
    mode === 'track' ? 'track' : 'details',
  )
  const [town, setTown] = useState(initialTown && TOWNS.includes(initialTown) ? initialTown : '')
  const [condition, setCondition] = useState(initialCondition ?? '')
  const [duration, setDuration] = useState('')
  const [additionalNeeds, setAdditionalNeeds] = useState(false)
  const paused = useWorld(s => s.paused)
  const [households, setHouseholds] = useState('1')
  const [requestedLitres, setRequestedLitres] = useState('')
  const [location, setLocation] = useState('')
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number }>()
  const [description, setDescription] = useState('')
  const [evidence, setEvidence] = useState<Evidence>()
  const [reference, setReference] = useState<string>()
  const shortage = mode === 'shortage'
  const candidate = shortage
    ? store.state.shortages.find((item) => item.town === town && item.status !== 'restored')
    : undefined
  const enteredReport = store.state.reports.find((item) => item.id === reference)
  const title = {
    details: shortage ? 'Report a water shortage' : 'Report a public water leak',
    review: 'Review your report',
    complete: 'Report received',
    track: 'Track my reports',
  }[step]
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
    }
  }, [])
  useEffect(() => {
    heading.current?.focus()
  }, [step])
  useEffect(() => {
    if (enteredReport) setStep('complete')
  }, [enteredReport])
  function submit() {
    if (mode === 'track') return
    const id = reference ?? createReference('ND')
    setReference(id)
    store.dispatch({
      type: 'submitReport',
      report: {
        id,
        type: mode,
        coordinates,
        town,
        condition,
        duration: shortage ? duration : undefined,
        households: shortage ? Number(households) : undefined,
        requestedLitres: shortage && requestedLitres ? Number(requestedLitres) : undefined,
        location: shortage ? undefined : location.trim(),
        description: description.trim(),
        additionalNeeds,
        evidence,
      },
    })
  }
  return (
    <dialog
      className={`wf-dialog${step !== 'track' ? ' wf-dialog--staged' : ''}`}
      ref={dialog}
      aria-labelledby="wf-dialog-title"
      aria-busy={store.pending}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="wf-modal-inner">
        <div className="wf-card-head">
          <div>
            <span className="wf-kicker">
              {step === 'details' ? 'Step 1 of 2' : step === 'review' ? 'Step 2 of 2' : 'Resident services'}
            </span>
            <h2 id="wf-dialog-title" ref={heading} tabIndex={-1}>
              {title}
            </h2>
          </div>
          <button className="wf-icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        {onToggleScene && <button className="text-button" type="button" aria-expanded={!sceneHidden} onClick={onToggleScene}>{sceneHidden?'Show example':'Hide example'}</button>}
        <div className={step === 'track' ? undefined : 'wf-report-layout'}>
          {step !== 'track' && mode !== 'track' && <ReportStage kind={mode} condition={condition} duration={duration} town={town} step={step} />}
          <div>
        {step === 'details' && mode !== 'track' && (
          <form
            className="wf-form"
            onSubmit={(event) => {
              event.preventDefault()
              setStep('review')
            }}
          >
            <p className="wf-muted">
              {shortage
                ? 'Tell us where your household is experiencing a water supply problem.'
                : 'Give the maintenance team enough detail to locate a leak on public infrastructure.'}
            </p>
            <label>
              Town or village
              <select required value={town} onChange={(event) => setTown(event.target.value)}>
                <option value="">Choose a locality</option>
                {TOWNS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <LocationPicker town={town} value={coordinates} onChange={setCoordinates} onTown={setTown} />
            <label>
              {shortage ? 'What are you experiencing?' : 'How severe is the leak?'}
              <select required value={condition} onChange={(event) => setCondition(event.target.value)}>
                <option value="">Choose an option</option>
                {reportConditions[mode].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {shortage ? (
              <div className="wf-form-row">
                <label>
                  How long?
                  <select value={duration} onChange={(event) => setDuration(event.target.value)} required>
                    <option value="">Choose a duration</option>
                    {REPORT_DURATIONS.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Approx. households affected
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={households}
                    onChange={(event) => setHouseholds(event.target.value)}
                    required
                  />
                </label>
              </div>
            ) : (
              <label>
                Road or nearby landmark
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  required
                  maxLength={140}
                  placeholder="e.g. Vandermeersch Street, near the bus stop"
                />
              </label>
            )}
            {shortage && (
              <label>
                Approx. water needed (litres) <small>Optional</small>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={requestedLitres}
                  onChange={(event) => setRequestedLitres(event.target.value)}
                />
              </label>
            )}
            {shortage && <label className="wf-support-check"><input type="checkbox" checked={additionalNeeds} onChange={event => setAdditionalNeeds(event.target.checked)} /><span>Someone in the affected household needs additional support <small>Optional. Do not include personal medical details.</small></span></label>}
            <label>
              Additional details <small>Optional</small>
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={600}
              />
            </label>
            {!shortage && <EvidenceField value={evidence} onChange={setEvidence} />}
            <div className="wf-form-actions">
              <button className="wf-button" type="submit">
                Review report
              </button>
            </div>
          </form>
        )}
        {step === 'review' && (
          <div className="wf-form">
            <dl className="wf-facts wf-facts--review">
              <div>
                <dt>Locality</dt>
                <dd>{town}</dd>
              </div>
              {coordinates && <div><dt>Selected map pin</dt><dd>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</dd></div>}
              <div>
                <dt>{shortage ? 'Water supply' : 'Leak severity'}</dt>
                <dd>{condition}</dd>
              </div>
              {shortage ? (
                <>
                  <div>
                    <dt>Duration</dt>
                    <dd>{duration}</dd>
                  </div>
                  <div>
                    <dt>Households</dt>
                    <dd>{households}</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>Location</dt>
                  <dd>{location}</dd>
                </div>
              )}
              {shortage && requestedLitres && (
                <div>
                  <dt>Estimated water needed</dt>
                  <dd>{formatLitres(Number(requestedLitres))}</dd>
                </div>
              )}
              {description && (
                <div>
                  <dt>Details</dt>
                  <dd>{description}</dd>
                </div>
              )}
            </dl>
            <EvidencePreview evidence={evidence} />
            {candidate && (
              <p className="wf-callout">
                <MapPin size={18} aria-hidden="true" /> There is a verified community shortage in {town}. Your
                report will be linked for coordinator review.
              </p>
            )}
            {store.notice?.error && (
              <p className="wf-error" role="alert">
                {store.notice.message}
              </p>
            )}
            <div className="wf-form-actions">
              <button className="wf-button wf-button--quiet" type="button" onClick={() => setStep('details')}>
                Edit details
              </button>
              <button className="wf-button" type="button" onClick={submit} disabled={store.pending}>
                {store.pending ? 'Sending report…' : store.notice?.error ? 'Try again' : 'Send report'}
              </button>
            </div>
          </div>
        )}
        {step === 'complete' && enteredReport && (
          <div className="wf-form">
            <p className="wf-callout">
              <BadgeCheck size={22} aria-hidden="true" /> Keep this reference to follow the response.{' '}
              <strong>{enteredReport.id}</strong>
            </p>
            <ResidentTimeline store={store} report={enteredReport} />
            <div className="wf-form-actions">
              <button className="wf-button wf-button--quiet" type="button" onClick={onClose}>
                Done
              </button>
              <button className="wf-button" type="button" onClick={() => setStep('track')}>
                Track this report
              </button>
            </div>
          </div>
        )}
        {step === 'track' && <TrackReports store={store} reference={reference} />}
          </div>
        </div>
      </div>
    </dialog>
  )
}

function AuditTrail({ store, id }: { store: NouDiloStore; id?: string }) {
  const events = store.state.audit.filter((entry) => !id || entry.subjectId === id)
  return (
    <section className="wf-card">
      <h3>Audit history</h3>
      {events.length ? (
        <ol className="wf-timeline">
          {events.slice(0, 30).map((entry) => (
            <li key={entry.id}>
              <span aria-hidden="true" />
              <div>
                <strong>{entry.note}</strong>
                <p>
                  {entry.actor ?? entry.role} · {displayDate(entry.at)}
                  {!id && ` · ${entry.subjectId}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="wf-muted">No activity has been recorded for this incident.</p>
      )}
    </section>
  )
}

function ReviewQueue({ store, onIncident }: { store: NouDiloStore; onIncident: (id: string) => void }) {
  const [reviewedId, setReviewedId] = useState<string>()
  const [focusedId, setFocusedId] = useState<string>()
  const pending = store.state.reports.filter((item) => item.status !== 'verified')
  const verified = store.state.reports.find((item) => item.id === reviewedId && item.status === 'verified')
  useEffect(() => {
    if (verified?.incidentId) onIncident(verified.incidentId)
  }, [onIncident, verified])
  return (
    <section className="wf-card">
      <div className="wf-card-head">
        <div>
          <h3>Individual reports</h3>
          <p className="wf-muted">
            Review the resident’s evidence before adding their report to the verified register.
          </p>
        </div>
        <span className="wf-count" aria-label={`${pending.length} pending`}>
          {pending.length}
        </span>
      </div>
      {!pending.length && (
        <Empty title="No reports awaiting review">
          Resident reports appear here before their individual verification.
        </Empty>
      )}
      <div className="wf-stack">
        {pending.map((report) => (
          <ReviewReport
            key={report.id}
            report={report}
            store={store}
            onReview={() => setReviewedId(report.id)}
            focused={report.id === (focusedId ?? pending[0]?.id)}
            onFocus={() => setFocusedId(report.id)}
          />
        ))}
      </div>
    </section>
  )
}

function ReviewReport({
  report,
  store,
  onReview,
  focused,
  onFocus,
}: {
  report: Report
  store: NouDiloStore
  onReview: () => void
  focused: boolean
  onFocus: () => void
}) {
  const [needs, setNeeds] = useState('2000')
  const candidate =
    report.type === 'shortage' &&
    store.state.shortages.find((item) => item.town === report.town && item.status !== 'restored')
  return (
    <form
      className="wf-subcard wf-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (await store.dispatch({ type: 'verifyReport', reportId: report.id, estimatedLitres: Number(needs) })) onReview()
      }}
    >
      <div className="wf-card-head">
        <div>
          <span className="wf-kicker">
            {report.id} · {displayDate(report.createdAt)}
          </span>
          <h4>
            {report.town} {report.type === 'leak' ? 'public leak' : 'water shortage'}
          </h4>
        </div>
        <Status tone={report.type === 'leak' ? 'blue' : 'amber'}>
          {report.status === 'linked' ? 'Linked for review' : 'Pending review'}
        </Status>
      </div>
      {focused ? <ReportStage kind={report.type} condition={report.condition} town={report.town} step="review" />
        : <button type="button" className="wf-button wf-button--quiet" onClick={onFocus}>Open incident view</button>}
      <dl className="wf-facts">
        <div>
          <dt>Condition</dt>
          <dd>{report.condition}</dd>
        </div>
        {report.duration && (
          <div>
            <dt>Duration</dt>
            <dd>{report.duration}</dd>
          </div>
        )}
        {report.households && (
          <div>
            <dt>Approx. households</dt>
            <dd>{report.households}</dd>
          </div>
        )}
        {report.requestedLitres && (
          <div>
            <dt>Resident water estimate</dt>
            <dd>{formatLitres(report.requestedLitres)}</dd>
          </div>
        )}
        {report.location && (
          <div>
            <dt>Public location</dt>
            <dd>{report.location}</dd>
          </div>
        )}
      </dl>
      {report.coordinates && <p><a href={`https://www.openstreetmap.org/?mlat=${report.coordinates.latitude}&mlon=${report.coordinates.longitude}#map=18/${report.coordinates.latitude}/${report.coordinates.longitude}`} target="_blank" rel="noreferrer">Open reported location on map</a></p>}
      {report.description && <p>{report.description}</p>}
      <EvidencePreview evidence={report.evidence} />
      <ul className="priority-reasons" aria-label="Priority assessment reasons"><li>Suggested priority: {assessPriority([report]).priority}. Complaint count is not a priority score.</li>{assessPriority([report]).reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      {candidate && (
        <p className="wf-callout">
          <MapPin size={18} aria-hidden="true" /> Verify and retain the individual report under {candidate.id}
          .
        </p>
      )}
      {report.type === 'shortage' && !candidate && (
        <label>
          Assessed litres of immediate need
          <input
            type="number"
            min="1"
            max="1000000"
            required
            value={needs}
            onChange={(event) => setNeeds(event.target.value)}
          />
        </label>
      )}
      <div>
        <button className="wf-button" type="submit">
          {candidate ? 'Verify linked report' : 'Verify report'}
        </button>
      </div>
    </form>
  )
}

function GroupedReports({ store, id }: { store: NouDiloStore; id: string }) {
  const reports = linkedReports(store.state, id)
  return (
    <details className="wf-card wf-grouped">
      <summary>
        Grouped reports <span className="wf-count">{reports.length}</span>
      </summary>
      <div className="wf-list">
        {reports.map((item) => (
          <div className="wf-list-row" key={item.id}>
            <div>
              <strong>{item.condition}</strong>
              <p>
                {item.id} · {displayDate(item.createdAt)}
              </p>
            </div>
            <Status tone={item.status === 'verified' ? 'green' : 'amber'}>
              {item.status === 'verified' ? 'Verified' : 'Awaiting review'}
            </Status>
          </div>
        ))}
      </div>
    </details>
  )
}

function DispatchForm({ incident, store }: { incident: PublicIncident; store: NouDiloStore }) {
  const vehicles = fleetFor(store.state).filter((item) => vehicleAvailable(store.state, item.id) && (store.resources?.includes(item.id) ?? true))
  const [vehicle, setVehicle] = useState(vehicles[0]?.id ?? '')
  const limit = Math.min(
    availableWater(store.state),
    vehicles.find((item) => item.id === vehicle)?.capacity ?? 0,
  )
  const [quantity, setQuantity] = useState(String(Math.min(incident.estimatedLitres ?? limit, limit)))
  const [destination, setDestination] = useState(`${incident.town} community distribution point`)
  return (
    <form
      className="wf-form"
      onSubmit={(event) => {
        event.preventDefault()
        store.dispatch({
          type: 'assignTanker',
          incidentId: incident.id,
          vehicleId: vehicle,
          approvedLitres: Number(quantity),
          destination,
        })
      }}
    >
      {vehicles.length > 0 && availableWater(store.state) > 0 ? (
        <>
          <label>
            Available tanker
            <select
              value={vehicle}
              onChange={(event) => {
                const next = vehicles.find((item) => item.id === event.target.value)
                setVehicle(event.target.value)
                setQuantity(
                  String(
                    Math.min(
                      incident.estimatedLitres ?? Infinity,
                      next?.capacity ?? 0,
                      availableWater(store.state),
                    ),
                  ),
                )
              }}
              required
            >
              {vehicles.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.id} · {formatLitres(item.capacity)} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="wf-form-row">
            <label>
              Approved litres
              <input
                type="number"
                min="1"
                max={limit}
                value={quantity}
                required
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              Distribution point
              <input
                required
                maxLength={140}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              />
            </label>
          </div>
          <div>
            <button className="wf-button" type="submit">
              Approve and assign tanker
            </button>
          </div>
        </>
      ) : (
        <p className="wf-callout">No tanker and water allocation is currently available.</p>
      )}
    </form>
  )
}

function ConfirmationForm({
  label,
  button,
  onSubmit,
  confirmWater = false,
}: {
  label: string
  button: string
  confirmWater?: boolean
  onSubmit: (value: string, waterRestored?: boolean) => void
}) {
  const [value, setValue] = useState('')
  const [waterRestored, setWaterRestored] = useState(false)
  return (
    <form
      className="wf-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (value.trim()) onSubmit(value, waterRestored)
      }}
    >
      <label>
        {label}
        <textarea
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={2}
          maxLength={600}
        />
      </label>
      {confirmWater && <label className="wf-support-check"><input type="checkbox" checked={waterRestored} onChange={e => setWaterRestored(e.target.checked)} /> I also confirmed water is flowing at the affected home</label>}
      <div>
        <button className="wf-button" type="submit">
          {button}
        </button>
      </div>
    </form>
  )
}

function CrewForm({ incident, store }: { incident: PublicIncident; store: NouDiloStore }) {
  const crews = crewsFor(store.state).filter((item) => crewAvailable(store.state, item) && (store.resources?.includes(item) ?? true))
  const [crew, setCrew] = useState(crews[0] ?? '')
  if (!crews.length) return <p className="wf-callout">No provisioned crew is available for a new work order.</p>
  return (
    <form
      className="wf-form"
      onSubmit={(event) => {
        event.preventDefault()
        store.dispatch({ type: 'assignCrew', leakId: incident.id, crew })
      }}
    >
      <label>
        Available repair crew
        <select required value={crew} onChange={(event) => setCrew(event.target.value)}>
          {crews.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <div>
        <button className="wf-button" type="submit">
          Assign repair crew
        </button>
      </div>
    </form>
  )
}

function CoordinatorResponse({
  incident,
  store,
}: {
  incident: PublicIncident
  store: NouDiloStore
}) {
  const tanker = store.state.tankers.find((item) => item.incidentId === incident.id && item.status !== 'declined')
  const repair = store.state.repairs.find((item) => item.leakId === incident.id)
  if (incident.type === 'shortage')
    return (
      <>
        <section className="wf-card wf-form">
          <div className="wf-card-head">
            <div>
              <h3>Tanker response</h3>
              <p className="wf-muted">Approve an allocation and monitor actual delivery.</p>
            </div>
            <Truck size={22} aria-hidden="true" />
          </div>
          {incident.status === 'restored' ? <Stage visual="tap" town={incident.town} condition="Supply restored" phase={1} title="Household supply" status="Water restored">The coordinator confirmed regular supply.</Stage> : <TankerOperation assignment={tanker} town={incident.town} state={store.state} />}
          {incident.status === 'critical' && <DispatchForm incident={incident} store={store} />}
          {tanker && (
            <>
              <dl className="wf-facts">
                <div>
                  <dt>Assignment</dt>
                  <dd>{tanker.id}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd>{tanker.vehicleId}</dd>
                </div>
                <div>
                  <dt>Approved quantity</dt>
                  <dd>{formatLitres(tanker.approvedLitres)}</dd>
                </div>
                <div>
                  <dt>Actual quantity</dt>
                  <dd>
                    {tanker.actualLitres === undefined
                      ? 'Awaiting driver'
                      : formatLitres(tanker.actualLitres)}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{tankerLabels[tanker.status]}</dd>
                </div>
              </dl>
              {tanker.issues.length > 0 && (
                <ul className="wf-problems">
                  {tanker.issues.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              )}
              {tanker.status === 'delivered' && (
                <div>
                  <button
                    className="wf-button"
                    type="button"
                    onClick={() => store.dispatch({ type: 'publishDelivery', id: tanker.id })}
                  >
                    Approve delivery update
                  </button>
                </div>
              )}
              
            </>
          )}
          {(incident.status === 'critical' || incident.status === 'relief-delivered') && (
            <details className="wf-restoration">
              <summary>Confirm regular supply recovery</summary>
              <ConfirmationForm
                label="Independent supply recovery finding"
                button="Verify normal supply"
                onSubmit={(evidence) =>
                  store.dispatch({ type: 'verifyRestoration', incidentId: incident.id, evidence })
                }
              />
            </details>
          )}
          {incident.status === 'restored' && (
            <p className="wf-callout">
              <ShieldCheck size={18} aria-hidden="true" /> Regular water supply was independently verified.
            </p>
          )}
        </section>
      </>
    )
  return (
    <>
      <section className="wf-card wf-form">
        <div className="wf-card-head">
          <div>
            <h3>Public pipe repair</h3>
            <p className="wf-muted">Assign a crew and review the completed work.</p>
          </div>
          <Wrench size={22} aria-hidden="true" />
        </div>
        <PipeOperation town={incident.town} status={incident.status as Leak['status']} label={incident.label} waterRestoredAt={store.state.leaks.find(l => l.id === incident.id)?.waterRestoredAt} />
        {incident.status === 'verified' && <CrewForm incident={incident} store={store} />}
        {repair && (
          <>
            <dl className="wf-facts">
              <div>
                <dt>Work order</dt>
                <dd>{repair.id}</dd>
              </div>
              <div>
                <dt>Crew</dt>
                <dd>{repair.crew}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{repairLabels[repair.status]}</dd>
              </div>
              {repair.inspection && (
                <div>
                  <dt>Inspection</dt>
                  <dd>{repair.inspection}</dd>
                </div>
              )}
              {repair.work && (
                <div>
                  <dt>Work performed</dt>
                  <dd>{repair.work}</dd>
                </div>
              )}
            </dl>
            <EvidencePreview evidence={repair.evidence} />
            {repair.status === 'submitted' && (
              <ConfirmationForm
                label="Independent repair verification finding"
                button="Verify and publish repair"
                confirmWater
                onSubmit={(evidence, waterRestored) => store.dispatch({ type: 'verifyRepair', id: repair.id, evidence, waterRestored })}
              />
            )}
            
          </>
        )}
      </section>
    </>
  )
}

function ResourceBoard({ store }: { store: NouDiloStore }) {
  return (
    <div className="wf-role-grid">
      <section className="wf-card">
        <h3>Water and tanker availability</h3>
        <p className="wf-callout">
          <Droplet size={18} aria-hidden="true" /> {formatLitres(availableWater(store.state))} available for
          allocation
        </p>
        <div className="wf-list">
          {fleetFor(store.state).map((vehicle) => (
            <div className="wf-list-row" key={vehicle.id}>
              <div>
                <strong>
                  {vehicle.id} · {vehicle.name}
                </strong>
                <p>
                  {formatLitres(vehicle.capacity)} capacity
                </p>
              </div>
              <Status tone={vehicleAvailable(store.state, vehicle.id) ? 'green' : 'amber'}>
                {store.resources && !store.resources.includes(vehicle.id) ? 'Needs worker account' : vehicleAvailable(store.state, vehicle.id) ? 'Available' : 'Assigned'}
              </Status>
            </div>
          ))}
        </div>
      </section>
      <section className="wf-card">
        <h3>Maintenance crew availability</h3>
        <div className="wf-list">
          {crewsFor(store.state).map((crew) => (
            <div className="wf-list-row" key={crew}>
              <strong>{crew}</strong>
              <Status tone={crewAvailable(store.state, crew) ? 'green' : 'amber'}>
                {store.resources && !store.resources.includes(crew) ? 'Needs worker account' : crewAvailable(store.state, crew) ? 'Available' : 'Assigned'}
              </Status>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function NoticeBoard({ store }: { store: NouDiloStore }) {
  const towns = [...new Set(publicIncidents(store.state).map((item) => item.town))].sort((a, b) =>
    a.localeCompare(b),
  )
  const [town, setTown] = useState(towns[0] ?? '')
  const [text, setText] = useState('')
  return (
    <div className="wf-role-grid">
      <section className="wf-card">
        <h3>Publish a verified notice</h3>
        <form
          className="wf-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (text.trim()) {
              store.dispatch({ type: 'publishNotice', town, text })
              setText('')
            }
          }}
        >
          <label>
            Locality
            <select value={town} onChange={(event) => setTown(event.target.value)} required>
              {towns.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Public update
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              required
              rows={3}
              maxLength={500}
            />
          </label>
          <div>
            <button className="wf-button" type="submit">
              Publish notice
            </button>
          </div>
        </form>
      </section>
      <section className="wf-card">
        <h3>Published notices</h3>
        {store.state.notices.length ? (
          <div className="wf-list">
            {store.state.notices.map((notice) => (
              <div className="wf-list-row" key={notice.id}>
                <div>
                  <strong>{notice.town}</strong>
                  <p>{notice.text}</p>
                  <p>{displayDate(notice.at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No public notices">Approved notices will appear in the public experience.</Empty>
        )}
      </section>
    </div>
  )
}

type CoordinatorTab = 'register' | 'review' | 'resources' | 'notices' | 'audit'
type FieldTab = 'tankers' | 'repairs'

export function Coordinator({
  store,
  visuals,
  initialTab = 'register',
  initialId = 'INC-014',
}: {
  store: NouDiloStore
  visuals?: Visuals
  initialTab?: CoordinatorTab
  initialId?: string
}) {
  const incidents = publicIncidents(store.state)
  const [selectedId, setSelectedId] = useState(initialId)
  const [tab, setTab] = useState(initialTab)
  const selected = incidents.find((incident) => incident.id === selectedId) ?? incidents[0]
  const pending = store.state.reports.filter((item) => item.status !== 'verified').length
  const assigned = store.state.tankers.filter(
    (item) => !['delivered', 'published', 'declined'].includes(item.status),
  ).length
  const tabs = [
    { id: 'register', label: 'Incident register' },
    { id: 'review', label: pending ? `Report review (${pending})` : 'Report review' },
    { id: 'resources', label: 'Resources' },
    { id: 'notices', label: 'Public notices' },
    { id: 'audit', label: 'Audit log' },
  ] as const
  const map =
    typeof visuals?.map === 'function'
      ? visuals.map({ selectedId: selected?.id, onSelect: setSelectedId })
      : visuals?.map
  return (
    <section className="wf-workspace wf-coordinator" aria-label="Coordinator operations">
      <header className="wf-workspace-header">
        <div>
          <h1>Operations centre</h1>
          <p>Review reports, prioritise verified incidents and approve community responses.</p>
        </div>
      </header>
      <div className="wf-metrics">
        <div>
          <FileText size={20} aria-hidden="true" />
          <strong>{incidents.filter((item) => item.tone !== 'green').length}</strong>
          <span>Open verified incidents</span>
        </div>
        <div>
          <Clock3 size={20} aria-hidden="true" />
          <strong>{pending}</strong>
          <span>Reports for review</span>
        </div>
        <div>
          <Truck size={20} aria-hidden="true" />
          <strong>{assigned}</strong>
          <span>Active tanker assignments</span>
        </div>
        <div>
          <Droplet size={20} aria-hidden="true" />
          <strong>{formatLitres(availableWater(store.state))}</strong>
          <span>Water available</span>
        </div>
      </div>
      <nav className="wf-tabs" aria-label="Operations sections">
        {tabs.map((item) => (
          <button
            className="wf-tab"
            type="button"
            key={item.id}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === 'review' && (
        <ReviewQueue
          store={store}
          onIncident={(id) => {
            setSelectedId(id)
            setTab('register')
          }}
        />
      )}
      {tab === 'resources' && <ResourceBoard store={store} />}
      {tab === 'notices' && <NoticeBoard store={store} />}
      {tab === 'audit' && <AuditTrail store={store} />}
      {tab === 'register' && (
        <div className="wf-role-grid wf-role-grid--operations">
          <div className="wf-stack">
            {map && (
              <section className="wf-card wf-map-card">
                <div className="wf-card-head">
                  <div>
                    <h3>Mauritius overview</h3>
                    <p className="wf-muted">Select a verified incident on the map.</p>
                  </div>
                  <MapPin size={21} aria-hidden="true" />
                </div>
                <div className="wf-map-frame">{map}</div>
              </section>
            )}
            <section className="wf-card">
              <h3>Verified incidents</h3>
              <div className="wf-list">
                {incidents.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="wf-list-row wf-select-row"
                    aria-pressed={selected?.id === item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span>
                      <strong>{item.town}</strong>
                      <small>
                        {item.id} · {item.type === 'shortage' ? 'Water shortage' : 'Public leak'}
                      </small>
                    </span>
                    <Status tone={item.tone}>{item.label}</Status>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div className="wf-stack">
            {selected && (
              <>
                <section className="wf-card wf-incident">
                  <div className="wf-card-head">
                    <div>
                      <span className="wf-kicker">{selected.id}</span>
                      <h2>{selected.town}</h2>
                    </div>
                    <Status tone={selected.tone}>{selected.label}</Status>
                  </div>
                  <p>{selected.summary}</p>
                  <dl className="wf-facts">
                    <div>
                      <dt>Priority assessment</dt>
                      <dd>
                        {
                          (selected.type === 'shortage' ? store.state.shortages : store.state.leaks).find(
                            (item) => item.id === selected.id,
                          )?.priority
                        }
                      </dd>
                    </div>
                    <div>
                      <dt>Verified reports</dt>
                      <dd>{selected.reports}</dd>
                    </div>
                    {selected.households !== undefined && (
                      <div>
                        <dt>Estimated households</dt>
                        <dd>{selected.households}</dd>
                      </div>
                    )}
                    {selected.estimatedLitres !== undefined && (
                      <div>
                        <dt>Assessed water need</dt>
                        <dd>{formatLitres(selected.estimatedLitres)}</dd>
                      </div>
                    )}
                    {selected.location && (
                      <div>
                        <dt>Public location</dt>
                        <dd>{selected.location}</dd>
                      </div>
                    )}
                  </dl>
                  <ul className="priority-reasons" aria-label="Community priority reasons">{assessPriority(linkedReports(store.state, selected.id).filter(r => r.status === 'verified')).reasons.map(reason => <li key={reason}>{reason}</li>)}<li>Priority combines duration, impact, support needs, and reported severity; it is not based on complaint count alone.</li></ul>
                </section>
                <CoordinatorResponse
                  key={selected.id}
                  incident={selected}
                  store={store}
                />
                <GroupedReports id={selected.id} store={store} />
                <AuditTrail id={selected.id} store={store} />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function SavedLocation({ point }: { point?: { latitude: number; longitude: number } }) {
  return point ? <p><a className="text-button" href={`https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=18/${point.latitude}/${point.longitude}`} target="_blank" rel="noreferrer">Open reported location on map</a></p> : null
}

function TankerTask({
  item,
  store,
}: {
  item: TankerAssignment
  store: NouDiloStore
}) {
  const incident = store.state.shortages.find((row) => row.id === item.incidentId)
  const vehicle = fleetFor(store.state).find((row) => row.id === item.vehicleId)
  const [quantity, setQuantity] = useState(String(item.approvedLitres))
  const [showProblem, setShowProblem] = useState(false)
  const steps = {
    assigned: { next: 'accepted', action: 'Accept assignment' },
    accepted: { next: 'en-route', action: 'Confirm departure' },
    'en-route': { next: 'arrived', action: 'Confirm arrival' },
  } as const
  const step =
    item.status === 'assigned' || item.status === 'accepted' || item.status === 'en-route'
      ? steps[item.status]
      : undefined
  return (
    <>
      <section className="wf-card wf-form">
        <div className="wf-card-head">
          <div>
            <span className="wf-kicker">
              {item.id} · {item.vehicleId}
            </span>
            <h2>{incident?.town ?? 'Tanker assignment'}</h2>
          </div>
          <Status tone={item.status === 'published' ? 'green' : 'amber'}>{tankerLabels[item.status]}</Status>
        </div>
        <SavedLocation point={item.coordinates} /><TankerOperation assignment={item} town={incident?.town ?? 'Distribution point'} state={store.state} />
        <dl className="wf-facts">
          <div>
            <dt>Distribution point</dt>
            <dd>{item.destination}</dd>
          </div>
          <div>
            <dt>Vehicle</dt>
            <dd>{item.vehicleId}</dd>
          </div>
          <div>
            <dt>Approved quantity</dt>
            <dd>{formatLitres(item.approvedLitres)}</dd>
          </div>
          <div>
            <dt>Actual quantity</dt>
            <dd>{item.actualLitres === undefined ? 'Awaiting delivery' : formatLitres(item.actualLitres)}</dd>
          </div>
        </dl>
        {step && (
          <div>
            <button
              className="wf-button"
              type="button"
              onClick={() => store.dispatch({ type: 'advanceTanker', id: item.id, step: step.next })}
            >
              {step.action}
            </button>
          </div>
        )}
        {item.status === 'assigned' && <details className="decline-assignment"><summary>Decline this assignment</summary><ConfirmationForm label="Reason for declining" button="Confirm decline" onSubmit={reason => { void store.dispatch({ type: 'declineTanker', id: item.id, reason }) }} /></details>}
        {item.status === 'declined' && <p className="wf-callout">This assignment was declined. The coordinator can arrange a new response.</p>}
        {item.status === 'arrived' && (
          <form
            className="wf-form"
            onSubmit={(event) => {
              event.preventDefault()
              store.dispatch({ type: 'recordDelivery', id: item.id, actualLitres: Number(quantity) })
            }}
          >
            <label>
              Actual litres delivered
              <input
                type="number"
                min="0"
                max={vehicle?.capacity ?? 0}
                value={quantity}
                required
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <div>
              <button className="wf-button" type="submit">
                Record actual delivery
              </button>
            </div>
          </form>
        )}
        {item.status === 'delivered' && (
          <p className="wf-callout">
            <Clock3 size={18} aria-hidden="true" /> Delivery recorded. The coordinator will review the update
            before it appears in the resident timeline.
          </p>
        )}
        
        {item.status === 'published' && (
          <p className="wf-callout">
            <BadgeCheck size={18} aria-hidden="true" /> The coordinator published the delivery update.
          </p>
        )}
        {item.issues.length > 0 && (
          <ul className="wf-problems">
            {item.issues.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
        )}
        {!['delivered', 'published', 'declined'].includes(item.status) && (
          <div>
            <button
              className="wf-button wf-button--quiet"
              type="button"
              aria-expanded={showProblem}
              aria-controls="wf-driver-problem"
              onClick={() => setShowProblem((open) => !open)}
            >
              Report an operational problem
            </button>
          </div>
        )}
        {showProblem && !['delivered', 'published', 'declined'].includes(item.status) && (
          <div id="wf-driver-problem">
            <ConfirmationForm
              label="Describe the problem"
              button="Send to coordinator"
              onSubmit={(detail) => {
                store.dispatch({ type: 'recordProblem', id: item.id, detail })
                setShowProblem(false)
              }}
            />
          </div>
        )}
      </section>
      <section className="wf-card">
        <div className="wf-card-head">
          <div>
            <h3>Route and destination</h3>
            <p className="wf-muted">
              Use approved dispatch instructions and check vehicle restrictions before departing. The world’s route is illustrative and is not safe navigation guidance. Record progress only when safely parked.
            </p>
          </div>
          <MapPin size={22} aria-hidden="true" />
        </div>
        <dl className="wf-facts">
          <div>
            <dt>Departure depot</dt>
            <dd>{vehicle?.name}</dd>
          </div>
          <div>
            <dt>Destination</dt>
            <dd>{item.destination}</dd>
          </div>
        </dl>
      </section>
    </>
  )
}

function RepairTask({
  item,
  leak,
  store,
}: {
  item: RepairOrder
  leak: Leak
  store: NouDiloStore
}) {
  const [inspection, setInspection] = useState(item.inspection ?? '')
  const [work, setWork] = useState(item.work ?? '')
  const [evidence, setEvidence] = useState(item.evidence)
  return (
    <>
      <section className="wf-card wf-form">
        <div className="wf-card-head">
          <div>
            <span className="wf-kicker">
              {item.id} · {leak.id}
            </span>
            <h2>{leak.town} public leak</h2>
          </div>
          <Status tone={item.status === 'verified' ? 'green' : 'amber'}>{repairLabels[item.status]}</Status>
        </div>
        <SavedLocation point={item.coordinates} /><PipeOperation town={leak.town} status={leak.status} label={repairLabels[item.status]} />
        <dl className="wf-facts">
          <div>
            <dt>Location</dt>
            <dd>{leak.location}</dd>
          </div>
          <div>
            <dt>Assigned crew</dt>
            <dd>{item.crew}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{leak.priority}</dd>
          </div>
        </dl>
        {item.status === 'assigned' && (
          <div>
            <button
              className="wf-button"
              type="button"
              onClick={() => store.dispatch({ type: 'startRepair', id: item.id })}
            >
              Start maintenance
            </button>
          </div>
        )}
        {item.status === 'in-progress' && (
          <>
            <form
              className="wf-subcard wf-form"
              onSubmit={(event) => {
                event.preventDefault()
                store.dispatch({ type: 'inspectRepair', id: item.id, inspection, evidence })
              }}
            >
              <h4>On-site inspection</h4>
              <label>
                Inspection finding
                <textarea
                  rows={2}
                  required
                  value={inspection}
                  onChange={(event) => setInspection(event.target.value)}
                  maxLength={600}
                />
              </label>
              <div>
                <button className="wf-button wf-button--quiet" type="submit">
                  {item.inspection ? 'Update inspection' : 'Record inspection'}
                </button>
              </div>
            </form>
            <form
              className="wf-subcard wf-form"
              onSubmit={(event) => {
                event.preventDefault()
                store.dispatch({ type: 'submitRepair', id: item.id, work, evidence })
              }}
            >
              <h4>Repair completion</h4>
              <label>
                Work performed
                <textarea
                  rows={3}
                  required
                  value={work}
                  onChange={(event) => setWork(event.target.value)}
                  maxLength={600}
                />
              </label>
              <EvidenceField value={evidence} onChange={setEvidence} />
              {!item.inspection && (
                <p className="wf-muted">Record an inspection before submitting the completed work.</p>
              )}
              <div>
                <button className="wf-button" type="submit" disabled={!item.inspection}>
                  Submit repair for verification
                </button>
              </div>
            </form>
          </>
        )}
        {['submitted', 'verified'].includes(item.status) && (
          <>
            <dl className="wf-facts">
              <div>
                <dt>Inspection</dt>
                <dd>{item.inspection}</dd>
              </div>
              <div>
                <dt>Work performed</dt>
                <dd>{item.work}</dd>
              </div>
            </dl>
            <EvidencePreview evidence={item.evidence} />
            <p className="wf-callout">
              <ShieldCheck size={18} aria-hidden="true" />{' '}
              {item.status === 'verified'
                ? 'The repair was independently verified.'
                : 'Completed work is awaiting coordinator verification.'}
            </p>
          </>
        )}
        
      </section>
    </>
  )
}

export function FieldWorkspace({
  store,
  initialTab,
  initialId,
}: {
  store: NouDiloStore
  initialTab?: FieldTab
  initialId?: string
}) {
  const [tab, setTab] = useState<FieldTab>(
    () =>
      initialTab ??
      (store.state.repairs.some((item) => item.status === 'assigned' || item.status === 'in-progress')
        ? 'repairs'
        : 'tankers'),
  )
  const [selectedTanker, setSelectedTanker] = useState(initialId ?? store.state.tankers[0]?.id)
  const [selectedRepair, setSelectedRepair] = useState(initialId ?? store.state.repairs[0]?.id)
  const tanker = store.state.tankers.find((item) => item.id === selectedTanker) ?? store.state.tankers[0]
  const repair = store.state.repairs.find((item) => item.id === selectedRepair) ?? store.state.repairs[0]
  const leak = store.state.leaks.find((item) => item.id === repair?.leakId)
  return (
    <section className="wf-workspace wf-workers" aria-label="Worker assignments">
      <header className="wf-workspace-header">
        <div>
          <h1>Field assignments</h1>
          <p>Choose tanker or repair work. Record progress and send completed work to the coordinator.</p>
        </div>
      </header>
      <nav className="wf-tabs" aria-label="Work types">
        <button
          className="wf-tab"
          type="button"
          aria-current={tab === 'tankers' ? 'page' : undefined}
          onClick={() => setTab('tankers')}
        >
          <Truck size={19} aria-hidden="true" /> Tanker drivers
        </button>
        <button
          className="wf-tab"
          type="button"
          aria-current={tab === 'repairs' ? 'page' : undefined}
          onClick={() => setTab('repairs')}
        >
          <Wrench size={19} aria-hidden="true" /> Maintenance crews
        </button>
      </nav>
      {tab === 'tankers' ? (
        <div className="wf-role-grid wf-role-grid--field">
          <div className="wf-card">
            <h3>Tanker assignments</h3>
            {store.state.tankers.length ? (
              <div className="wf-list">
                {store.state.tankers.map((item) => (
                  <button
                    className="wf-list-row wf-select-row"
                    type="button"
                    key={item.id}
                    aria-pressed={tanker?.id === item.id}
                    onClick={() => setSelectedTanker(item.id)}
                  >
                    <span>
                      <strong>{store.state.shortages.find((row) => row.id === item.incidentId)?.town}</strong>
                      <small>
                        {item.vehicleId} · {formatLitres(item.approvedLitres)}
                      </small>
                    </span>
                    <Status tone={item.status === 'published' ? 'green' : 'amber'}>
                      {tankerLabels[item.status]}
                    </Status>
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="No tanker assignments">New assignments appear after coordinator approval.</Empty>
            )}
          </div>
          <div className="wf-stack">
            {tanker && (
              <TankerTask
                key={tanker.id}
                item={tanker}
                store={store}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="wf-role-grid wf-role-grid--field">
          <div className="wf-card">
            <h3>Repair work orders</h3>
            {store.state.repairs.length ? (
              <div className="wf-list">
                {store.state.repairs.map((item) => (
                  <button
                    className="wf-list-row wf-select-row"
                    type="button"
                    key={item.id}
                    aria-pressed={repair?.id === item.id}
                    onClick={() => setSelectedRepair(item.id)}
                  >
                    <span>
                      <strong>{store.state.leaks.find((row) => row.id === item.leakId)?.town}</strong>
                      <small>{item.crew}</small>
                    </span>
                    <Status tone={item.status === 'verified' ? 'green' : 'amber'}>
                      {repairLabels[item.status]}
                    </Status>
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="No repair work orders">
                Orders appear once a coordinator assigns a crew to a verified leak.
              </Empty>
            )}
          </div>
          <div className="wf-stack">
            {repair && leak && (
              <RepairTask
                key={repair.id}
                item={repair}
                leak={leak}
                store={store}
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}
