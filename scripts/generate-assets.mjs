/** Original NouDilo procedural assets. No downloaded meshes or paid assets. */
import { mkdir, writeFile } from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.() }) }
}
const materials = {}
function mat(name, color, roughness = .75, metalness = 0) {
  return materials[name] ??= new THREE.MeshStandardMaterial({ name, color, roughness, metalness })
}
const plaster = mat('Mineral plaster', '#dbddd3', .88)
const concrete = mat('Weathered concrete', '#aeb5ad', .95)
const dark = mat('Powder coated charcoal', '#263633', .68, .2)
const white = mat('Truck enamel', '#e5e8df', .38, .25)
const metal = mat('Brushed stainless steel', '#a9b7b6', .28, .8)
const rubber = mat('Rubber', '#202724', .95)
const glass = mat('Tinted glazing', '#41605f', .13, .4)
const teal = mat('NouDilo vehicle livery', '#12685f', .4, .25)
const bark = mat('Palm bark', '#777260', .98)
const green = mat('Palm fronds', '#456b3d', .88)
green.side = THREE.DoubleSide
const orange = mat('Safety orange', '#c77c36', .72)
const soil = mat('Earth', '#6d6350', .98)

function box(root, size, position, material = plaster, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position); mesh.rotation.set(...rotation); root.add(mesh); return mesh
}
function cylinder(root, radius, height, position, material, rotation = [0, 0, 0], segments = 32) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material)
  mesh.position.set(...position); mesh.rotation.set(...rotation); root.add(mesh); return mesh
}
function sphere(root, radius, position, material, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material)
  mesh.position.set(...position); mesh.scale.set(...scale); root.add(mesh); return mesh
}
function pipe(root, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)))
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), material)
  root.add(mesh); return mesh
}
function house() {
  const g = new THREE.Group(); g.name = 'Mauritian concrete house with rooftop water infrastructure'
  box(g, [12, .35, 10], [0, .18, 0], concrete)
  box(g, [10.5, 6.6, 8.5], [0, 3.5, 0])
  for (const y of [.6, 3.65, 6.9]) box(g, [11.25, .24, 9.2], [0, y, 0], concrete)
  // Rooftop parapets and balcony slab.
  for (const x of [-5.45, 5.45]) box(g, [.2, .8, 9.1], [x, 7.4, 0])
  for (const z of [-4.45, 4.45]) box(g, [10.9, .8, .2], [0, 7.4, z])
  box(g, [7.5, .22, 1.7], [0, 3.7, 5.05], concrete)
  for (const x of [-3.65, 0, 3.65]) cylinder(g, .065, 1.08, [x, 4.3, 5.85], metal)
  for (const y of [3.95, 4.3, 4.8]) box(g, [7.5, .055, .055], [0, y, 5.85], metal)
  // Window reveals, aluminum frames, mullions, and glass.
  for (const y of [2.1, 5.1]) for (const x of [-3.2, 0, 3.2]) {
    box(g, [2.1, 1.7, .15], [x, y, 4.3], dark)
    box(g, [1.88, 1.48, .16], [x, y, 4.4], glass)
    box(g, [.06, 1.5, .18], [x, y, 4.42], metal)
    box(g, [2.4, .14, .65], [x, y + 1, 4.5], concrete)
    for (const side of [-1, 1]) {
      box(g, [.14, 1.7, 2], [side * 5.32, y, x * .76], dark)
      box(g, [.15, 1.46, 1.78], [side * 5.41, y, x * .76], glass)
    }
  }
  box(g, [1.25, 2.25, .18], [0, 1.5, -4.35], dark)
  box(g, [.9, 2, .19], [0, 1.5, -4.46], mat('Timber door', '#736a57'))
  // Black polyethylene roof tank, ribs, lid, and visible plumbing.
  cylinder(g, 1.12, 1.8, [-2.9, 8.18, -1.7], rubber, [0, 0, 0], 48)
  for (const y of [7.46, 7.85, 8.25, 8.65]) cylinder(g, 1.16, .08, [-2.9, y, -1.7], dark, [0, 0, 0], 48)
  cylinder(g, .47, .13, [-2.9, 9.14, -1.7], dark)
  pipe(g, [[-2.9, 7.4, -1.7], [-4.8, 7.4, -1.7], [-5.65, 6.8, -1.7], [-5.65, .45, -1.7]], .07, white)
  box(g, [2.9, .15, 1.9], [2.2, 7.6, -1.5], mat('Solar collector', '#2e4549', .3, .5), [-.22, 0, 0])
  cylinder(g, .37, 2.8, [2.2, 8.15, -2.4], metal, [0, 0, Math.PI / 2])
  // Perimeter drain and household water tap.
  pipe(g, [[5.3, .5, 2.5], [7.5, .5, 2.5], [7.5, 1.7, 2.5], [7.5, 1.7, 3.3]], .1, metal)
  box(g, [.65, .12, .12], [7.5, 1.85, 2.8], teal)
  return g
}
function tanker() {
  const g = new THREE.Group(); g.name = 'Six wheel water tanker'
  box(g, [2.4, .4, 7.2], [0, 1.05, 0], dark)
  box(g, [2.42, 2.05, 2.15], [0, 2.3, 2.15], white)
  box(g, [2.12, .85, .08], [0, 2.75, 3.27], glass, [-.1, 0, 0])
  box(g, [2.45, .24, .22], [0, 1.45, 3.36], metal)
  box(g, [1.05, .37, .1], [0, 1.87, 3.26], dark)
  for (const x of [-.84, .84]) box(g, [.43, .22, .12], [x, 1.86, 3.29], mat('Headlamp glass', '#d9ddbe', .1, .3))
  for (const x of [-1.25, 1.25]) {
    box(g, [.07, .85, 1.22], [x, 2.76, 2.21], glass)
    box(g, [.08, .23, 1.9], [x, 1.95, 2.2], teal)
    box(g, [.35, .08, .08], [x * 1.1, 2.5, 3.05], dark)
    box(g, [.18, .45, .3], [x * 1.18, 2.58, 3.07], dark)
  }
  cylinder(g, 1.06, 4.6, [0, 2.22, -1.18], metal, [Math.PI / 2, 0, 0], 64)
  for (const z of [-3.48, 1.12]) sphere(g, 1.06, [0, 2.22, z], metal, [1, 1, .18])
  for (const z of [-2.6, .3]) cylinder(g, 1.09, .085, [0, 2.22, z], dark, [Math.PI / 2, 0, 0], 48)
  cylinder(g, .36, .18, [0, 3.36, -1.35], metal)
  box(g, [2.13, .14, 5.8], [0, .73, -.65], dark)
  for (const x of [-1.18, 1.18]) for (const z of [-2.55, -1.4, 2.05]) {
    cylinder(g, .56, .32, [x, .62, z], rubber, [0, 0, Math.PI / 2], 40)
    cylinder(g, .29, .35, [x, .62, z], metal, [0, 0, Math.PI / 2], 24)
    cylinder(g, .1, .37, [x, .62, z], dark, [0, 0, Math.PI / 2], 16)
  }
  for (const x of [-.7, .7]) box(g, [.07, 2.5, .07], [x, 2.1, -3.75], metal)
  for (let i = 0; i < 7; i++) box(g, [1.4, .06, .06], [0, 1.05 + i * .32, -3.75], metal)
  pipe(g, [[.8, 1.3, -3.6], [1.1, .9, -3.65], [.5, .72, -3.72], [-.5, .72, -3.72]], .09, rubber)
  for (const x of [-.98, .98]) box(g, [.24, .22, .12], [x, 1.02, -3.76], mat('Rear reflectors', '#a64736', .3))
  return g
}
function palm() {
  const g = new THREE.Group(); g.name = 'Mauritian coconut palm with individual leaflets'
  pipe(g, [[0,0,0],[.2,3,.1],[.45,6.5,.1],[.85,9.5,0]], .24, bark)
  for (let i=0;i<32;i++) cylinder(g,.245-i*.001,.045,[i/32*.85,i*.29,0],mat('Palm growth rings','#625c4a'),[0,0,-.07],12)
  for(let f=0;f<11;f++) {
    const a=f*Math.PI*2/11; const points=[]
    for(let j=0;j<=18;j++) {const t=j/18; points.push([.85+Math.cos(a)*t*5.5,9.55+Math.sin(t*Math.PI)*1.5-t*1.5,Math.sin(a)*t*5.5])}
    pipe(g,points,.026,green)
    for(let j=2;j<18;j++) for(const side of [-1,1]) {
      const t=j/18;const [x,y,z]=points[j];const length=Math.sin(t*Math.PI)*1.05
      const end=[x-Math.sin(a)*length*side+Math.cos(a)*.35,y-.3-length*.45,z+Math.cos(a)*length*side+Math.sin(a)*.35]
      const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute([x,y,z,x+Math.cos(a)*.14,y+.04,z+Math.sin(a)*.14,...end],3));geometry.computeVertexNormals()
      g.add(new THREE.Mesh(geometry,j%3===0?mat('Sunlit leaflets','#647d43'):green))
    }
  }
  for(let i=0;i<4;i++) sphere(g,.2,[.85+Math.cos(i*1.7)*.4,9.25,Math.sin(i*1.7)*.4],mat('Coconut husk','#6e6e40'))
  return g
}
function office() {
 const g=new THREE.Group();g.name='Neighbourhood dispatch office'
 box(g,[16,.3,10],[0,.15,0],concrete);box(g,[14,4.2,8],[0,2.3,0],mat('Office sage plaster','#a7b9ac'))
 box(g,[15,.3,9],[0,4.55,0],concrete);box(g,[15,.18,2],[0,3.8,5],white)
 for(const x of [-6.5,6.5]) cylinder(g,.1,3.8,[x,1.9,5.5],dark)
 for(const x of [-4.6,-1.8,3.8]) {box(g,[2.4,2,.14],[x,2.2,4.05],dark);box(g,[2.16,1.8,.15],[x,2.2,4.14],glass);box(g,[.06,1.8,.17],[x,2.2,4.2],metal)}
 box(g,[1.5,2.8,.18],[1,1.6,4.12],teal);box(g,[1.25,1.7,.2],[1,2,4.15],glass)
 box(g,[8,.6,.12],[-1,3.7,4.15],teal)
 for(const x of [-6.8,6.8]) box(g,[.3,1.4,1.2],[x,2,-1],white)
 box(g,[4,.2,1.5],[1,.15,5.8],concrete)
 return g
}
function maintenance() {
  const g = new THREE.Group(); g.name = 'Maintenance service vehicle and equipment'
  box(g, [2.2, 1.9, 4.7], [0, 1.7, 0], white)
  box(g, [1.9, .72, .06], [0, 2.05, 2.38], glass)
  for (const x of [-1.12, 1.12]) {
    box(g, [.04, .24, 4.6], [x, 1.35, 0], teal)
    for (const z of [-1.45, 1.45]) { cylinder(g, .45, .23, [x, .57, z], rubber, [0, 0, Math.PI / 2]); cylinder(g, .21, .25, [x, .57, z], metal, [0, 0, Math.PI / 2]) }
  }
  box(g, [1.9, .13, 3.4], [0, 2.85, -.25], metal)
  for (const z of [-1.8, 1.3]) box(g, [2.1, .14, .13], [0, 2.98, z], dark)
  cylinder(g, .11, 3.6, [-.55, 3.15, -.2], metal, [Math.PI / 2, 0, 0])
  cylinder(g, .11, 3.6, [.55, 3.15, -.2], metal, [Math.PI / 2, 0, 0])
  for (let i = 0; i < 7; i++) box(g, [1.1, .06, .06], [0, 3.15, -1.7 + .5 * i], metal)
  return g
}
function equipment() {
  const g = new THREE.Group(); g.name = 'Maintenance equipment and worker'
  // Properly proportioned safety cones, tool chest, and human silhouette in workwear.
  for (const x of [-2.6, 2.6]) {
    box(g, [.7, .07, .7], [x, .04, 0], rubber)
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.27, .85, 24), orange); cone.position.set(x, .5, 0); g.add(cone)
    cylinder(g, .18, .16, [x, .6, 0], white)
  }
  box(g, [1.3, .65, .8], [1, .34, .5], teal)
  box(g, [1.4, .08, .9], [1, .7, .5], dark)
  for (const x of [-.18, .18]) { cylinder(g, .105, .8, [x, .5, .4], dark); box(g, [.24, .15, .4], [x, .12, .52], rubber) }
  box(g, [.52, .65, .3], [0, 1.18, .4], orange)
  sphere(g, .19, [0, 1.75, .4], mat('Worker skin', '#9a785c'))
  sphere(g, .22, [0, 1.88, .4], white, [1, .6, 1])
  for (const x of [-.35, .35]) cylinder(g, .08, .62, [x, 1.16, .4], orange, [0, 0, x > 0 ? .2 : -.2])
  box(g, [.54, .1, .32], [0, 1.25, .4], white)
  return g
}

async function exportAsset(name, root) {
  root.updateMatrixWorld(true)
  const batches = new Map()
  root.traverse(node => { if (node.isMesh) { const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld); if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2)); const geometries = batches.get(node.material) ?? []; geometries.push(geometry); batches.set(node.material, geometries) } })
  const merged = new THREE.Group(); merged.name = root.name
  let triangles = 0
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries.map(g => g.index ? g.toNonIndexed() : g))
    triangles += geometry.attributes.position.count / 3
    const mesh = new THREE.Mesh(geometry, material); mesh.name = material.name; merged.add(mesh)
  }
  const data = await new GLTFExporter().parseAsync(merged, { binary: true })
  await writeFile(new URL(`../public/models/${name}.glb`, import.meta.url), Buffer.from(data))
  return { file: `${name}.glb`, bytes: data.byteLength, triangles, drawCalls: batches.size, original: true }
}
await mkdir(new URL('../public/models/', import.meta.url), { recursive: true })
const manifest = []
for (const [name, make] of [['house', house], ['tanker', tanker], ['palm', palm], ['maintenance', maintenance], ['equipment', equipment], ['office', office]]) manifest.push(await exportAsset(name, make()))
await writeFile(new URL('../public/models/manifest.json', import.meta.url), JSON.stringify({ author: 'NouDilo project', license: 'CC0-1.0', generator: 'scripts/generate-assets.mjs', assets: manifest }, null, 2))
console.log(JSON.stringify(manifest, null, 2))
