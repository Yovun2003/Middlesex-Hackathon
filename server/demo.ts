import { CREWS, FLEET } from '../src/model.ts'
import { passwordMatches, passwordRecord, provision, stateFrom, type Persistence } from './persistence.ts'

export async function seedDemo(repository: Persistence) {
  const password = 'Randnousdilo'
  const accounts = [['admin', 'coordinator', null], ['worker', 'worker', 'Central maintenance crew'], ['resident', 'resident', null], ['neighbour', 'resident', null], ['coordinator', 'coordinator', null], ['driver', 'worker', 'WT-04'], ['crew', 'worker', 'Central maintenance crew']] as const
  for (const [name, role, resource] of accounts) {
    const email = `${name}@demo.noudilo.test`
    const exists = await repository.read(tx => tx.rows('SELECT id,salt,password_hash FROM accounts WHERE email = :email', { email }))
    if (!exists.length) await provision(repository, email, password, role, resource)
    else if (!passwordMatches(password, exists[0])) await repository.write(tx => tx.run('UPDATE accounts SET salt = :salt, password_hash = :password_hash WHERE id = :id', { ...passwordRecord(password), id: String(exists[0].id) }))
  }
  await repository.write(async tx => {
    const state = await stateFrom(tx)
    if (state.reports.length || state.shortages.length || state.leaks.length) return
    const at = new Date().toISOString()
    const [neighbour] = await tx.rows('SELECT id FROM accounts WHERE email = :email', { email: 'neighbour@demo.noudilo.test' })
    state.inventory = { waterAvailable: 28_000, fleet: FLEET, crews: CREWS }
    state.shortages = [{ id: 'INC-DEMO-CP', town: 'Curepipe', status: 'critical', priority: 'High', households: 8, estimatedLitres: 4_000, summary: 'Demonstration: a reviewed shortage affecting the Curepipe community.' }]
    state.reports = [{ id: 'ND-DE001001', type: 'shortage', town: 'Curepipe', condition: 'No running water', duration: '12–24 hours', households: 8, description: 'Demonstration: a neighbouring household has already reported the shortage.', createdAt: at, source: 'sample', status: 'verified', incidentId: 'INC-DEMO-CP' }]
    state.audit = [{ id: 'AUD-DEMO-CP', at, actor: 'admin@demo.noudilo.test', subjectId: 'INC-DEMO-CP', role: 'Coordinator', note: 'Demonstration seed: reviewed initial Curepipe community shortage.' }]
    await tx.saveState(state)
    await tx.run('INSERT INTO owners (report,account) VALUES (:report,:account)', { report: 'ND-DE001001', account: String(neighbour.id) })
  })
}
