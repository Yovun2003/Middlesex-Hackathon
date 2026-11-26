import { CREWS, FLEET } from '../src/model.ts'
import { openDatabase, register } from './db.ts'

const [role, email, resource] = process.argv.slice(2)
if ((role !== 'coordinator' && role !== 'worker') || !email || (role === 'coordinator' && resource) ||
  (role === 'worker' && !FLEET.some(item => item.id === resource) && !CREWS.some(item => item === resource))) {
  console.error('Usage: npm run account -- coordinator email | worker email "vehicle ID or crew name"')
  console.error('Vehicle IDs:', FLEET.map(item => item.id).join(', '))
  console.error('Crews:', CREWS.join(', '))
  process.exit(1)
}
let input = ''
for await (const chunk of process.stdin) input += chunk
const password = input.replace(/\r?\n$/, '')
const db = openDatabase()
try {
  const account = register(db, email, password, role, resource ?? null)
  console.log(`Created ${account.role} account ${account.email}${account.resource ? ` for ${account.resource}` : ''}.`)
} finally {
  db.close()
}
