import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CatmullRomCurve3, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, TubeGeometry, Vector3 } from 'three'
import gsap from 'gsap'
import { townOrigin, type Elevation } from './terrain'
import { useWorld } from './state'

/** A connected supply pipe with a transparent inspection section, not telemetry. */
export function HouseholdFlow({ elevation, reduced }: { elevation: Elevation; reduced: boolean }) {
  const town=useWorld(s=>s.town), kind=useWorld(s=>s.kind), condition=useWorld(s=>s.condition), paused=useWorld(s=>s.paused)
  const base=useMemo(()=>townOrigin(elevation,town),[elevation,town])
  const {invalidate,gl}=useThree()
  const flow=useRef({amount:1}), distance=useRef(0)
  const pulses=useRef<InstancedMesh>(null), outlet=useRef<Group>(null), waterMaterial=useRef<MeshStandardMaterial>(null)
  const object=useMemo(()=>new Object3D(),[])
  const curve=useMemo(()=>new CatmullRomCurve3([
    new Vector3(27.25,.6,24.5),new Vector3(27.8,.6,24.5),new Vector3(28.9,.6,24.5),
    new Vector3(29.35,.72,24.5),new Vector3(29.5,1.12,24.5),new Vector3(29.5,1.65,24.5),
    new Vector3(29.5,1.75,24.8),new Vector3(29.5,1.7,25.15),new Vector3(29.5,1.53,25.38),
  ],false,'centripetal'),[])
  const shell=useMemo(()=>new TubeGeometry(curve,96,.115,24,false),[curve])
  const core=useMemo(()=>new TubeGeometry(curve,96,.077,16,false),[curve])
  const active=kind==='shortage'||kind==='tanker'||kind==='leak'&&condition==='Supply restored'
  useEffect(()=>{
    const amount=condition==='No running water'?0:condition==='Low pressure'?.2:1
    const tween=gsap.to(flow.current,{amount,duration:reduced||paused?0:.65,ease:'power2.out',onUpdate:invalidate})
    return()=>{tween.kill()}
  },[condition,paused,reduced,invalidate])
  useEffect(()=>()=>{shell.dispose();core.dispose()},[shell,core])
  useFrame((_,delta)=>{
    const amount=flow.current.amount
    const moving=active&&amount>.001&&!paused&&!reduced
    if(moving)distance.current+=Math.min(delta,.05)*amount*.5
    gl.domElement.dataset.tapFlow=amount.toFixed(2)
    gl.domElement.dataset.xrayFlow=amount>.01?(amount<.5?'low':'strong'):'stopped'
    gl.domElement.dataset.xrayProgress=distance.current.toFixed(4)
    if(waterMaterial.current)waterMaterial.current.opacity=.08+amount*.36
    if(pulses.current){
      pulses.current.visible=active&&amount>.01
      for(let i=0;i<18;i++){
        const t=(distance.current+i/18)%1
        object.position.copy(curve.getPointAt(t));object.quaternion.setFromUnitVectors(new Vector3(0,1,0),curve.getTangentAt(t))
        const radius=amount<.5?.024:.04
        object.scale.set(radius,.045+amount*.025,radius);object.updateMatrix();pulses.current.setMatrixAt(i,object.matrix)
      }
      pulses.current.instanceMatrix.needsUpdate=true
    }
    if(outlet.current){outlet.current.visible=amount>.01;outlet.current.scale.set(Math.sqrt(amount),1,Math.sqrt(amount))}
    if(moving)invalidate()
  })
  return <group position={base} visible={active}>
    {/* Opaque connectors make the transparent section read as part of the plumbing. */}
    <mesh position={[27.3,.6,24.5]} rotation={[0,0,Math.PI/2]} castShadow><cylinderGeometry args={[.17,.17,.2,32]}/><meshStandardMaterial color="#829b9b" metalness={.8} roughness={.24}/></mesh>
    <mesh geometry={core} renderOrder={1}><meshStandardMaterial ref={waterMaterial} color="#139ad0" transparent opacity={.44} depthWrite={false} roughness={.2}/></mesh>
    <instancedMesh ref={pulses} args={[undefined,undefined,18]} frustumCulled={false} renderOrder={2}><sphereGeometry args={[1,10,8]}/><meshBasicMaterial color="#84e5ff" toneMapped={false}/></instancedMesh>
    <mesh geometry={shell} renderOrder={3}><meshPhysicalMaterial color="#c6e0e3" transparent opacity={.22} metalness={.22} roughness={.15} clearcoat={1} depthWrite={false}/></mesh>
    <mesh position={[29.5,1.88,24.92]} castShadow><cylinderGeometry args={[.045,.045,.25,20]}/><meshStandardMaterial color="#708e90" metalness={.8} roughness={.25}/></mesh>
    <mesh position={[29.5,2.03,24.92]} castShadow><boxGeometry args={[.6,.1,.14]}/><meshStandardMaterial color="#147567" metalness={.25} roughness={.35}/></mesh>
    <mesh position={[29.5,1.52,25.38]} castShadow><cylinderGeometry args={[.14,.14,.12,32,1,true]}/><meshStandardMaterial color="#9aadb0" metalness={.85} roughness={.24}/></mesh>
    <group ref={outlet} position={[29.5,1.46,25.38]}><mesh position={[0,-.7,0]}><cylinderGeometry args={[.065,.09,1.4,20]}/><meshPhysicalMaterial color="#50bce7" transparent opacity={.58} roughness={.1} depthWrite={false}/></mesh></group>
    <mesh position={[29.5,.04,25.38]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.18,.34,32]}/><meshStandardMaterial color="#879c96" roughness={.8}/></mesh>
  </group>
}
