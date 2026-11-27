import { useEffect, useRef, type ReactNode } from 'react'
import { Eye } from 'lucide-react'
import { TOWNS } from './model'
import { useWorld, type CameraDestination, type WorldCue } from './world/state'

export type StageVisual = 'tap' | 'tanker' | 'pipe'

/** Task context for the single persistent renderer. This component never creates a canvas. */
export function Stage({ visual, phase, strength, title, status, children, className = '', town, duration, condition, destination, depotTown, depotLabel }: {
  visual: StageVisual; phase: number; strength?: number; focus?: number; title: string; status: string; children?: ReactNode; className?: string; town?: string; duration?: string; condition?: string; destination?: CameraDestination; depotTown?: string; depotLabel?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const focus = (force = false) => {
    const localTown = town ?? TOWNS.find(name => title.includes(name)) ?? useWorld.getState().town
    const declined = status.toLowerCase().includes('declined')
    const cue: WorldCue = {
      kind: declined ? 'shortage' : visual === 'tap' ? 'shortage' : visual === 'pipe' ? 'leak' : 'tanker', town: localTown, phase, duration,
      condition: condition ?? (visual === 'tap' ? status.includes('Low pressure') || phase === .28 ? 'Low pressure' : status.includes('No running water') ? 'No running water' : undefined : strength === 1 ? 'Heavy flow' : strength === .62 ? 'Continuous flow' : undefined),
      label: status,
      ...(depotTown ? { depotTown, depotLabel } : {}),
      destination: destination ?? (declined ? 'ResidentVillage' : visual === 'tap' ? 'WaterShortageScene' : visual === 'pipe' ? phase > 0 ? 'RepairLocation' : 'PublicLeakScene' : phase === 0 ? 'TankerDepot' : phase >= .88 ? 'DeliveryLocation' : 'TankerRoute'),
    }
    useWorld.getState().focus(cue)
    if (force) useWorld.setState(s => ({ cameraRequest: s.cameraRequest + 1, explore: false }))
  }
  useEffect(() => {
    const dialog = document.querySelector('dialog[open]')
    if (dialog && !ref.current?.closest('dialog')) return
    focus()
  }, [visual, phase, strength, title, status, town, duration, condition, destination, depotTown, depotLabel])
  return <figure ref={ref} className={`world-cue ${className}`} data-visual={visual} data-phase={phase}>
    <figcaption><span className="world-cue-label"><Eye size={16} /> {title}</span><strong>{status}</strong>{children && <p>{children}</p>}</figcaption>

  </figure>
}
