import { Component, Suspense, lazy, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { canRenderWebGL } from './geo'
import './stage.css'

export type StageVisual = 'tap' | 'tanker' | 'pipe'
const Scene = lazy(() => import('./Scenes').then(({ OperationsScene }) => ({ default: OperationsScene })))

class StageBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function Stage({ visual, phase, strength, focus = 0, title, status, children, className = '' }: {
  visual: StageVisual
  phase: number
  strength?: number
  focus?: number
  title: string
  status: string
  children?: ReactNode
  className?: string
}) {
  const [angle, setAngle] = useState(0)
  const gesture = useRef<number | null>(null)
  const supports3d = canRenderWebGL()
  const loading = <div className="stage-loading"><span />Preparing the scene</div>
  const unavailable = <div className="stage-loading">The 3D illustration is unavailable</div>
  return (
    <figure className={`operation-stage ${className}`} data-visual={visual} data-phase={phase}>
      <div className="stage-frame" onPointerDown={event => {
        if (!supports3d || event.button !== 0 || (event.target as HTMLElement).closest('button, a, input')) return
        gesture.current = event.clientX
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerUp={event => {
        if (gesture.current === null) return
        const distance = event.clientX - gesture.current
        gesture.current = null
        if (Math.abs(distance) > 12) setAngle(current => current + distance * .012)
      }} onPointerCancel={() => { gesture.current = null }}>
        <span className="stage-title">{title}</span>
        <StageBoundary key={visual} fallback={unavailable}>
          <Suspense fallback={loading}><Scene key={visual} visual={visual} phase={phase} strength={strength} angle={angle + focus} /></Suspense>
        </StageBoundary>
        {supports3d && <div className="stage-turn" role="group" aria-label="Scene angle">
          <button type="button" aria-label="Rotate scene left" onClick={() => setAngle(current => current - .55)}><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Rotate scene right" onClick={() => setAngle(current => current + .55)}><ChevronRight size={18} /></button>
        </div>}
      </div>
      <figcaption aria-live="polite"><strong>{status}</strong>{children && <p>{children}</p>}</figcaption>
    </figure>
  )
}
