import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import gsap from 'gsap'
import { Spherical, Vector3 } from 'three'
import { townOrigin, type Elevation } from './terrain'
import { useWorld, type CameraDestination } from './state'

export type CameraPose = { position: [number, number, number]; target: [number, number, number] }
export const destinationPoses: Record<CameraDestination, CameraPose> = {
  IslandOverview: { position: [400, 900, 1000], target: [-220, 0, 0] },
  CoordinatorOverview: { position: [540, 980, 850], target: [-10, 0, 0] },
  ResidentVillage: { position: [82, 43, 94], target: [-13, 2, -5] },
  ResidentHouse: { position: [58, 29, 64], target: [22, 4, 22] },
  WaterShortageScene: { position: [29.7, 3.2, 28.6], target: [28.6, 1.25, 24.9] },
  PublicLeakScene: { position: [8, 6, 29], target: [0, -1, 18] },
  RepairLocation: { position: [38, 25, 49], target: [1, 0, 18] },
  TankerDepot: { position: [12, 20, 8], target: [-16, 2, -18] },
  TankerRoute: { position: [116, 110, 136], target: [0, 3, 0] },
  DeliveryLocation: { position: [48, 25, 62], target: [12, 2, 10] },
}

export function CameraDirector({ elevation, reduced }: { elevation: Elevation; reduced: boolean }) {
  const { camera, invalidate } = useThree()
  const controls = useRef<OrbitControlsType>(null)
  const animation = useRef<gsap.core.Timeline | null>(null)
  const destination = useWorld(s => s.destination)
  const town = useWorld(s => s.town)
  const depotTown = useWorld(s => s.depotTown)
  const request = useWorld(s => s.cameraRequest)
  const skipRequest = useWorld(s => s.skipRequest)
  const paused = useWorld(s => s.paused)
  const explore = useWorld(s => s.explore)
  const navigation = useWorld(s => s.navigation)
  useEffect(() => {
    animation.current?.kill()
    const orbit = controls.current
    if (!orbit) return
    const pose = destinationPoses[destination]
    const base = destination === 'IslandOverview' || destination === 'CoordinatorOverview' ? new Vector3() : townOrigin(elevation, destination === 'TankerDepot' ? depotTown : town)
    const finalPosition = new Vector3(...pose.position).add(base)
    const finalTarget = new Vector3(...pose.target).add(base)
    if (reduced) {
      camera.position.copy(finalPosition); orbit.target.copy(finalTarget); orbit.update(); invalidate()
      useWorld.setState({ transitioning: false })
      return
    }
    useWorld.setState({ transitioning: true })
    const timeline = gsap.timeline({ paused: useWorld.getState().paused, defaults: { ease: 'power2.inOut' }, onUpdate: () => { orbit.update(); invalidate() }, onComplete: () => useWorld.setState({ transitioning: false }) })
    // Guided travel first establishes the village, then the task location.
    const longJourney = camera.position.distanceTo(finalPosition) > 350 && destination !== 'IslandOverview' && destination !== 'CoordinatorOverview'
    if (longJourney) {
      const village = destinationPoses.ResidentVillage
      const intermediate = new Vector3(...village.position).add(base)
      const intermediateTarget = new Vector3(...village.target).add(base)
      timeline.to(camera.position, { x: intermediate.x, y: intermediate.y, z: intermediate.z, duration: 1.3 }, 0)
      timeline.to(orbit.target, { x: intermediateTarget.x, y: intermediateTarget.y, z: intermediateTarget.z, duration: 1.3 }, 0)
    }
    const start = longJourney ? 1.3 : 0
    timeline.to(camera.position, { x: finalPosition.x, y: finalPosition.y, z: finalPosition.z, duration: longJourney ? 1.1 : 1.25 }, start)
    timeline.to(orbit.target, { x: finalTarget.x, y: finalTarget.y, z: finalTarget.z, duration: longJourney ? 1.1 : 1.25 }, start)
    animation.current = timeline
    invalidate()
    return () => { timeline.kill() }
  }, [camera, destination, depotTown, elevation, invalidate, reduced, request, town])
  useEffect(() => { if (paused) animation.current?.pause(); else animation.current?.resume(); invalidate() }, [paused, invalidate])
  useEffect(() => { if (skipRequest > 0) { animation.current?.progress(1); invalidate() } }, [skipRequest, invalidate])
  useEffect(() => {
    if (!navigation.request || !controls.current) return
    animation.current?.kill(); useWorld.setState({ transitioning: false })
    const target = controls.current.target
    const orbit = new Spherical().setFromVector3(camera.position.clone().sub(target))
    if (navigation.action === 'ArrowLeft') orbit.theta -= .16
    if (navigation.action === 'ArrowRight') orbit.theta += .16
    if (navigation.action === 'ArrowUp') orbit.phi = Math.max(.12, orbit.phi - .1)
    if (navigation.action === 'ArrowDown') orbit.phi = Math.min(Math.PI * .47, orbit.phi + .1)
    if (navigation.action === '+' || navigation.action === '=') orbit.radius = Math.max(8, orbit.radius * .86)
    if (navigation.action === '-') orbit.radius = Math.min(2100, orbit.radius * 1.16)
    camera.position.copy(new Vector3().setFromSpherical(orbit).add(target)); controls.current.update(); invalidate()
  }, [camera, invalidate, navigation])
  return <OrbitControls ref={controls} makeDefault enableDamping={false} enabled={explore} enablePan minDistance={8} maxDistance={2100} maxPolarAngle={Math.PI * .47} onStart={() => { animation.current?.kill(); useWorld.setState({ transitioning: false }) }} />
}
