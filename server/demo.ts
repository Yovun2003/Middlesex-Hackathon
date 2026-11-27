import { randomBytes } from 'node:crypto'
import { CREWS, FLEET } from '../src/model.ts'
import { provision, stateFrom, type Persistence } from './persistence.ts'

export async function seedDemo(repository: Persistence) {
  const password = process.env.NOU_DEMO_PASSWORD ?? randomBytes(24).toString('base64url')
  const accounts = [['resident', 'resident', null], ['neighbour', 'resident', null], ['coordinator', 'coordinator', null], ['driver', 'worker', 'WT-04'], ['crew', 'worker', 'Central maintenance crew']] as const
  for (const [name, role, resource] of accounts) {
    const email = `${name}@demo.noudilo.test`
    const exists = await repository.read(tx => tx.rows('SELECT id FROM accounts WHERE email = :email', { email }))
    if (!exists.length) await provision(repository, email, password, role, resource)
  }
  await repository.write(async tx => {
    const state = await stateFrom(tx)
    if (state.reports.length || state.shortages.length || state.leaks.length) return
    const at = new Date().toISOString()
    const [neighbour] = await tx.rows('SELECT id FROM accounts WHERE email = :email', { email: 'neighbour@demo.noudilo.test' })
    state.inventory = { waterAvailable: 28_000, fleet: FLEET, crews: CREWS }
    state.shortages = [{ id: 'INC-DEMO-CP', town: 'Curepipe', status: 'critical', priority: 'High', households: 8, estimatedLitres: 4_000, summary: 'Demonstration: a reviewed shortage affecting the Curepipe community.' }]
    state.reports = [{ id: 'ND-DE001001', type: 'shortage', town: 'Curepipe', condition: 'No running water', duration: '12–24 hours', households: 8, description: 'Demonstration: a neighbouring household has already reported the shortage.', createdAt: at, source: 'sample', status: 'verified', incidentId: 'INC-DEMO-CP' }]
    state.audit = [{ id: 'AUD-DEMO-CP', at, actor: 'coordinator@demo.noudilo.test', subjectId: 'INC-DEMO-CP', role: 'Coordinator', note: 'Demonstration seed: reviewed initial Curepipe community shortage.' }]
    await tx.saveState(state)
    await tx.run('INSERT INTO owners (report,account) VALUES (:report,:account)', { report: 'ND-DE001001', account: String(neighbour.id) })
  })
}
