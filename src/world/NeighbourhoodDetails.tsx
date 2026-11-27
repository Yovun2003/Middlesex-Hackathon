import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, CatmullRomCurve3, Color, InstancedMesh, Object3D, Path, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace, Vector3 } from 'three'
import { useWorld } from './state'
import { townOrigin, type Elevation } from './terrain'

type Piece = { at: [number, number, number]; size: [number, number, number] }
function Pieces({ pieces, color, metalness = 0 }: { pieces: Piece[]; color: string; metalness?: number }) {
  const ref = useRef<InstancedMesh>(null)
  useEffect(() => {
    const object = new Object3D()
    pieces.forEach((piece, i) => { object.position.set(...piece.at); object.scale.set(...piece.size); object.updateMatrix(); ref.current?.setMatrixAt(i, object.matrix) })
    if (ref.current) { ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere() }
  }, [pieces])
  return <instancedMesh ref={ref} args={[undefined, undefined, pieces.length]} castShadow receiveShadow><boxGeometry /><meshStandardMaterial color={color} roughness={.82} metalness={metalness} /></instancedMesh>
}
/** Street-scale details stay anchored to the same neighbourhood through all workflows. */
export function NeighbourhoodDetails({ elevation }: { elevation: Elevation }) {
  const town=useWorld(s=>s.destination==='TankerDepot'?s.depotTown:s.town)
  const quality=useWorld(s=>s.quality)
  const base=useMemo(()=>townOrigin(elevation,town),[elevation,town])
  const destination=useWorld(s=>s.destination)
  const wideTerrain=['IslandOverview','CoordinatorOverview','TankerRoute'].includes(destination)
  const textures=useLoader(TextureLoader,['aerial_grass_rock-Diffuse.webp','aerial_grass_rock-nor_gl.webp','aerial_grass_rock-arm.webp'].map(name=>`${import.meta.env.BASE_URL}textures/${name}`))
  const [texture, normal, arm]=textures
  textures.forEach(t=>{t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(1/15,1/15);t.anisotropy=quality==='high'?8:2})
  texture.colorSpace=SRGBColorSpace
  const ground=useMemo(()=>{
    const extent=wideTerrain?72:900; const shape=new Shape();shape.moveTo(-extent,-extent);shape.lineTo(extent,-extent);shape.lineTo(extent,extent);shape.lineTo(-extent,extent);shape.closePath()
    const trench=new Path();trench.moveTo(-13,-23);trench.lineTo(-13,-13);trench.lineTo(13,-13);trench.lineTo(13,-23);trench.closePath();shape.holes.push(trench)
    const geometry=new ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);return geometry
  },[wideTerrain])
  useEffect(()=>()=>ground.dispose(),[ground])
  const {walls, paving, posts, drains, lamps, leaves}=useMemo(()=>{
    const walls:Piece[]=[],paving:Piece[]=[],posts:Piece[]=[],drains:Piece[]=[],lamps:Piece[]=[],leaves:Piece[]=[]
    for(const [x,z] of [[22,22],[-24,22],[23,-19],[44,24],[-44,-23],[-24,-42]].slice(0,quality==='high'?6:3)) {
      paving.push({at:[x,.08,z],size:[16,.12,14]})
      for(const side of [-1,1]) { walls.push({at:[x+side*8, .72,z],size:[.23,1.4,15]}); walls.push({at:[x+side*5,.72,z+7.5],size:[6,1.4,.23]}) }
      walls.push({at:[x,.72,z-7.5],size:[16,1.4,.23]})
      for(const dx of [-8,-2,2,8])posts.push({at:[x+dx,.85,z+7.5],size:[.4,1.7,.4]})
      for(let k=0;k<8;k++) posts.push({at:[x-1.9+k*.54,.65,z+7.5],size:[.07,1.25,.07]})
      for(let k=0;k<(quality==='high'?28:12);k++){const a=k*2.399;const r=1.4*Math.sqrt(k/28); leaves.push({at:[x-6+Math.cos(a)*r, .6+(k%5)*.15,z+4+Math.sin(a)*r],size:[.7,.2,.7]})}
    }
    for(const side of [-1,1]) {
      for(const x of [-48,-16,16,48]) {paving.push({at:[x,.06,side*5.9],size:[1.8,.12,1.2]});for(let k=0;k<6;k++)drains.push({at:[x-.7+k*.28,.14,side*5.9],size:[.11,.03,.95]})}
      for(const x of [-46,40]){lamps.push({at:[x,3.4,side*7],size:[.12,6.8,.12]});lamps.push({at:[x,6.75,side*6.1],size:[.12,.12,1.8]});posts.push({at:[x,6.65,side*5.3],size:[.55,.18,1.1]})}
    }
    return {walls,paving,posts,drains,lamps,leaves}
  },[quality])
  const wires=useMemo(()=>[-1,1].map(side=>new CatmullRomCurve3([new Vector3(-46,6.6,side*7),new Vector3(-3,5.3,side*7),new Vector3(40,6.6,side*7)])),[])
  const sign=useMemo(()=>{const c=document.createElement('canvas');c.width=1024;c.height=256;const x=c.getContext('2d')!;x.fillStyle='#174c4a';x.fillRect(0,0,1024,256);x.fillStyle='#f3f5e8';x.font='600 84px sans-serif';x.textAlign='center';x.fillText('NouDilo',512,110);x.font='32px sans-serif';x.fillText('NEIGHBOURHOOD DISPATCH',512,185);const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;return t},[])
  useEffect(()=>()=>sign.dispose(),[sign])
  return <group position={base}>
    <mesh geometry={ground} position={[0,-.08,0]} receiveShadow><meshStandardMaterial map={texture} normalMap={normal} roughnessMap={arm} roughness={1} color="#b9c2a6" /></mesh>
    <Pieces pieces={paving} color="#b1b6ab" /><Pieces pieces={walls} color="#c4c7bc" /><Pieces pieces={posts} color="#4e6661" metalness={.25} /><Pieces pieces={drains} color="#354744" metalness={.5} /><Pieces pieces={lamps} color="#4b5754" metalness={.5} /><Pieces pieces={leaves} color="#4e693c" />
    {wires.map((curve,i)=><mesh key={i}><tubeGeometry args={[curve,32,.025,5,false]} /><meshStandardMaterial color="#293b35" roughness={.9} /></mesh>)}
    <mesh position={[-42,3.65,-27.75]}><planeGeometry args={[7,.9]} /><meshStandardMaterial map={sign} roughness={.7} /></mesh>
  </group>
}
