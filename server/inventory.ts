import { readFile } from 'node:fs/promises'
import { createPersistence, stateFrom } from './persistence.ts'

const path = process.argv[2]
if (!path) throw new Error('Usage: npm run inventory -- /path/to/inventory.json')
const inventory = JSON.parse(await readFile(path, 'utf8'))
if (!Number.isInteger(inventory.waterAvailable) || inventory.waterAvailable < 0 || !Array.isArray(inventory.fleet) || !Array.isArray(inventory.crews) || inventory.fleet.some((v: { id: string; name: string; capacity: number }) => !v.id || !v.name || !Number.isInteger(v.capacity) || v.capacity < 1) || inventory.crews.some((c: unknown) => typeof c !== 'string' || !c.trim()) || new Set(inventory.fleet.map((v: { id: string }) => v.id)).size !== inventory.fleet.length) throw new Error('Invalid inventory: use distinct vehicle IDs, positive capacities, crew names, and a non-negative waterAvailable quantity.')
const repository = await createPersistence()
try {
  await repository.write(async tx => {
    const state = await stateFrom(tx)
    if (state.tankers.some(a => !['declined', 'published'].includes(a.status)) || state.repairs.some(r => r.status !== 'verified')) throw new Error('Finish active assignments before replacing operational inventory.')
    state.inventory = inventory
    await tx.saveState(state)
  })
  console.log(`Configured ${inventory.fleet.length} tankers and ${inventory.crews.length} crews in ${repository.kind}.`)
} finally { await repository.close() }
