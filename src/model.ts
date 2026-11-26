export const TOWNS = [
  'Beau Bassin',
  'Bambous',
  'Curepipe',
  'Flacq',
  'Goodlands',
  'Grand Baie',
  'Mahébourg',
  'Port Louis',
  'Quatre Bornes',
  'Rose Hill',
  'Souillac',
  'Vacoas',
].sort((a, b) => a.localeCompare(b))

export type ReportKind = 'shortage' | 'leak'
export type Tone = 'red' | 'amber' | 'blue' | 'green'
export type Evidence = { name: string; preview?: string }
export type Report = {
  id: string
  type: ReportKind
  town: string
  condition: string
  duration?: string
  households?: number
  requestedLitres?: number
  location?: string
  description: string
  evidence?: Evidence
  createdAt: string
  source: 'resident' | 'sample'
  status: 'received' | 'linked' | 'verified'
  incidentId?: string
}

export type Shortage = {
  id: string
  town: string
  status: 'critical' | 'responding' | 'relief-delivered' | 'restored'
  priority: 'Critical' | 'High' | 'Moderate'
  estimatedLitres: number
  households: number
  summary: string
}
export type Leak = {
  id: string
  town: string
  status: 'verified' | 'assigned' | 'in-progress' | 'awaiting-verification' | 'repaired'
  priority: 'Critical' | 'High' | 'Moderate'
  location: string
  summary: string
}
export type TankerAssignment = {
  id: string
  incidentId: string
  vehicleId: string
  approvedLitres: number
  actualLitres?: number
  status: 'assigned' | 'accepted' | 'en-route' | 'arrived' | 'delivered' | 'published'
  destination: string
  issues: string[]
  submittedAt?: string
}
export type RepairOrder = {
  id: string
  leakId: string
  crew: string
  status: 'assigned' | 'in-progress' | 'submitted' | 'verified'
  inspection?: string
  work?: string
  evidence?: Evidence
}
export type AuditEvent = {
  id: string
  actor?: string
  subjectId: string
  role: 'Resident' | 'Coordinator' | 'Tanker driver' | 'Maintenance crew'
  note: string
  at: string
}
export type WaterNotice = { id: string; text: string; town: string; at: string }
export type State = {
  schema: 1
  reports: Report[]
  shortages: Shortage[]
  leaks: Leak[]
  tankers: TankerAssignment[]
  repairs: RepairOrder[]
  audit: AuditEvent[]
  notices: WaterNotice[]
}

export const FLEET = [
  { id: 'WT-04', name: 'Curepipe depot', capacity: 8_000 },
  { id: 'WT-07', name: 'Vacoas depot', capacity: 12_000 },
  { id: 'WT-09', name: 'Flacq depot', capacity: 6_000 },
]
export const CREWS = ['Central maintenance crew', 'Northern maintenance crew', 'Eastern maintenance crew']
export const WATER_AVAILABLE = 28_000

export type PublicIncident = {
  id: string
  town: string
  type: ReportKind
  title: string
  status: Shortage['status'] | Leak['status']
  label: string
  tone: Tone
  summary: string
  reports: number
  households?: number
  estimatedLitres?: number
  actualLitres?: number
  location?: string
}

export function linkedReports(state: State, id: string) {
  return state.reports.filter((report) => report.incidentId === id)
}

export function publicIncidents(state: State): PublicIncident[] {
  const shortages = state.shortages.map((incident): PublicIncident => {
    const delivery = state.tankers.find(
      (assignment) => assignment.incidentId === incident.id && assignment.status === 'published',
    )
    const details = {
      critical: {
        label: 'Critical shortage',
        tone: 'red',
        summary:
          delivery?.actualLitres === 0
            ? 'The last approved delivery record shows 0 L delivered. The community shortage remains open.'
            : incident.summary,
      },
      responding: {
        label: 'Response assigned',
        tone: 'amber',
        summary: 'A tanker has been assigned to the community. Regular water supply is still affected.',
      },
      'relief-delivered': {
        label: 'Water delivered',
        tone: 'amber',
        summary: `${formatLitres(delivery?.actualLitres ?? 0)} delivered at the community distribution point. Regular water supply is still affected.`,
      },
      restored: {
        label: 'Supply verified',
        tone: 'green',
        summary: 'The coordinator verified that regular water supply has recovered.',
      },
    } as const
    return {
      ...incident,
      ...details[incident.status],
      type: 'shortage',
      title: `${incident.town} water shortage`,
      reports: linkedReports(state, incident.id).filter((report) => report.status === 'verified').length,
      actualLitres: delivery?.actualLitres,
    }
  })
  const leaks = state.leaks.map((incident): PublicIncident => {
    const details = {
      verified: { label: 'Public leak', tone: 'blue', summary: incident.summary },
      assigned: {
        label: 'Crew assigned',
        tone: 'amber',
        summary: 'A maintenance crew has been assigned to this verified public leak.',
      },
      'in-progress': {
        label: 'Under maintenance',
        tone: 'amber',
        summary: 'The field crew is working on the verified public leak.',
      },
      'awaiting-verification': {
        label: 'Verification pending',
        tone: 'amber',
        summary: 'The crew submitted its repair for coordinator verification.',
      },
      repaired: {
        label: 'Repair verified',
        tone: 'green',
        summary: 'The coordinator verified the completed pipe repair at this location.',
      },
    } as const
    return {
      ...incident,
      ...details[incident.status],
      type: 'leak',
      title: `${incident.town} public leak`,
      reports: linkedReports(state, incident.id).filter((report) => report.status === 'verified').length,
    }
  })
  return [...shortages, ...leaks]
}

export function formatLitres(amount: number) {
  return `${new Intl.NumberFormat('en-GB').format(amount)} L`
}

export function availableWater(state: State) {
  return (
    WATER_AVAILABLE -
    state.tankers.reduce((sum, order) => sum + (order.actualLitres ?? order.approvedLitres), 0)
  )
}

export function vehicleAvailable(state: State, id: string) {
  return !state.tankers.some(
    (order) => order.vehicleId === id && !['delivered', 'published'].includes(order.status),
  )
}

export function crewAvailable(state: State, crew: string) {
  return !state.repairs.some(
    (order) => order.crew === crew && ['assigned', 'in-progress'].includes(order.status),
  )
}

export type Action =
  | { type: 'submitReport'; report: Omit<Report, 'source' | 'status' | 'createdAt' | 'incidentId'> }
  | { type: 'verifyReport'; reportId: string; estimatedLitres?: number }
  | {
      type: 'assignTanker'
      incidentId: string
      vehicleId: string
      approvedLitres: number
      destination: string
    }
  | { type: 'advanceTanker'; id: string; step: 'accepted' | 'en-route' | 'arrived' }
  | { type: 'recordProblem'; id: string; detail: string }
  | { type: 'recordDelivery'; id: string; actualLitres: number }
  | { type: 'publishDelivery'; id: string }
  | { type: 'verifyRestoration'; incidentId: string; evidence: string }
  | { type: 'assignCrew'; leakId: string; crew: string }
  | { type: 'startRepair'; id: string }
  | { type: 'inspectRepair'; id: string; inspection: string; evidence?: Evidence }
  | { type: 'submitRepair'; id: string; work: string; evidence?: Evidence }
  | { type: 'verifyRepair'; id: string; evidence: string }
  | { type: 'publishNotice'; town: string; text: string }
  | { type: 'dismissNotice' }

export type Notice = { message: string; error: boolean }
type Snapshot = { state: State; notice: Notice | null }

export function createReference(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

const fail = (state: State, message: string): Snapshot => ({ state, notice: { message, error: true } })

type EventMetadata = { at: string; suffix: string }

function eventMetadata(): EventMetadata {
  return { at: new Date().toISOString(), suffix: crypto.randomUUID().slice(0, 8).toUpperCase() }
}

function replace<T extends { id: string }>(items: T[], next: T) {
  return items.map((item) => (item.id === next.id ? next : item))
}

export function reduceNouDilo(
  snapshot: Snapshot,
  action: Action,
  { at, suffix } = eventMetadata(),
): Snapshot {
  const { state } = snapshot
  function log(
    next: State,
    subjectId: string,
    role: AuditEvent['role'],
    note: string,
    message = note,
  ): Snapshot {
    const event = { id: `AUD-${suffix}`, subjectId, role, note, at }
    return { state: { ...next, audit: [event, ...next.audit] }, notice: { message, error: false } }
  }
  switch (action.type) {
    case 'dismissNotice':
      return { state, notice: null }
    case 'submitReport': {
      const { report } = action
      if (state.reports.some((row) => row.id === report.id))
        return fail(state, 'This report was already submitted.')
      if (
        !TOWNS.includes(report.town) ||
        !report.condition.trim() ||
        (report.type === 'leak' && !report.location?.trim())
      ) {
        return fail(state, 'Complete the report details before submitting.')
      }
      if (
        report.type === 'shortage' &&
        (!report.duration ||
          !Number.isInteger(report.households) ||
          (report.households ?? 0) < 1 ||
          (report.households ?? 0) > 200)
      ) {
        return fail(state, 'Add the shortage duration and number of affected households.')
      }
      if (
        report.requestedLitres !== undefined &&
        (!Number.isInteger(report.requestedLitres) ||
          report.requestedLitres < 1 ||
          report.requestedLitres > 100_000)
      ) {
        return fail(state, 'Enter a valid estimate for the amount of water needed.')
      }
      const incident =
        report.type === 'shortage'
          ? state.shortages.find((item) => item.town === report.town && item.status !== 'restored')
          : undefined
      const nextReport: Report = {
        ...report,
        source: 'resident',
        status: incident ? 'linked' : 'received',
        incidentId: incident?.id,
        createdAt: at,
      }
      const message = incident
        ? `Report ${report.id} received and linked to ${incident.id} for review.`
        : `Report ${report.id} received for coordinator review.`
      return log({ ...state, reports: [nextReport, ...state.reports] }, report.id, 'Resident', message)
    }
    case 'verifyReport': {
      const report = state.reports.find((row) => row.id === action.reportId)
      if (!report || report.status === 'verified')
        return fail(state, 'This report is unavailable for verification.')
      let next = state
      let incidentId = report.incidentId
      if (report.type === 'shortage') {
        const incident = state.shortages.find(
          (item) => item.town === report.town && item.status !== 'restored',
        )
        if (incident) {
          incidentId = incident.id
        } else {
          const estimatedLitres = action.estimatedLitres ?? 0
          if (!Number.isInteger(estimatedLitres) || estimatedLitres < 1)
            return fail(state, 'Assess the community water need before verification.')
          incidentId = `INC-${suffix}`
          next = {
            ...next,
            shortages: [
              {
                id: incidentId,
                town: report.town,
                status: 'critical',
                priority: 'Critical',
                households: report.households ?? 1,
                estimatedLitres,
                summary: 'A community water shortage has been verified by the coordinator.',
              },
              ...state.shortages,
            ],
          }
        }
      } else {
        const location = report.location ?? ''
        const incident = state.leaks.find(
          (item) =>
            item.town === report.town &&
            item.status !== 'repaired' &&
            item.location.toLocaleLowerCase() === location.toLocaleLowerCase(),
        )
        if (incident) {
          incidentId = incident.id
        } else {
          incidentId = `LEAK-${suffix}`
          next = {
            ...next,
            leaks: [
              {
                id: incidentId,
                town: report.town,
                status: 'verified',
                location,
                priority: report.condition === 'Heavy flow' ? 'Critical' : 'High',
                summary: `A public water leak has been verified in ${report.town}.`,
              },
              ...state.leaks,
            ],
          }
        }
      }
      next = { ...next, reports: replace(state.reports, { ...report, status: 'verified', incidentId }) }
      return log(next, incidentId, 'Coordinator', `Verified report ${report.id} for ${report.town}.`)
    }
    case 'assignTanker': {
      const incident = state.shortages.find((row) => row.id === action.incidentId)
      const vehicle = FLEET.find((item) => item.id === action.vehicleId)
      if (!incident || incident.status !== 'critical')
        return fail(state, 'This shortage already has an active or completed response.')
      if (!vehicle || !vehicleAvailable(state, vehicle.id))
        return fail(state, 'Select an available tanker and driver.')
      if (
        !Number.isInteger(action.approvedLitres) ||
        action.approvedLitres < 1 ||
        action.approvedLitres > Math.min(vehicle.capacity, availableWater(state))
      ) {
        return fail(state, 'Enter a quantity within the tanker capacity and available water supply.')
      }
      if (!action.destination.trim()) return fail(state, 'Enter a distribution point.')
      const tanker: TankerAssignment = {
        id: `TANK-${suffix}`,
        incidentId: incident.id,
        vehicleId: vehicle.id,
        approvedLitres: action.approvedLitres,
        destination: action.destination.trim(),
        status: 'assigned',
        issues: [],
      }
      return log(
        {
          ...state,
          shortages: replace(state.shortages, { ...incident, status: 'responding' }),
          tankers: [tanker, ...state.tankers],
        },
        incident.id,
        'Coordinator',
        `Approved ${formatLitres(tanker.approvedLitres)} and assigned ${vehicle.id} to ${incident.town}.`,
      )
    }
    case 'advanceTanker': {
      const tanker = state.tankers.find((row) => row.id === action.id)
      const validFrom = { accepted: 'assigned', 'en-route': 'accepted', arrived: 'en-route' }
      if (!tanker || tanker.status !== validFrom[action.step])
        return fail(state, 'That driver action is unavailable at the current stage.')
      const event = {
        accepted: 'Driver accepted the assignment.',
        'en-route': 'Driver confirmed departure.',
        arrived: 'Driver confirmed arrival at the distribution point.',
      }
      return log(
        { ...state, tankers: replace(state.tankers, { ...tanker, status: action.step }) },
        tanker.incidentId,
        'Tanker driver',
        event[action.step],
      )
    }
    case 'recordProblem': {
      const tanker = state.tankers.find((row) => row.id === action.id)
      if (!tanker || ['delivered', 'published'].includes(tanker.status) || !action.detail.trim())
        return fail(state, 'Add an operational problem to an active assignment.')
      return log(
        {
          ...state,
          tankers: replace(state.tankers, { ...tanker, issues: [...tanker.issues, action.detail.trim()] }),
        },
        tanker.incidentId,
        'Tanker driver',
        `Operational problem: ${action.detail.trim()}`,
        'Operational problem logged for the coordinator.',
      )
    }
    case 'recordDelivery': {
      const tanker = state.tankers.find((row) => row.id === action.id)
      if (!tanker || tanker.status !== 'arrived')
        return fail(state, 'Confirm arrival before recording the delivery.')
      const capacity = FLEET.find((vehicle) => vehicle.id === tanker.vehicleId)?.capacity ?? 0
      if (
        !Number.isInteger(action.actualLitres) ||
        action.actualLitres < 0 ||
        action.actualLitres > Math.min(capacity, availableWater(state) + tanker.approvedLitres)
      ) {
        return fail(
          state,
          'Enter a valid actual quantity in litres within the vehicle capacity and available supply.',
        )
      }
      const next: TankerAssignment = {
        ...tanker,
        status: 'delivered',
        actualLitres: action.actualLitres,
        submittedAt: at,
      }
      return log(
        { ...state, tankers: replace(state.tankers, next) },
        tanker.incidentId,
        'Tanker driver',
        `Recorded ${formatLitres(action.actualLitres)} as the actual quantity delivered.`,
        'Actual quantity submitted for coordinator review.',
      )
    }
    case 'publishDelivery': {
      const tanker = state.tankers.find((row) => row.id === action.id)
      const incident = state.shortages.find((row) => row.id === tanker?.incidentId)
      if (!tanker || !incident || tanker.status !== 'delivered' || tanker.actualLitres === undefined)
        return fail(state, 'A driver delivery record is required.')
      return log(
        {
          ...state,
          tankers: replace(state.tankers, { ...tanker, status: 'published' }),
          shortages: replace(state.shortages, {
            ...incident,
            status: tanker.actualLitres > 0 ? 'relief-delivered' : 'critical',
          }),
        },
        incident.id,
        'Coordinator',
        `Published the actual delivery of ${formatLitres(tanker.actualLitres)}.`,
      )
    }
    case 'verifyRestoration': {
      const incident = state.shortages.find((row) => row.id === action.incidentId)
      if (
        !incident ||
        (incident.status !== 'critical' && incident.status !== 'relief-delivered') ||
        !action.evidence.trim()
      ) {
        return fail(
          state,
          'Resolve an active tanker response and enter independent evidence of regular supply recovery.',
        )
      }
      return log(
        { ...state, shortages: replace(state.shortages, { ...incident, status: 'restored' }) },
        incident.id,
        'Coordinator',
        `Regular supply independently verified. ${action.evidence.trim()}`,
        'Regular supply verified and published.',
      )
    }
    case 'assignCrew': {
      const leak = state.leaks.find((row) => row.id === action.leakId)
      if (leak?.status !== 'verified' || !CREWS.includes(action.crew) || !crewAvailable(state, action.crew))
        return fail(state, 'Choose an available crew for a verified leak.')
      const repair: RepairOrder = {
        id: `WORK-${suffix}`,
        leakId: leak.id,
        crew: action.crew,
        status: 'assigned',
      }
      return log(
        {
          ...state,
          leaks: replace(state.leaks, { ...leak, status: 'assigned' }),
          repairs: [repair, ...state.repairs],
        },
        leak.id,
        'Coordinator',
        `Assigned the ${action.crew.toLowerCase()}.`,
      )
    }
    case 'startRepair': {
      const repair = state.repairs.find((row) => row.id === action.id)
      const leak = state.leaks.find((row) => row.id === repair?.leakId)
      if (!repair || !leak || repair.status !== 'assigned')
        return fail(state, 'This repair is unavailable to start.')
      return log(
        {
          ...state,
          repairs: replace(state.repairs, { ...repair, status: 'in-progress' }),
          leaks: replace(state.leaks, { ...leak, status: 'in-progress' }),
        },
        leak.id,
        'Maintenance crew',
        'Started maintenance at the reported location.',
      )
    }
    case 'inspectRepair': {
      const repair = state.repairs.find((row) => row.id === action.id)
      if (!repair || repair.status !== 'in-progress' || !action.inspection.trim())
        return fail(state, 'Enter an inspection finding for an active repair.')
      return log(
        {
          ...state,
          repairs: replace(state.repairs, {
            ...repair,
            inspection: action.inspection.trim(),
            evidence: action.evidence ?? repair.evidence,
          }),
        },
        repair.leakId,
        'Maintenance crew',
        `Inspection: ${action.inspection.trim()}`,
        'Inspection recorded.',
      )
    }
    case 'submitRepair': {
      const repair = state.repairs.find((row) => row.id === action.id)
      const leak = state.leaks.find((row) => row.id === repair?.leakId)
      if (!repair || !leak || repair.status !== 'in-progress' || !repair.inspection || !action.work.trim())
        return fail(state, 'Record an inspection and describe the work before submitting a completed repair.')
      return log(
        {
          ...state,
          leaks: replace(state.leaks, { ...leak, status: 'awaiting-verification' }),
          repairs: replace(state.repairs, {
            ...repair,
            status: 'submitted',
            work: action.work.trim(),
            evidence: action.evidence ?? repair.evidence,
          }),
        },
        leak.id,
        'Maintenance crew',
        `Submitted repair work: ${action.work.trim()}`,
        'Repair submitted for coordinator verification.',
      )
    }
    case 'verifyRepair': {
      const repair = state.repairs.find((row) => row.id === action.id)
      const leak = state.leaks.find((row) => row.id === repair?.leakId)
      if (!repair || !leak || repair.status !== 'submitted' || !action.evidence.trim())
        return fail(state, 'Review the submitted repair and enter a verification finding.')
      return log(
        {
          ...state,
          repairs: replace(state.repairs, { ...repair, status: 'verified' }),
          leaks: replace(state.leaks, { ...leak, status: 'repaired' }),
        },
        leak.id,
        'Coordinator',
        `Verified the completed repair. ${action.evidence.trim()}`,
        'Repair verified and published on the Mauritius map.',
      )
    }
    case 'publishNotice': {
      if (!TOWNS.includes(action.town) || !action.text.trim())
        return fail(state, 'Select a locality and enter the verified public update.')
      if (!publicIncidents(state).some((item) => item.town === action.town))
        return fail(state, 'Select a locality with a verified incident before publishing a notice.')
      const notice = { id: `NOTICE-${suffix}`, town: action.town, text: action.text.trim(), at }
      return log(
        { ...state, notices: [notice, ...state.notices] },
        notice.id,
        'Coordinator',
        `Published a verified update for ${notice.town}.`,
      )
    }
  }
}

export type NouDiloStore = Snapshot & {
  dispatch: (action: Action) => void
  clearNotice: () => void
  resources?: readonly string[]
}
