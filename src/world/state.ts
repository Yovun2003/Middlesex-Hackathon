import { create } from 'zustand'
import { fleetFor, TOWNS, type Action, type State } from '../model'

export const cameraDestinations = ['IslandOverview', 'ResidentVillage', 'ResidentHouse', 'WaterShortageScene', 'PublicLeakScene', 'CoordinatorOverview', 'TankerDepot', 'TankerRoute', 'DeliveryLocation', 'RepairLocation'] as const
export type CameraDestination = typeof cameraDestinations[number]
export type WorldKind = 'overview' | 'shortage' | 'leak' | 'tanker'
export type WorldCue = { kind: WorldKind; town?: string; phase?: number; condition?: string; duration?: string; label?: string; destination?: CameraDestination; incidentId?: string; depotTown?: string; depotLabel?: string }
type WorldState = {
  destination: CameraDestination; town: string; kind: WorldKind; phase: number; condition: string; duration: string; label: string; incidentId?: string
  depotTown: string; depotLabel: string
  cameraRequest: number; skipRequest: number; transitioning: boolean; paused: boolean; quality: 'high' | 'low'; mode: '3d' | '2d'; explore: boolean
  navigation: { action: string; request: number }
  signal?: { id: string; grouped: boolean; town: string }; playback: number; showRoute: boolean; mounted: boolean; graphicsFailed: boolean
  focus: (cue: WorldCue) => void; overview: (coordinator?: boolean) => void
  setTown: (town: string) => void; setMode: (mode: '3d' | '2d') => void; setQuality: (quality: 'high' | 'low') => void
  setPaused: (paused: boolean) => void; setExplore: (explore: boolean) => void; skip: () => void; replay: () => void
  nudge: (action: string) => void
}
export const useWorld = create<WorldState>((set, get) => ({
  destination: 'ResidentVillage', town: 'Curepipe', kind: 'overview', phase: 0, condition: '', duration: '', label: 'Your neighbourhood · connected water response',
  depotTown: 'Curepipe', depotLabel: 'Curepipe depot',
  cameraRequest: 0, skipRequest: 0, transitioning: false, paused: false, quality: typeof window !== 'undefined' && (window.innerWidth < 700 || navigator.hardwareConcurrency <= 4) ? 'low' : 'high', mode: '3d', explore: false, playback: 0, showRoute: false, mounted: false, graphicsFailed: false,
  navigation: { action: '', request: 0 },
  focus: cue => {
    const destination = cue.destination ?? (cue.kind === 'leak' ? 'PublicLeakScene' : cue.kind === 'tanker' ? 'TankerRoute' : cue.kind === 'shortage' ? 'WaterShortageScene' : 'IslandOverview')
    const changed = destination !== get().destination || (cue.town && cue.town !== get().town)
    set({ ...cue, town: cue.town || get().town, phase: cue.phase ?? get().phase, condition: cue.condition ?? get().condition, duration: cue.duration ?? get().duration, label: cue.label ?? get().label, destination, cameraRequest: get().cameraRequest + (changed ? 1 : 0), explore: changed ? false : get().explore })
  },
  overview: coordinator => set({ destination: coordinator ? 'CoordinatorOverview' : 'IslandOverview', kind: 'overview', label: coordinator ? 'Water response command centre' : 'Mauritius water situation', cameraRequest: get().cameraRequest + 1, explore: false, incidentId: undefined }),
  setTown: town => { set({ town, incidentId: undefined }); if (get().kind !== 'overview') set({ cameraRequest: get().cameraRequest + 1 }) },
  setMode: mode => set({ mode }), setQuality: quality => set({ quality }), setPaused: paused => set({ paused }), setExplore: explore => set({ explore }),
  nudge: action => set({ navigation: { action, request: get().navigation.request + 1 }, explore: true }),
  skip: () => set({ skipRequest: get().skipRequest + 1 }),
  replay: () => set({ playback: get().playback + 1, showRoute: true, paused: false }),
}))

export const tankerPhase = { assigned: 0, accepted: 0, 'en-route': .48, arrived: .92, delivered: 1, published: 1, declined: 0 } as const
export const repairPhase = { verified: 0, assigned: .15, 'in-progress': .45, 'awaiting-verification': .8, repaired: 1 } as const

export function focusIncident(state: State, id: string) {
  const shortage = state.shortages.find(i => i.id === id)
  const leak = state.leaks.find(i => i.id === id)
  if (shortage) {
    const assignment = state.tankers.find(a => a.incidentId === id && a.status !== 'declined')
    const vehicle = fleetFor(state).find(v => v.id === assignment?.vehicleId)
    const depotTown = TOWNS.find(t => vehicle?.name.includes(t)) ?? shortage.town
    useWorld.setState({ depotTown, depotLabel: vehicle?.name ?? 'Illustrative dispatch depot' })
    useWorld.getState().focus({ kind: assignment ? 'tanker' : 'shortage', town: shortage.town, incidentId: id, phase: assignment ? tankerPhase[assignment.status] : 0, condition: shortage.status === 'restored' ? 'Supply restored' : 'No running water', label: shortage.status === 'restored' ? 'Regular supply verified' : assignment ? `Recorded assignment: ${assignment.status}` : 'Verified community shortage', destination: shortage.status === 'restored' ? 'WaterShortageScene' : assignment ? assignment.status === 'assigned' || assignment.status === 'accepted' ? 'TankerDepot' : assignment.status === 'arrived' || assignment.status === 'delivered' || assignment.status === 'published' ? 'DeliveryLocation' : 'TankerRoute' : 'ResidentVillage' })
  } else if (leak) useWorld.getState().focus({ kind: 'leak', town: leak.town, incidentId: id, phase: repairPhase[leak.status], condition: leak.waterRestoredAt ? 'Supply restored' : 'Heavy flow', label: leak.status === 'repaired' ? 'Repair independently verified' : leak.status === 'awaiting-verification' ? 'Repair submitted; verification pending' : 'Recorded leak response', destination: leak.waterRestoredAt ? 'WaterShortageScene' : leak.status === 'verified' ? 'PublicLeakScene' : 'RepairLocation' })
}

export function acknowledgeWorldAction(action: Action, state: State) {
  if (action.type === 'submitReport') {
    const report = state.reports.find(r => r.id === action.report.id)
    if (!report) return
    useWorld.getState().focus({ kind: report.type, town: report.town, condition: report.condition, duration: report.duration, phase: 0, label: `Report received · ${report.id}`, destination: report.type === 'shortage' ? 'ResidentVillage' : 'PublicLeakScene' })
    useWorld.setState({ signal: { id: report.id, grouped: !!report.incidentId, town: report.town } })
    return
  }
  let incidentId: string | undefined
  if ('incidentId' in action) incidentId = action.incidentId
  else if ('leakId' in action) incidentId = action.leakId
  else if ('reportId' in action) incidentId = state.reports.find(r => r.id === action.reportId)?.incidentId
  else if ('id' in action) incidentId = state.tankers.find(a => a.id === action.id)?.incidentId ?? state.repairs.find(a => a.id === action.id)?.leakId
  if (incidentId) focusIncident(state, incidentId)
}
