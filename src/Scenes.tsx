import { Canvas, useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { CircleDot, MapPin } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Group, InstancedMesh, Object3D, Vector3 } from 'three'
import { RenderBoundary } from './Island'
import type { StageVisual } from './Stage'
import { canRenderWebGL, islandBounds, prefersReducedMotion, tankRoute, terrainPosition } from './geo'
import './visuals.css'

const path = new CatmullRomCurve3(tankRoute.map(coordinate => {
  const [x, z] = terrainPosition(coordinate)
  return new Vector3((x + 0.93) * 6.4, 0.015, (z - 0.48) * 5.9)
}))
const journeyLength = path.getLength()

function Road() {
  const ribbon = useMemo(() => {
    const vertices: number[] = []
    const faces: number[] = []
    const samples = 96
    for (let index = 0; index <= samples; index++) {
      const sample = index / samples
      const p = path.getPointAt(sample)
      const t = path.getTangentAt(sample)
      const edge = 0.49
      vertices.push(p.x - t.z * edge, p.y, p.z + t.x * edge, p.x + t.z * edge, p.y, p.z - t.x * edge)
      if (index > 0) {
        const a = (index - 1) * 2
        faces.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
    geometry.setIndex(faces)
    geometry.computeVertexNormals()
    return geometry
  }, [])
  useEffect(() => () => ribbon.dispose(), [ribbon])
  return <group>
    <mesh geometry={ribbon}><meshStandardMaterial color="#435454" side={2} roughness={0.95} /></mesh>
    {Array.from({length: 23}, (_, index) => {
      const ratio = (index + 0.5) / 23
      const point = path.getPointAt(ratio)
      const direction = path.getTangentAt(ratio)
      return <mesh key={index} position={[point.x, 0.027, point.z]} rotation={[0, Math.atan2(direction.x, direction.z), 0]}>
        <boxGeometry args={[0.035, 0.014, 0.21]} /><meshStandardMaterial color="#8ee5cf" />
      </mesh>
    })}
  </group>
}

function Wheel({ x, z, progress }: { x: number; z: number; progress: number }) {
  return <group position={[x, 0.16, z]} rotation={[progress * journeyLength / -0.16, 0, 0]}>
    <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.158, 0.158, 0.09, 16]} /><meshStandardMaterial color="#152c32" /></mesh>
    <mesh position={[Math.sign(x) * 0.052, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.072, 0.072, 0.012, 10]} /><meshStandardMaterial color="#a6b9bb" metalness={0.35} roughness={0.5} /></mesh>
  </group>
}

function Tanker({ progress }: { progress: number }) {
  const spot = path.getPointAt(progress)
  const direction = path.getTangentAt(progress)
  return <group position={spot} rotation={[0, Math.atan2(direction.x, direction.z), 0]}>
    <mesh position={[0, 0.27, 0]}><boxGeometry args={[0.53, 0.21, 1.36]} /><meshStandardMaterial color="#314a4c" /></mesh>
    <mesh position={[0, 0.51, 0.47]}><boxGeometry args={[0.54, 0.47, 0.45]} /><meshStandardMaterial color="#e6f4eb" /></mesh>
    <mesh position={[0, 0.585, 0.703]}><boxGeometry args={[0.43, 0.19, 0.025]} /><meshStandardMaterial color="#2c5660" metalness={0.25} roughness={0.3} /></mesh>
    <mesh position={[0, 0.39, 0.695]}><boxGeometry args={[0.51, 0.065, 0.08]} /><meshStandardMaterial color="#2c6864" /></mesh>
    <mesh position={[0, 0.53, -0.174]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.23, 0.23, 0.85, 20]} /><meshStandardMaterial color="#b6d9db" metalness={0.38} roughness={0.35} />
    </mesh>
    {[-0.46, 0.11].map(z => <mesh key={z} position={[0, 0.53, z]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.236, 0.236, 0.035, 20]} /><meshStandardMaterial color="#317c82" metalness={0.3} roughness={0.45} />
    </mesh>)}
    {[-0.255, 0.255].flatMap(x => [-0.45, 0.45].map(z => <Wheel key={`${x}/${z}`} x={x} z={z} progress={progress} />))}
  </group>
}

function House({ x, y = 0, z, colour = '#d7cdb8' }: { x: number; y?: number; z: number; colour?: string }) {
  return <group position={[x, y, z]}>
    <mesh position={[0, 0.29, 0]}><boxGeometry args={[0.72, 0.57, 0.61]} /><meshStandardMaterial color={colour} /></mesh>
    <mesh position={[0, 0.63, 0]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[0.55, 0.24, 4]} /><meshStandardMaterial color="#9a684e" roughness={0.92} />
    </mesh>
    <mesh position={[-0.15, 0.24, 0.311]}><boxGeometry args={[0.125, 0.3, 0.025]} /><meshStandardMaterial color="#3a625e" /></mesh>
    <mesh position={[0.15, 0.35, 0.312]}><boxGeometry args={[0.14, 0.15, 0.025]} /><meshStandardMaterial color="#70969b" /></mesh>
  </group>
}

function Trees({ positions }: { positions: [number, number, number][] }) {
  const trunk = useRef<InstancedMesh>(null)
  const canopy = useRef<InstancedMesh>(null)
  useEffect(() => {
    const transform = new Object3D()
    positions.forEach(([x, y, z], index) => {
      const height = 0.7 + (index % 5) * 0.09
      transform.position.set(x, y + 0.16, z)
      transform.scale.set(1, height, 1)
      transform.updateMatrix()
      trunk.current?.setMatrixAt(index, transform.matrix)
      transform.position.set(x, y + 0.43, z)
      transform.scale.set(height, height, height)
      transform.updateMatrix()
      canopy.current?.setMatrixAt(index, transform.matrix)
    })
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true
    if (canopy.current) canopy.current.instanceMatrix.needsUpdate = true
  }, [positions])
  return <>
    <instancedMesh ref={trunk} args={[undefined, undefined, positions.length]}><cylinderGeometry args={[0.035, 0.055, 0.4, 7]} /><meshStandardMaterial color="#795b45" /></instancedMesh>
    <instancedMesh ref={canopy} args={[undefined, undefined, positions.length]}><icosahedronGeometry args={[0.32, 1]} /><meshStandardMaterial color="#547e56" roughness={1} /></instancedMesh>
  </>
}

const routeTrees: [number, number, number][] = [
  [-3.1, 0, -4.4], [-2.6, 0, -4.5], [-2.0, 0, -4.45], [0.25, 0, -5.4],
  [2.4, 0, -5.35], [2.7, 0, -5.55], [3.25, 0, -5.6], [3.2, 0, -2.7],
  [-3.0, 0, -0.9], [-2.6, 0, 0.35], [-3.2, 0, 1.7], [2.8, 0, 1.5],
  [3.05, 0, 1.35], [3.35, 0, 2.3], [-3.1, 0, 3.3], [-2.4, 0, 3.8],
]

function RouteWorld({ progress }: { progress: number }) {
  const start = path.getPointAt(0)
  const end = path.getPointAt(1)
  return <>
    <hemisphereLight intensity={2.1} color="#e1f3eb" groundColor="#677442" />
    <directionalLight intensity={2.3} position={[-8, 13, 6]} color="#fff3d5" />
    <mesh position={[0, -0.32, -0.94]}>
      <boxGeometry args={[8.2, 0.62, 12.25]} /><meshStandardMaterial color="#638865" roughness={0.95} />
    </mesh>
    <mesh position={[0, -0.66, -0.94]}>
      <boxGeometry args={[8.2, 0.25, 12.25]} /><meshStandardMaterial color="#43564a" />
    </mesh>
    {Array.from({length: 10}, (_, index) => <mesh key={index} position={[-3.12 + (index % 2) * 5.8, 0.003, -4.75 + Math.floor(index / 2)*1.96]} rotation={[0, .07, 0]}>
      <boxGeometry args={[1.35, 0.012, 1.64]} /><meshStandardMaterial color={index % 3 === 0 ? '#859864' : '#729765'} />
    </mesh>)}
    <Road />
    <Trees positions={routeTrees} />
    <House x={start.x + 1.15} z={start.z + 0.3} />
    <House x={start.x + 2.1} z={start.z - 0.2} colour="#e1dac3" />
    <House x={end.x + 1.25} z={end.z + 0.1} colour="#dfe3cd" />
    <House x={end.x + 1.94} z={end.z - 0.72} />
    <mesh position={[end.x, 0.047, end.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.34, 0.46, 32]} /><meshBasicMaterial color="#d8ffda" />
    </mesh>
    <Tanker progress={progress} />
  </>
}

function RouteAlternative({ progress }: { progress: number }) {
  const drawing = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = drawing.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const { width, height } = canvas
    const routePixels = tankRoute.map(([longitude, latitude]) => [
      (longitude - islandBounds.west) / (islandBounds.east - islandBounds.west) * width,
      (islandBounds.north - latitude) / (islandBounds.north - islandBounds.south) * height,
    ])
    context.clearRect(0, 0, width, height)
    context.beginPath()
    routePixels.forEach(([x, y], index) => { if (index === 0) context.moveTo(x, y); else context.lineTo(x, y) })
    context.lineWidth = 3
    context.strokeStyle = '#0d3838'
    context.stroke()
    context.lineWidth = 1.6
    context.strokeStyle = '#e5ffea'
    context.stroke()
    const segment = progress * (routePixels.length - 1)
    const index = Math.min(Math.floor(segment), routePixels.length - 2)
    const fraction = segment - index
    const [x, y] = routePixels[index]
    const [nextX, nextY] = routePixels[index + 1]
    const [start, end] = [routePixels[0], routePixels[routePixels.length - 1]]
    for (const [pointX, pointY, radius, colour] of [
      [start[0], start[1], 3, '#8dc8e6'],
      [end[0], end[1], 3, '#80e0af'],
      [x + (nextX - x) * fraction, y + (nextY - y) * fraction, 4.5, '#fff4b2'],
    ] as const) {
      context.beginPath()
      context.arc(pointX, pointY, radius, 0, Math.PI * 2)
      context.fillStyle = colour
      context.fill()
      context.strokeStyle = '#183a37'
      context.lineWidth = 1
      context.stroke()
    }
  }, [progress])
  return <div className="route-alternative">
    <canvas ref={drawing} className="route-relief" width={260} height={303} aria-hidden="true" />
    <span><CircleDot size={19} /> Sample dispatch depot</span>
    <span><MapPin size={19} /> Distribution point</span>
  </div>
}

function useSceneCanvas() {
  const viewRef = useRef<HTMLDivElement>(null)
  const [show3d, setShow3d] = useState(canRenderWebGL)
  const [visible, setVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)
  const [graphicsFailed, setGraphicsFailed] = useState(false)
  const fail = () => { setShow3d(false); setGraphicsFailed(true) }
  useEffect(() => {
    const node = viewRef.current
    if (!node) return
    node.addEventListener('webglcontextlost', fail, true)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(node)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReducedMotion(motion.matches)
    motion.addEventListener('change', updateMotion)
    return () => {
      node.removeEventListener('webglcontextlost', fail, true)
      observer.disconnect()
      motion.removeEventListener('change', updateMotion)
    }
  }, [])
  return { viewRef, show3d, setShow3d, visible, reducedMotion, graphicsFailed, fail }
}

function PipeSection({ x, length, sealed = false }: { x: number; length: number; sealed?: boolean }) {
  const radius = sealed ? 0.29 : 0.22
  return <group position={[x, -0.23, 1.18]} rotation={[0, 0, Math.PI / 2]}>
    <mesh><cylinderGeometry args={[radius, radius, length, 22, 1, !sealed]} /><meshStandardMaterial color={sealed ? '#b7cfcd' : '#639da0'} metalness={0.35} roughness={0.4} side={2} /></mesh>
    {[-1, 1].map(side => <mesh key={side} position={[0, side * length * 0.49, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.034, 8, 22]} /><meshStandardMaterial color={sealed ? '#3d6666' : '#b2cecb'} metalness={0.4} />
    </mesh>)}
  </group>
}

function EscapingWater({ reducedMotion, isolated, strength }: { reducedMotion: boolean; isolated: boolean; strength: number }) {
  const drops = useRef<InstancedMesh>(null)
  const particle = useMemo(() => new Object3D(), [])

  const draw = (time: number) => {
    const mesh = drops.current
    if (!mesh) return
    for (let index = 0; index < mesh.count; index++) {
      const t = (time * (1.35 + (index % 3) * 0.16) + index * 0.139) % 1
      const spread = (index % 7 - 3) * 0.055
      particle.position.set(spread * (0.5 + 3 * t), -0.24 + (isolated ? 0.35 : 1.26 * strength) * Math.sin(t * Math.PI), 1.18 + t * (isolated ? 0.44 : 1.1))
      particle.scale.setScalar(1 - 0.5 * t)
      particle.updateMatrix()
      mesh.setMatrixAt(index, particle.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  useEffect(() => { draw(0.15) })
  useFrame(({ clock }) => { if (!reducedMotion) draw(clock.getElapsedTime()) })
  return <instancedMesh ref={drops} args={[undefined, undefined, isolated ? 16 : Math.round(14 + 38 * strength)]} frustumCulled={false}>
    <sphereGeometry args={[0.055, 7, 6]} /><meshStandardMaterial color="#82d9eb" transparent opacity={0.85} metalness={0.25} roughness={0.3} />
  </instancedMesh>
}

function Worker({ x, z }: { x: number; z: number }) {
  return <group position={[x, -0.8, z]}>
    <mesh position={[0, 0.37, 0]}><capsuleGeometry args={[0.12, 0.27, 4, 9]} /><meshStandardMaterial color="#e8b567" /></mesh>
    <mesh position={[0, 0.65, 0]}><sphereGeometry args={[0.092, 12, 9]} /><meshStandardMaterial color="#765343" /></mesh>
    <mesh position={[0, 0.71, 0]}><sphereGeometry args={[0.105, 12, 9, 0, Math.PI * 2, 0, Math.PI/2]} /><meshStandardMaterial color="#ebc159" /></mesh>
    {[-0.07, 0.07].map(offset => <mesh key={offset} position={[offset, 0.13, 0]}><cylinderGeometry args={[0.045, 0.045, 0.26, 7]} /><meshStandardMaterial color="#35484a" /></mesh>)}
  </group>
}

const repairTrees: [number, number, number][] = [[-3.3, 0.58, -1.85], [-2.8, 0.58, -1.85], [3.25, 0.58, -1.85], [2.65, 0.58, -1.84]]

function CutawayWorld({ stage, reducedMotion, strength = 1 }: { stage: number; reducedMotion: boolean; strength?: number }) {
  return <>
    <hemisphereLight intensity={2.3} color="#e7fcf1" groundColor="#665448" />
    <directionalLight intensity={2.3} position={[-5, 10, 7]} color="#fff0cf" />
    <mesh position={[0, -1.12, 0]}><boxGeometry args={[8.2, 0.62, 4.9]} /><meshStandardMaterial color="#947766" roughness={1} /></mesh>
    <mesh position={[0, -0.35, -0.96]}><boxGeometry args={[8.2, 0.96, 2.98]} /><meshStandardMaterial color="#80634f" roughness={1} /></mesh>
    <mesh position={[0, 0.25, -0.96]}><boxGeometry args={[8.2, 0.23, 2.98]} /><meshStandardMaterial color="#ae8f71" roughness={1} /></mesh>
    <mesh position={[0, 0.43, -1.74]}><boxGeometry args={[8.2, 0.28, 1.42]} /><meshStandardMaterial color="#71856a" roughness={1} /></mesh>
    <mesh position={[0, 0.43, -0.19]}><boxGeometry args={[8.2, 0.15, 1.4]} /><meshStandardMaterial color="#4a5857" roughness={0.9} /></mesh>
    {Array.from({length: 10}, (_, index) => <mesh key={index} position={[-3.7 + index * 0.82, 0.509, -0.16]}>
      <boxGeometry args={[0.35, 0.006, 0.035]} /><meshStandardMaterial color="#d7dbbc" />
    </mesh>)}
    <Trees positions={repairTrees} />
    <House x={-2.1} y={0.58} z={-1.72} />
    <House x={1.94} y={0.58} z={-1.7} colour="#cad6c6" />
    <PipeSection x={-2.03} length={3.6} />
    <PipeSection x={2.03} length={3.6} />
    {stage >= 4 ? <PipeSection x={0} length={0.71} sealed /> : <EscapingWater reducedMotion={reducedMotion} isolated={stage === 3} strength={strength} />}
    {stage >= 2 && stage < 6 && <>
      <Worker x={0.8} z={1.83} /><Worker x={-0.9} z={1.71} />
      <mesh position={[1.52, -0.63, 1.72]}><boxGeometry args={[0.43, 0.27, 0.34]} /><meshStandardMaterial color="#c79e6d" /></mesh>
    </>}
  </>
}

function TapWorld({ flow }: { flow: number }) {
  return <>
    <hemisphereLight intensity={2.2} color="#fff4d6" groundColor="#699786" />
    <directionalLight intensity={2.4} position={[-4, 7, 5]} color="#fff6e0" />
    <mesh position={[0, -.38, 0]}><boxGeometry args={[5.7, .62, 4.12]} /><meshStandardMaterial color="#977149" /></mesh>
    <mesh position={[0, -.065, 0]}><boxGeometry args={[5.7, .08, 4.12]} /><meshStandardMaterial color="#8caf70" /></mesh>
    <mesh position={[-.14, -.015, .84]}><boxGeometry args={[3.7, .08, 2.3]} /><meshStandardMaterial color="#d9c39c" /></mesh>
    <group position={[-.85, 0, -1.12]} scale={1.8}><House x={0} z={0} colour="#eed4aa" /></group>
    <group position={[1.2, 0, -1.23]} scale={1.35}><House x={0} z={0} colour="#cbdbb0" /></group>
    <Trees positions={tapTrees} />
    <mesh position={[-.35, .72, .43]}><cylinderGeometry args={[.084, .084, 1.42, 18]} /><meshStandardMaterial color="#477c78" metalness={.4} roughness={.45} /></mesh>
    <mesh position={[-.35, 1.39, .68]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.084, .084, .55, 18]} /><meshStandardMaterial color="#477c78" metalness={.4} roughness={.45} /></mesh>
    <mesh position={[-.35, 1.3, .94]}><cylinderGeometry args={[.084, .1, .2, 18]} /><meshStandardMaterial color="#477c78" metalness={.4} roughness={.45} /></mesh>
    <mesh position={[-.35, 1.53, .43]}><boxGeometry args={[.44, .09, .11]} /><meshStandardMaterial color="#c4613a" /></mesh>
    <mesh position={[-.35, .18, .99]}><cylinderGeometry args={[.35, .26, .34, 24, 1, true]} /><meshStandardMaterial color="#c37340" side={2} /></mesh>
    <mesh position={[-.35, .028, .99]}><cylinderGeometry args={[.26, .26, .04, 24]} /><meshStandardMaterial color="#b45b38" /></mesh>
    {flow > 0 && <>
      <mesh position={[-.35, .71, .94]}><cylinderGeometry args={[.015 + .025 * flow, .025 + .026 * flow, 1.02, 12]} /><meshStandardMaterial color="#42c1c5" emissive="#127778" emissiveIntensity={.25} /></mesh>
      <mesh position={[-.35, .27, .99]}><cylinderGeometry args={[.31, .31, .03, 24]} /><meshStandardMaterial color="#46b9b8" /></mesh>
    </>}
  </>
}

const tapTrees: [number, number, number][] = [[-2.24, 0, -.6], [2.28, 0, -.8], [2.2, 0, .3], [-2.48, 0, .83]]

function SceneTurn({ angle, reducedMotion, children }: { angle: number; reducedMotion: boolean; children: ReactNode }) {
  const group = useRef<Group>(null)
  const invalidate = useThree(state => state.invalidate)
  const initialAngle = useRef(angle)
  useEffect(() => {
    if (!group.current) return
    if (reducedMotion) {
      group.current.rotation.y = angle
      invalidate()
      return
    }
    const tween = gsap.to(group.current.rotation, { y: angle, duration: .42, ease: 'power2.out', onUpdate: invalidate })
    return () => { tween.kill() }
  }, [invalidate, reducedMotion, angle])
  return <group ref={group} rotation={[0, initialAngle.current, 0]}>{children}</group>
}

function Painted({ onPaint }: { onPaint: () => void }) {
  const scheduled = useRef<number | undefined>(undefined)
  useFrame(() => {
    if (scheduled.current === undefined) scheduled.current = requestAnimationFrame(onPaint)
  })
  useEffect(() => () => {
    if (scheduled.current !== undefined) cancelAnimationFrame(scheduled.current)
    scheduled.current = undefined
  }, [])
  return null
}

function StageFallback({ visual, phase }: { visual: StageVisual; phase: number }) {
  return <div className={`stage-fallback${phase > 0 ? ' stage-fallback--changed' : ''}`}>
    {visual === 'tanker' ? <RouteAlternative progress={phase} />
      : visual === 'pipe' ? <div className="pipe-alternative">
        <span className="pipe-alt-surface">Road surface</span><span className="pipe-alt-cross" />
        <span className={`pipe-alt-junction${phase >= 4 / 6 ? ' is-repaired' : ''}`}>{phase >= 4 / 6 ? 'Repair sleeve fitted' : 'Water escaping'}</span>
      </div> : <><span className="stage-fallback-tap" /><span className="stage-fallback-bucket" /></>}
  </div>
}

export function OperationsScene({ visual, phase, strength, angle }: {
  visual: StageVisual
  phase: number
  strength?: number
  angle: number
}) {
  const { viewRef, show3d, visible, reducedMotion, graphicsFailed, fail } = useSceneCanvas()
  const [progress, setProgress] = useState(phase)
  const progressRef = useRef({ value: phase })
  const [painted, setPainted] = useState(false)
  const pipeStage = Math.round(phase * 6)

  useEffect(() => {
    const current = progressRef.current
    if (visual === 'pipe' || reducedMotion || !visible) {
      current.value = phase
      setProgress(phase)
      return
    }
    const tween = gsap.to(current, {
      value: phase, duration: visual === 'tanker' ? 1.2 : .42, ease: 'power2.inOut',
      onUpdate: () => setProgress(current.value),
    })
    return () => { tween.kill() }
  }, [phase, visual, visible, reducedMotion])

  return <div className={`stage-scene stage-scene--${visual}`} ref={viewRef} aria-hidden="true">
    {(!painted || !show3d || graphicsFailed) && <StageFallback visual={visual} phase={visual === 'pipe' ? phase : progress} />}
    {show3d && !graphicsFailed && <div className={`stage-webgl${painted ? ' is-painted' : ''}`}>
      <RenderBoundary onError={fail}>
        <Canvas camera={{ position: visual === 'tanker' ? [9.5, 14, 13.8] : visual === 'pipe' ? [7.5, 6, 11] : [5.4, 5, 6.4], fov: 39 }}
          frameloop={visual === 'pipe' && pipeStage < 4 && !reducedMotion && visible ? 'always' : 'demand'}
          dpr={[1, 1.3]} gl={{ powerPreference: 'low-power' }}>
          <SceneTurn angle={angle - .08} reducedMotion={reducedMotion}>
            {visual === 'tap' && <TapWorld flow={progress} />}
            {visual === 'tanker' && <RouteWorld progress={progress} />}
            {visual === 'pipe' && <CutawayWorld stage={pipeStage} strength={strength} reducedMotion={reducedMotion || !visible} />}
          </SceneTurn>
          <Painted onPaint={() => setPainted(true)} />
        </Canvas>
      </RenderBoundary>
    </div>}
  </div>
}
