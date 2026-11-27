import { Vector3 } from 'three'
import { getPlace, terrainPosition } from '../geo'
import { TOWNS } from '../model'

export const WORLD_SCALE = 100
export const townXZ = (town: string): [number, number] => {
  const [x, z] = terrainPosition(getPlace(town) ?? getPlace('Curepipe')!)
  return [x * WORLD_SCALE, z * WORLD_SCALE]
}
export type Elevation = { width: number; height: number; data: Uint8ClampedArray }
export function rawHeight(field: Elevation, x: number, z: number) {
  const col = Math.max(0, Math.min(field.width - 1, Math.round((x / 926 + .5) * (field.width - 1))))
  const row = Math.max(0, Math.min(field.height - 1, Math.round((z / 1086 + .5) * (field.height - 1))))
  const index = (row * field.width + col) * 4
  return (field.data[index] * 256 + field.data[index + 1]) / 16 * .085
}
export function surfaceHeight(field: Elevation, x: number, z: number) {
  let height = rawHeight(field, x, z)
  for (const town of TOWNS) {
    const [tx, tz] = townXZ(town)
    const distance = Math.hypot(x - tx, z - tz)
    if (distance > 78) continue
    const blend = 1 - Math.min(1, Math.max(0, (distance - 46) / 32))
    height += (rawHeight(field, tx, tz) - height) * blend * blend * (3 - 2 * blend)
    // An excavated service trench is part of the same terrain mesh.
    if (Math.abs(x - tx) < 13 && Math.abs(z - tz - 18) < 5) height -= 4
  }
  return height
}
export function townOrigin(field: Elevation, town: string) {
  const [x, z] = townXZ(town)
  return new Vector3(x, rawHeight(field, x, z) + .65, z)
}
