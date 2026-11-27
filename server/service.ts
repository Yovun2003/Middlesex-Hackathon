import { randomBytes } from 'node:crypto'
import { reduceNouDilo, type Action, type State } from '../src/model.ts'
import type { Account } from './db.ts'
import { passwordMatches, publicAccount, stateFrom, tokenHash, type Persistence, type Transaction } from './persistence.ts'

export class ServiceError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status } }
const coordinatorActions = new Set<Action['type']>(['verifyReport', 'assignTanker', 'publishDelivery', 'verifyRestoration', 'assignCrew', 'verifyRepair', 'publishNotice'])
export function canAct(account: Account, action: Action, state: State) {
  if (account.role === 'resident') return action.type === 'submitReport'
  if (account.role === 'coordinator') return coordinatorActions.has(action.type)
  if (['advanceTanker', 'declineTanker', 'recordProblem', 'recordDelivery'].includes(action.type))
    return 'id' in action && state.tankers.some(a => a.id === action.id && a.vehicleId === account.resource)
  if (['startRepair', 'inspectRepair', 'submitRepair'].includes(action.type))
    return 'id' in action && state.repairs.some(a => a.id === action.id && a.crew === account.resource)
  return false
}

export function projectState(state: State, ownedIds: Set<string>, account?: Account | null): State {
  if (account?.role === 'coordinator') return state
  const safe = {
    ...state, audit: [], repairs: [], reports: [],
    leaks: state.leaks.map(leak => ({ ...leak, location: '' })),
    tankers: state.tankers.filter(a => a.status !== 'declined').map(a => ({ id: a.id, incidentId: a.incidentId, status: a.status === 'published' ? 'published' as const : 'assigned' as const, actualLitres: a.status === 'published' ? a.actualLitres : undefined, approvedLitres: 0, vehicleId: '', destination: '', issues: [] })),
  }
  if (account?.role === 'resident') {
    const reports = state.reports.filter(r => ownedIds.has(r.id))
    const linked = new Set(reports.map(r => r.incidentId))
    // Owners may follow recorded task milestones. Unreviewed quantities and worker details remain private.
    const tankers = safe.tankers.map(a => linked.has(a.incidentId) ? { ...a, status: state.tankers.find(original => original.id === a.id)?.status ?? a.status } : a)
    return { ...safe, reports, tankers }
  }
  if (account?.role === 'worker') {
    const tankers = state.tankers.filter(a => a.vehicleId === account.resource).map(a=>({...a, coordinates: state.reports.find(r=>r.incidentId===a.incidentId && r.coordinates)?.coordinates}))
    const repairs = state.repairs.filter(a => a.crew === account.resource).map(a=>({...a, coordinates: state.reports.find(r=>r.incidentId===a.leakId && r.coordinates)?.coordinates}))
    return { ...safe, tankers, repairs, shortages: state.shortages.filter(s => tankers.some(a => a.incidentId === s.id)), leaks: state.leaks.filter(l => repairs.some(a => a.leakId === l.id)) }
  }
  return { ...safe, tankers: safe.tankers.filter(a => a.status === 'published') }
}

export function createService(repository: Persistence) {
  async function snapshot(tx: Transaction, account?: Account | null) {
    const state = await stateFrom(tx)
    const owners = account ? await tx.rows('SELECT report FROM owners WHERE account = :account', { account: account.id }) : []
    const resources = account?.role === 'coordinator' ? (await tx.rows("SELECT DISTINCT resource FROM accounts WHERE role = 'worker'")).map(r => String(r.resource)) : undefined
    const notifications = account ? await tx.rows('SELECT id, message, created_at FROM notifications WHERE account_id = :account ORDER BY created_at', { account: account.id }) : []
    return { account: account ?? null, state: projectState(state, new Set(owners.map(r => String(r.report))), account), publicState: account && account.role !== 'resident' ? projectState(state, new Set()) : undefined, resources, notifications: notifications.slice(-30).reverse(), environment: { database: repository.kind, demo: process.env.NOU_DEMO === '1', telemetry: false } }
  }
  return {
    snapshot: (account?: Account | null) => repository.read(tx => snapshot(tx, account)),
    account: (token: string) => repository.read(async tx => {
      if (!/^[\w-]{43}$/.test(token)) return null
      const [row] = await tx.rows('SELECT a.id,a.email,a.role,a.resource FROM sessions s JOIN accounts a ON a.id = s.account WHERE s.token = :token AND s.expires > :expires', { token: tokenHash(token), expires: Date.now() })
      return row ? publicAccount(row) : null
    }),
    authenticate: (email: string, password: string) => repository.read(async tx => {
      const [row] = await tx.rows('SELECT * FROM accounts WHERE email = :email', { email: email.toLowerCase() })
      return passwordMatches(password, row) ? publicAccount(row) : null
    }),
    session: (account: Account, previous: string) => repository.write(async tx => {
      const token = randomBytes(32).toString('base64url')
      await tx.run('DELETE FROM sessions WHERE expires <= :expires OR token = :token', { expires: Date.now(), token: tokenHash(previous) })
      await tx.run('INSERT INTO sessions (token,account,expires) VALUES (:token,:account,:expires)', { token: tokenHash(token), account: account.id, expires: Date.now() + 8 * 3_600_000 })
      return token
    }),
    logout: (token: string) => repository.write(tx => tx.run('DELETE FROM sessions WHERE token = :token', { token: tokenHash(token) })),
    apply: (account: Account, action: Action, requestKey: string) => repository.write(async tx => {
      const hash = tokenHash(JSON.stringify(action))
      const [prior] = await tx.rows('SELECT payload_hash,result FROM idempotency WHERE actor = :actor AND request_key = :request_key', { actor: account.id, request_key: requestKey })
      if (prior) {
        if (prior.payload_hash !== hash) throw new ServiceError(409, 'This request reference was already used for different details.')
        return { ...await snapshot(tx, account), notice: JSON.parse(String(prior.result)), replayed: true }
      }
      const state = await stateFrom(tx)
      if (!canAct(account, action, state)) throw new ServiceError(403, 'Your account does not have permission for this operation.')
      const resource = action.type === 'assignCrew' ? action.crew : action.type === 'assignTanker' ? action.vehicleId : undefined
      if (resource && !(await tx.rows("SELECT id FROM accounts WHERE role = 'worker' AND resource = :resource", { resource })).length) throw new ServiceError(409, 'This vehicle or crew needs an active worker account before assignment.')
      const result = reduceNouDilo({ state, notice: null }, action)
      if (result.notice?.error) throw new ServiceError(409, result.notice.message)
      if (action.type === 'submitReport') await tx.run('INSERT INTO owners (report,account) VALUES (:report,:account)', { report: action.report.id, account: account.id })
      const event = result.state.audit[0]
      if (event) {
        result.state.audit[0] = { ...event, actor: account.email }
        // Notify owners, without leaking a driver's private progress before publication.
        if (['verifyReport', 'assignTanker', 'assignCrew', 'publishDelivery', 'verifyRepair', 'verifyRestoration'].includes(action.type)) {
          for (const report of result.state.reports.filter(r => r.incidentId === event.subjectId)) {
            const [owner] = await tx.rows('SELECT account FROM owners WHERE report = :report', { report: report.id })
            if (owner) await tx.run('INSERT INTO notifications (id,account_id,message,created_at) VALUES (:id,:account,:message,:at)', { id: `${event.id}-${report.id}`, account: String(owner.account), message: result.notice?.message ?? event.note, at: event.at })
          }
        }
      }
      await tx.saveState(result.state)
      await tx.run('INSERT INTO idempotency (actor,request_key,payload_hash,result) VALUES (:actor,:request_key,:payload_hash,:result)', { actor: account.id, request_key: requestKey, payload_hash: hash, result: JSON.stringify(result.notice) })
      return { ...await snapshot(tx, account), notice: result.notice, replayed: false }
    }),
  }
}
