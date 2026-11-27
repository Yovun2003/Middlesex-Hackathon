import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Environment, Html, Lightformer, Sky, useGLTF } from '@react-three/drei'
import gsap from 'gsap'
import { BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PlaneGeometry, RepeatWrapping, SRGBColorSpace, TextureLoader, TubeGeometry, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsType } from 'three-stdlib'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { publicIncidents, TOWNS, type State } from '../model'
import { tankRoute, terrainPosition } from '../geo'
import { HouseholdFlow } from './HouseholdFlow'
import { NeighbourhoodDetails } from './NeighbourhoodDetails'
import { CameraDirector } from './CameraDirector'
import { rawHeight, surfaceHeight, townOrigin, townXZ, type Elevation } from './terrain'
import { useWorld } from './state'

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`
type Placement = { position: [number, number, number]; rotation?: number; scale?: number }

function useElevation() {
  const texture = useLoader(TextureLoader, asset('mauritius-height.png'))
  return useMemo(() => {
    const image = texture.image as HTMLImageElement
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(image, 0, 0)
    return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data }
  }, [texture])
}

function Terrain({ elevation }: { elevation: Elevation }) {
  const source = useLoader(TextureLoader, asset('mauritius-colour.webp'))
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = source.image.width; canvas.height = source.image.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(source.image, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const light = pixels.data[i] * .2126 + pixels.data[i + 1] * .7152 + pixels.data[i + 2] * .0722
      pixels.data[i] = light * .58; pixels.data[i + 1] = light * .74; pixels.data[i + 2] = light * .73
    }
    ctx.putImageData(pixels, 0, 0)
    return new CanvasTexture(canvas)
  }, [source])
  useEffect(() => () => texture.dispose(), [texture])
  const quality = useWorld(s => s.quality)
  texture.colorSpace = SRGBColorSpace; texture.anisotropy = quality === 'high' ? 8 : 2
  const geometry = useMemo(() => {
    const geometry = new PlaneGeometry(926, 1086, quality === 'high' ? 260 : 160, quality === 'high' ? 300 : 180)
    geometry.rotateX(-Math.PI / 2)
    const vertices = geometry.attributes.position
    for (let i = 0; i < vertices.count; i++) vertices.setY(i, surfaceHeight(elevation, vertices.getX(i), vertices.getZ(i)))
    geometry.computeVertexNormals(); return geometry
  }, [elevation, quality])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial map={texture} alphaTest={.4} roughness={.95} color="#d5e3df" side={DoubleSide} /></mesh>
}

function materialDetail() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!; const pixels = context.createImageData(128, 128)
  let seed = 19
  for (let i = 0; i < pixels.data.length; i += 4) { seed = (seed * 16807) % 2147483647; const shade = 170 + seed % 70; pixels.data.set([shade, shade, shade, 255], i) }
  context.putImageData(pixels, 0, 0)
  const texture = new CanvasTexture(canvas); texture.wrapS = texture.wrapT = RepeatWrapping; texture.repeat.set(3, 3)
  return texture
}

const plasterCache = new WeakMap<object, CanvasTexture>()
function plasterAlbedo(source: { image: HTMLImageElement }) {
  const cached = plasterCache.get(source); if (cached) return cached
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
  const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(source.image, 0, 0, 512, 512)
  const pixels = context.getImageData(0, 0, 512, 512)
  for (let i=0;i<pixels.data.length;i+=4) { const value = 178 + (pixels.data[i] + pixels.data[i+1] + pixels.data[i+2]) / 3 * .3; pixels.data[i]=value; pixels.data[i+1]=value; pixels.data[i+2]=value }
  context.putImageData(pixels, 0, 0)
  const texture = new CanvasTexture(canvas); texture.colorSpace=SRGBColorSpace; texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(1.5,1.5);texture.anisotropy=4
  plasterCache.set(source,texture);return texture
}

function AssetInstances({ name, placements, castShadow = true }: { name: string; placements: Placement[]; castShadow?: boolean }) {
  const { scene } = useGLTF(asset(`models/${name}.glb`))
  const meshes = useMemo(() => {
    const result: Mesh[] = []; scene.updateMatrixWorld(true)
    scene.traverse(node => {
      if (!(node instanceof Mesh)) return
      let geometry=node.geometry.clone().applyMatrix4(node.matrixWorld)
      // Replace only the legacy household tap; retain the house and roof plumbing.
      if(name==='house' && /Brushed stainless|vehicle livery/i.test((node.material as MeshStandardMaterial).name)) {
        const flat=geometry.index?geometry.toNonIndexed():geometry
        const vertices=flat.attributes.position;const keep:number[]=[]
        for(let i=0;i<vertices.count;i+=3){const x=(vertices.getX(i)+vertices.getX(i+1)+vertices.getX(i+2))/3,y=(vertices.getY(i)+vertices.getY(i+1)+vertices.getY(i+2))/3,z=(vertices.getZ(i)+vertices.getZ(i+1)+vertices.getZ(i+2))/3;if(!(x>5.15&&y<2.15&&z>2.1&&z<3.7))keep.push(i,i+1,i+2)}
        const replacement=new BufferGeometry()
        for(const [key,attribute] of Object.entries(flat.attributes) as [string,Float32BufferAttribute][]){const values:number[]=[];for(const index of keep)for(let c=0;c<attribute.itemSize;c++)values.push(attribute.array[index*attribute.itemSize+c]);replacement.setAttribute(key,new Float32BufferAttribute(values,attribute.itemSize))}
        if(flat!==geometry)flat.dispose();geometry.dispose();geometry=replacement
      }
      result.push(new Mesh(geometry,node.material))
    }); return result
  }, [scene,name])
  useEffect(() => () => meshes.forEach(mesh => mesh.geometry.dispose()), [meshes])
  return <group>{meshes.map((mesh, index) => <InstanceBatch key={index} mesh={mesh} placements={placements} castShadow={castShadow} />)}</group>
}
function InstanceBatch({ mesh, placements, castShadow }: { mesh: Mesh; placements: Placement[]; castShadow: boolean }) {
  const ref = useRef<InstancedMesh>(null)
  const detail = useMemo(materialDetail, [])
  const concrete = useLoader(TextureLoader, ['Diffuse','nor_gl','arm'].map(type => asset(`textures/concrete_wall_006-${type}.webp`)))
  concrete.forEach(texture => { texture.wrapS = texture.wrapT = RepeatWrapping; texture.repeat.set(1.5, 1.5); texture.anisotropy = 4 }); concrete[0].colorSpace = SRGBColorSpace
  const material = useMemo(() => {
    const original = mesh.material as MeshStandardMaterial
    const material = original.clone()
    if (/plaster|concrete|rubber|bark/i.test(material.name)) { material.bumpMap = detail; material.bumpScale = .035; material.roughnessMap = detail }
    if (/plaster|concrete/i.test(material.name)) { material.map = plasterAlbedo(concrete[0]); material.normalMap = concrete[1]; material.normalScale.set(.35,.35); material.roughnessMap = concrete[2]; material.roughness = .9 }
    return material
  }, [concrete, detail, mesh.material])
  useEffect(() => {
    const object = new Object3D()
    placements.forEach(({ position, rotation = 0, scale = 1 }, i) => { object.position.set(...position); object.rotation.set(0, rotation, 0); object.scale.setScalar(scale); object.updateMatrix(); ref.current?.setMatrixAt(i, object.matrix) })
    if (ref.current) { ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere() }
  }, [placements])
  useEffect(() => () => { detail.dispose(); material.dispose() }, [detail, material])
  return <instancedMesh ref={ref} args={[mesh.geometry, material, placements.length]} castShadow={castShadow} receiveShadow frustumCulled />
}

function Box({ size, at, color, roughness = .9 }: { size: [number, number, number]; at: [number, number, number]; color: string; roughness?: number }) {
  return <mesh position={at} receiveShadow castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={roughness} /></mesh>
}
function Village({ elevation, town }: { elevation: Elevation; town: string }) {
  const origin = useMemo(() => townOrigin(elevation, town), [elevation, town])
  const chosenTown = useWorld(s => s.town); const destination = useWorld(s => s.destination)
  const depotTown = useWorld(s => s.depotTown)
  const activeTown = destination === 'TankerDepot' ? depotTown : chosenTown
  const activeOrigin = useMemo(() => townOrigin(elevation, activeTown), [elevation, activeTown])
  const visible = ['IslandOverview', 'CoordinatorOverview'].includes(destination) || town === activeTown
  return <group position={origin} visible={visible}>
    {/* Continuous road surfaces, sidewalks, a service trench, and a small distribution depot. */}
    <Box size={[120, .18, 7]} at={[0, .05, 0]} color="#59625d" />
    <Box size={[7, .18, 60]} at={[0, .05, -31]} color="#59625d" />
    <Box size={[7, .18, 47]} at={[0, .05, 46.5]} color="#59625d" />
    {[-5, 5].map(z => <Box key={z} size={[120, .22, 1.3]} at={[0, .08, z]} color="#b2b7aa" />)}
    {Array.from({ length: 16 }, (_, i) => <Box key={i} size={[2, .02, .12]} at={[-55 + i * 7, .16, 0]} color="#d5d5bf" />)}
    <Box size={[25, .18, 20]} at={[-19, .05, -20]} color="#a3aa9a" />
    <Box size={[12, 4.5, 8]} at={[-23, 2.3, -25]} color="#c8cec3" />
    <Box size={[13, .3, 9]} at={[-23, 4.7, -25]} color="#9fa99b" />
    {[-26, -19].map(x => <mesh key={x} position={[x, 2, -15]} castShadow receiveShadow><cylinderGeometry args={[2, 2, 3.8, 40]} /><meshStandardMaterial color="#b7c3bf" metalness={.6} roughness={.38} /></mesh>)}
    <Box size={[25, .2, 8.2]} at={[0, -3.5, 18]} color="#6d6656" />
    {[-4.2, 4.2].map(z => <Box key={z} size={[25, 3.4, .2]} at={[0, -1.7, 18 + z]} color="#8b8070" />)}
    {[-1, 1].map(side => <group key={side}><mesh position={[side * 6.2, -1.6, 18]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.5, .5, 11.6, 40]} /><meshStandardMaterial color="#607f7a" metalness={.45} roughness={.45} /></mesh><mesh position={[side * .43, -1.6, 18]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.5, .06, 10, 40]} /><meshStandardMaterial color="#465e58" roughness={.7} metalness={.3} /></mesh></group>)}
  </group>
}

function Infrastructure({ elevation }: { elevation: Elevation }) {
  const quality = useWorld(s => s.quality)
  const chosenTown = useWorld(s => s.town); const destination = useWorld(s => s.destination); const kind = useWorld(s => s.kind)
  const depotTown = useWorld(s => s.depotTown)
  const activeTown = destination === 'TankerDepot' ? depotTown : chosenTown
  const close = !['IslandOverview', 'CoordinatorOverview'].includes(destination)
  const houses = useMemo<Placement[]>(() => TOWNS.filter(town => !close || town === activeTown).flatMap(town => {
    const base = townOrigin(elevation, town)
    const hidden = close && town !== activeTown
    return [[22, 22], [-24, 22], [23, -19], [44, 24], [-44, -23], [-24, -42]].slice(0, quality === 'high' ? 6 : 3).map(([x, z]) => ({ position: [base.x + x, base.y, base.z + z] as [number, number, number], rotation: 0, scale: hidden ? .0001 : 1 }))
  }), [elevation, quality, activeTown, close])
  const palms = useMemo<Placement[]>(() => TOWNS.filter(town => !close || town === activeTown).flatMap((town, t) => {
    const base = townOrigin(elevation, town)
    const hidden = close && town !== activeTown
    return Array.from({ length: quality === 'high' ? 16 : 7 }, (_, i) => { const a = i * 2.399 + t; const r = 30 + i % 5 * 8; const x = base.x + Math.cos(a) * r; const z = base.z + Math.sin(a) * r; const corridor = town === activeTown && kind === 'leak' && x - base.x > -5 && x - base.x < 38 && z - base.z > 9 && z - base.z < 65; return { position: [x, Math.max(base.y, surfaceHeight(elevation, x, z) + .1), z] as [number, number, number], rotation: a, scale: hidden || corridor ? .0001 : .65 + i % 4 * .13 } })
  }), [elevation, quality, activeTown, close, kind])
  const reservoir = townOrigin(elevation, 'Vacoas').add(new Vector3(-73, 0, -40))
  return <>
    <AssetInstances name="house" placements={houses} />
    <NeighbourhoodDetails elevation={elevation} />
    <AssetInstances name="office" placements={[{ position: [townOrigin(elevation, activeTown).x - 42, townOrigin(elevation, activeTown).y, townOrigin(elevation, activeTown).z - 32] }]} />
    {kind !== 'tanker' && <AssetInstances name="tanker" placements={[{ position: [townOrigin(elevation, activeTown).x - 16, townOrigin(elevation, activeTown).y, townOrigin(elevation, activeTown).z - 18], rotation: .1 }]} />}
    <AssetInstances name="palm" placements={palms} castShadow={quality === 'high'} />
    {TOWNS.map(town => <Village key={town} town={town} elevation={elevation} />)}
    <group position={reservoir} visible={!close || activeTown === 'Vacoas'}>
      <Box size={[45, 3, 30]} at={[0, .4, 0]} color="#8e998b" />
      <Box size={[40, .15, 25]} at={[0, 2, 0]} color="#4f9592" roughness={.2} />
      {[-23, 23].map(x => <Box key={x} size={[1, 3.5, 31]} at={[x, 2, 0]} color="#c2c8b9" />)}
    </group>
  </>
}

function LeakAndRepair({ elevation, reduced }: { elevation: Elevation; reduced: boolean }) {
  const town = useWorld(s => s.town); const kind = useWorld(s => s.kind); const phase = useWorld(s => s.phase); const condition = useWorld(s => s.condition); const paused = useWorld(s => s.paused)
  const base = useMemo(() => townOrigin(elevation, town), [elevation, town])
  const ref = useRef<InstancedMesh>(null); const clock = useRef(0); const transform = useMemo(() => new Object3D(), []); const { invalidate, gl } = useThree()
  const vehicle = useRef<Group>(null); const mobilisation = useRef<gsap.core.Tween | null>(null)
  const lastTown = useRef('')
  useEffect(() => {
    if (!vehicle.current || kind !== 'leak' || phase < .15) return
    mobilisation.current?.kill()
    if (lastTown.current !== town) { vehicle.current.position.set(base.x + 7, base.y, base.z + 47); lastTown.current = town }
    mobilisation.current = gsap.to(vehicle.current.position, { x: base.x + 7, y: base.y, z: base.z + 24, duration: reduced ? 0 : 1.6, ease: 'power2.inOut', paused, onUpdate: invalidate })
    return () => { mobilisation.current?.kill() }
  }, [base, kind, phase, reduced, town, invalidate])
  useEffect(() => { if (paused) mobilisation.current?.pause(); else mobilisation.current?.resume() }, [paused])
  const flow = condition === 'Heavy flow' ? 1 : condition === 'Continuous flow' ? .6 : .3
  useFrame((_, delta) => {
    gl.domElement.dataset.leakActive = String(kind === 'leak' && phase < 1)
    if (kind !== 'leak' || phase >= 1 || !ref.current) return
    if (!reduced && !paused) clock.current += Math.min(delta, .04)
    for (let i = 0; i < 38; i++) {
      const t = ((reduced || paused ? .4 : clock.current) * .8 + i * .137) % 1
      transform.position.set((i % 7 - 3) * .11 * t, -1.3 + Math.sin(t * Math.PI) * (phase >= .8 ? .4 : 2.3) * flow, 18 + t * 1.9)
      transform.scale.setScalar(.07 + .08 * (1 - t)); transform.updateMatrix(); ref.current.setMatrixAt(i, transform.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
    if (!paused && !reduced) invalidate()
  })
  const maintenance = useMemo<Placement[]>(() => [{ position: [0, 0, 0], rotation: Math.PI }], [])
  const equipment = useMemo<Placement[]>(() => [{ position: [base.x + 1, base.y, base.z + 23], rotation: Math.PI }], [base])
  return <group visible={kind === 'leak'}>
    <group position={base}>
      {phase >= .8 && <mesh position={[0, -1.6, 18]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.58, .58, 3, 40]} /><meshStandardMaterial color="#b3bdba" metalness={.75} roughness={.3} /></mesh>}
      {phase < 1 && <instancedMesh ref={ref} args={[undefined, undefined, 38]} frustumCulled={false}><sphereGeometry args={[1, 8, 6]} /><meshPhysicalMaterial color="#6daeb6" transparent opacity={.75} roughness={.16} /></instancedMesh>}
    </group>
    <group ref={vehicle} visible={phase >= .15}><AssetInstances name="maintenance" placements={maintenance} /></group>
    {phase >= .4 && <AssetInstances name="equipment" placements={equipment} />}
  </group>
}

function routeFor(elevation: Elevation, town: string, depotTown: string) {
  const from = townOrigin(elevation, depotTown).add(new Vector3(-15, 0, -18))
  const destination = townOrigin(elevation, town).add(new Vector3(10, 0, 8))
  const points = town === depotTown ? [from.clone(), new Vector3(from.x, from.y, from.z + 18), new Vector3(destination.x, destination.y, destination.z - 8), destination.clone()] : town === 'Curepipe' && depotTown === 'Vacoas' ? tankRoute.slice(10).map(coordinate => { const [x, z] = terrainPosition(coordinate); return new Vector3(x * 100, surfaceHeight(elevation, x * 100, z * 100) + .6, z * 100) }) : [from.clone(), from.clone().lerp(destination, .35).add(new Vector3(4, 0, -8)), from.clone().lerp(destination, .7).add(new Vector3(-5, 0, 3)), destination.clone()]
  points.unshift(from); points.push(destination)
  return new CatmullRomCurve3(points)
}
function TankerJourney({ elevation, reduced }: { elevation: Elevation; reduced: boolean }) {
  const town = useWorld(s => s.town); const phase = useWorld(s => s.phase); const kind = useWorld(s => s.kind); const playback = useWorld(s => s.playback); const paused = useWorld(s => s.paused)
  const depotTown = useWorld(s => s.depotTown)
  const root = useRef<Group>(null); const progress = useRef({ t: phase }); const tween = useRef<gsap.core.Tween | null>(null)
  const route = useMemo(() => routeFor(elevation, town, depotTown), [elevation, town, depotTown]); const { invalidate, gl, camera, controls } = useThree()
  const ribbon = useMemo(() => new TubeGeometry(route, 96, .24, 5, false), [route])
  const road = useMemo(() => {
    const vertices: number[] = []; const indices: number[] = []
    for (let i = 0; i <= 96; i++) {
      const p = route.getPointAt(i / 96); const t = route.getTangentAt(i / 96)
      for (const side of [-1, 1]) { const x = p.x + t.z * 2.8 * side; const z = p.z - t.x * 2.8 * side; vertices.push(x, surfaceHeight(elevation, x, z) + .25, z) }
      if (i) { const n = i * 2; indices.push(n - 2, n, n - 1, n - 1, n, n + 1) }
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry
  }, [elevation, route])
  const placement = useMemo<Placement[]>(() => [{ position: [0, .15, 0], rotation: 0 }], [])
  useEffect(() => { tween.current?.kill(); tween.current = gsap.to(progress.current, { t: phase, duration: reduced ? 0 : 1.4, ease: 'power2.inOut', onUpdate: invalidate }); return () => { tween.current?.kill() } }, [phase, invalidate, reduced, route])
  useEffect(() => {
    if (!playback || kind !== 'tanker') return
    tween.current?.kill(); progress.current.t = 0
    tween.current = gsap.to(progress.current, { t: 1, duration: reduced ? 0 : 9, ease: 'none', onUpdate: invalidate, onComplete: () => { progress.current.t = useWorld.getState().phase; useWorld.setState(s => ({ showRoute: false, cameraRequest: s.cameraRequest + 1 })); invalidate() } })
    return () => { tween.current?.kill() }
  }, [playback, invalidate, kind, reduced])
  useEffect(() => { if (paused) tween.current?.pause(); else tween.current?.resume() }, [paused])
  useFrame((_, delta) => {
    if (!root.current) return
    const point = route.getPointAt(progress.current.t); point.y = surfaceHeight(elevation, point.x, point.z) + .4
    const tangent = route.getTangentAt(progress.current.t); root.current.position.copy(point); root.current.rotation.y = Math.atan2(tangent.x, tangent.z)
    gl.domElement.dataset.vehicleProgress = progress.current.t.toFixed(2)
    const state = useWorld.getState()
    const following = kind === 'tanker' && state.showRoute && !state.explore && !state.transitioning && !reduced && !paused
    gl.domElement.dataset.followCamera = String(following)
    if (following && controls) {
      const position = point.clone().addScaledVector(tangent, -17).add(new Vector3(8, 10, 0))
      position.y = Math.max(position.y, surfaceHeight(elevation, position.x, position.z) + 6)
      camera.position.lerp(position, 1 - Math.exp(-delta * 3))
      const orbit = controls as OrbitControlsType
      orbit.target.lerp(point.clone().add(new Vector3(0, 2, 0)), 1 - Math.exp(-delta * 4)); orbit.update()
    }
  })
  useEffect(() => () => { ribbon.dispose(); road.dispose() }, [ribbon, road])
  return <group visible={kind === 'tanker'}><mesh geometry={road} receiveShadow><meshStandardMaterial color="#59615a" roughness={.95} side={DoubleSide} /></mesh><mesh geometry={ribbon}><meshStandardMaterial color="#c8b88c" roughness={.6} /></mesh><group ref={root}><AssetInstances name="tanker" placements={placement} /></group></group>
}

function ConfirmationSignal({ elevation, reduced }: { elevation: Elevation; reduced: boolean }) {
  const signal = useWorld(s => s.signal); const town = useWorld(s => s.town); const paused = useWorld(s => s.paused)
  const root = useRef<Mesh>(null); const progress = useRef({ value: 0 }); const animation = useRef<gsap.core.Tween | null>(null); const { invalidate, gl } = useThree()
  const path = useMemo(() => {
    const from = townOrigin(elevation, town).add(new Vector3(22, 3, 22)); const to = townOrigin(elevation, town).add(new Vector3(-42, 4, -28))
    return new CatmullRomCurve3([from, from.clone().lerp(to, .5).add(new Vector3(0, 22, 0)), to])
  }, [elevation, town])
  useEffect(() => {
    if (!signal) return
    gl.domElement.dataset.confirmedReference = signal.id
    gl.domElement.dataset.communityLinked = String(signal.grouped)
    progress.current.value = 0
    animation.current = gsap.to(progress.current, { value: 1, duration: reduced ? 0 : 2.6, ease: 'power1.inOut', onUpdate: invalidate, paused, onComplete: () => { if (root.current) root.current.visible = false; invalidate() } })
    return () => { animation.current?.kill() }
  }, [signal?.id, path, reduced, invalidate])
  useEffect(() => { if (paused) animation.current?.pause(); else animation.current?.resume() }, [paused])
  useFrame(() => { if (root.current && signal && progress.current.value < 1) { root.current.visible = true; root.current.position.copy(path.getPointAt(progress.current.value)) } })
  return <mesh ref={root} visible={false}><sphereGeometry args={[1.2, 16, 12]} /><meshBasicMaterial color="#e5bd71" /></mesh>
}

function LinkedHouseholds({ elevation, state }: { elevation: Elevation; state: State }) {
  const town = useWorld(s => s.town); const signal = useWorld(s => s.signal); const kind = useWorld(s => s.kind)
  const active = (kind === 'shortage' || kind === 'tanker') && (!!signal?.grouped && signal.town === town || state.reports.some(r => r.type === 'shortage' && r.town === town && r.incidentId))
  const base = useMemo(() => townOrigin(elevation, town), [elevation, town])
  const geometry = useMemo(() => new BufferGeometry().setFromPoints([new Vector3(22, .3, 22), new Vector3(0, .3, 6), new Vector3(0, .3, 6), new Vector3(-24, .3, 22), new Vector3(0, .3, 6), new Vector3(23, .3, -19)]), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <group position={base} visible={active}><lineSegments geometry={geometry}><lineBasicMaterial color="#ab7f33" /></lineSegments>{[[22,22],[-24,22],[23,-19]].map(([x,z]) => <mesh key={x + '/' + z} position={[x, .2, z]} rotation={[-Math.PI / 2,0,0]}><ringGeometry args={[8,8.2,48]} /><meshBasicMaterial color="#aa8747" transparent opacity={.5} /></mesh>)}</group>
}

function RendererDiagnostics() {
  const { gl, camera } = useThree(); const frames = useRef(0)
  useFrame(() => { gl.domElement.dataset.renderCount = String(++frames.current); gl.domElement.dataset.cameraPosition = camera.position.toArray().map(n => n.toFixed(3)).join(','); queueMicrotask(() => { gl.domElement.dataset.drawCalls = String(gl.info.render.calls); gl.domElement.dataset.triangles = String(gl.info.render.triangles) }) })
  return null
}

function Lighting({ elevation }: { elevation: Elevation }) {
  const destination = useWorld(s => s.destination); const town = useWorld(s => s.town); const quality = useWorld(s => s.quality)
  const depotTown = useWorld(s => s.depotTown)
  const sun = useRef<DirectionalLight>(null)
  const close = !['IslandOverview', 'CoordinatorOverview'].includes(destination)
  const focus = useMemo(() => close ? townOrigin(elevation, destination === 'TankerDepot' ? depotTown : town) : new Vector3(), [close, destination, depotTown, elevation, town])
  useEffect(() => { if (sun.current) { sun.current.target.position.copy(focus); sun.current.target.updateMatrixWorld() } }, [focus])
  const extent = close ? 100 : 600
  return <>
    <hemisphereLight args={['#bbd4e2', '#3b5350', .95]} />
    <directionalLight ref={sun} position={[focus.x - 120, focus.y + 230, focus.z + 90]} intensity={3.5} color="#f1f2df" castShadow shadow-mapSize={[quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024]} shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent} shadow-camera-far={1200} shadow-normalBias={.08} shadow-bias={-.00015} />
    <Sky distance={4500} sunPosition={[-120, 230, 90]} turbidity={4} rayleigh={.65} />
    <Environment resolution={64} frames={1}><Lightformer intensity={2} position={[0, 20, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[100, 100, 1]} /><Lightformer intensity={1} position={[-20, 5, 0]} rotation={[0, Math.PI / 2, 0]} scale={[80, 80, 1]} /></Environment>
  </>
}

function Ocean() {
  const ripples = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')!; const pixels = context.createImageData(512, 512)
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const u = x / 512 * Math.PI * 2; const v = y / 512 * Math.PI * 2
      const shade = 128 + 36 * Math.sin(u * 9 + 2 * Math.sin(v * 3)) + 23 * Math.cos(v * 17 + Math.sin(u * 5)) + 12 * Math.sin(u * 29 + v * 23)
      const i = (y * 512 + x) * 4; pixels.data.set([shade, shade, shade, 255], i)
    }
    context.putImageData(pixels, 0, 0)
    const texture = new CanvasTexture(canvas); texture.wrapS = texture.wrapT = RepeatWrapping; texture.repeat.set(100, 100)
    return texture
  }, [])
  useEffect(() => () => ripples.dispose(), [ripples])
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.8, 0]} receiveShadow><planeGeometry args={[9000, 9000]} /><meshStandardMaterial color="#244a59" bumpMap={ripples} bumpScale={.9} roughness={.34} metalness={.55} /></mesh>
}

function Contents({ state, reduced, onSelect }: { state: State; reduced: boolean; onSelect: (id: string) => void }) {
  const elevation = useElevation(); const kind = useWorld(s => s.kind); const selectedTown = useWorld(s => s.town)
  const destination = useWorld(s => s.destination)
  const incidents = publicIncidents(state)
  const markerTowns = [...new Set(['Port Louis', 'Curepipe', 'Rose Hill', 'Flacq', 'Mahébourg', ...incidents.map(i => i.town), selectedTown])]
  const { gl } = useThree()
  useEffect(() => { useWorld.setState({ mounted: true }); gl.domElement.dataset.worldCanvas = 'persistent'; return () => { useWorld.setState({ mounted: false }) } }, [gl])
  return <>
    <fog attach="fog" args={['#b8c9c7', ['IslandOverview','CoordinatorOverview','TankerRoute'].includes(destination) ? 1100 : 110, ['IslandOverview','CoordinatorOverview','TankerRoute'].includes(destination) ? 3200 : 360]} />
    <Lighting elevation={elevation} />
    <CameraDirector elevation={elevation} reduced={reduced} />
    <group visible={['IslandOverview','CoordinatorOverview','TankerRoute'].includes(destination)}><Ocean /><Terrain elevation={elevation} /></group>
    <group visible={!['IslandOverview', 'CoordinatorOverview'].includes(destination)}><Infrastructure elevation={elevation} /></group>
    <HouseholdFlow elevation={elevation} reduced={reduced} />
    <LeakAndRepair elevation={elevation} reduced={reduced} />
    <TankerJourney elevation={elevation} reduced={reduced} />
    <ConfirmationSignal elevation={elevation} reduced={reduced} />
    <LinkedHouseholds elevation={elevation} state={state} />
    <RendererDiagnostics />
    {kind === 'overview' && ['IslandOverview', 'CoordinatorOverview'].includes(destination) && markerTowns.map(town => {
      const origin = townOrigin(elevation, town); const incident = incidents.find(i => i.town === town)
      return <Html key={town} position={[origin.x, origin.y + 12, origin.z]} center zIndexRange={[5, 1]}><button className={`world-place ${incident ? `tone-${incident.tone}` : ''}`} type="button" aria-label={incident ? `${town}: ${incident.label}` : `Explore ${town}`} onClick={() => { useWorld.getState().setTown(town); if (incident) onSelect(incident.id); else useWorld.getState().focus({ kind: 'overview', town, destination: 'ResidentVillage', label: `${town} · illustrative infrastructure` }) }}><span />{town}{incident && <small>{incident.label}</small>}</button></Html>
    })}
  </>
}

export default function WorldScene({ state, reduced, onSelect }: { state: State; reduced: boolean; onSelect: (id: string) => void }) {
  const quality = useWorld(s => s.quality)
  const mode = useWorld(s => s.mode)
  return <Canvas shadows camera={{ position: [710, 990, 1100], fov: 42, near: .3, far: 12000 }} dpr={quality === 'high' ? [1, 1.5] : 1} frameloop={mode === '2d' ? 'never' : 'demand'} gl={{ antialias: quality === 'high', alpha: false, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.shadowMap.type = PCFSoftShadowMap; gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); useWorld.setState({ graphicsFailed: true, mode: '2d' }) }) }}><Contents state={state} reduced={reduced} onSelect={onSelect} /></Canvas>
}
