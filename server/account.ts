import { createPersistence, provision, stateFrom } from './persistence.ts'
import { crewsFor, fleetFor } from '../src/model.ts'

const [role, email, resource] = process.argv.slice(2)
if ((role !== 'coordinator' && role !== 'worker') || !email || (role === 'coordinator' && resource)) throw new Error('Usage: npm run account -- coordinator email | worker email "vehicle ID or crew name"')
const repository = await createPersistence()
try {
  if (role === 'worker') {
    const state = await repository.read(stateFrom)
    if (!fleetFor(state).some(v => v.id === resource) && !crewsFor(state).includes(resource)) throw new Error('Configure this vehicle or crew in the inventory before provisioning its worker account.')
  }
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  const password = input.replace(/\r?\n$/, '')
  const account = await provision(repository, email, password, role, resource ?? null)
  console.log(`Created ${account.role} account ${account.email}${account.resource ? ` for ${account.resource}` : ''} in ${repository.kind}.`)
} finally { await repository.close() }
