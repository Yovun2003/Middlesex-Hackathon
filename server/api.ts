import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import { reduceNouDilo, type Action, type Notice, type State } from '../src/model.ts'
import { authenticate, createSession, getAccount, openDatabase, readState, register, revokeSession, type Account } from './db.ts'
import { readAction, record, text } from './actions.ts'

const coordinatorActions = new Set<Action['type']>([
  'verifyReport', 'assignTanker', 'publishDelivery', 'verifyRestoration', 'assignCrew', 'verifyRepair', 'publishNotice',
])

function canAct(account: Account, action: Action, state: State) {
  if (account.role === 'resident') return action.type === 'submitReport'
  if (account.role === 'coordinator') return coordinatorActions.has(action.type)
  switch (action.type) {
    case 'advanceTanker':
    case 'recordProblem':
    case 'recordDelivery':
      return state.tankers.some(item => item.id === action.id && item.vehicleId === account.resource)
    case 'startRepair':
    case 'inspectRepair':
    case 'submitRepair':
      return state.repairs.some(item => item.id === action.id && item.crew === account.resource)
    default:
      return false
  }
}

function projectState(db: DatabaseSync, state: State, account?: Account): State {
  if (account?.role === 'coordinator') return state
  const safe = {
    ...state, audit: [], repairs: [], reports: [],
    leaks: state.leaks.map(leak => ({ ...leak, location: '' })),
    tankers: state.tankers.map(item => ({
      id: item.id, incidentId: item.incidentId,
      status: item.status === 'published' ? 'published' as const : 'assigned' as const,
      actualLitres: item.status === 'published' ? item.actualLitres : undefined,
      approvedLitres: 0, vehicleId: '', destination: '', issues: [],
    })),
  }
  if (account?.role === 'resident') {
    const ids = new Set(db.prepare('SELECT report FROM owners WHERE account = ?').all(account.id).map(row => row.report))
    return { ...safe, reports: state.reports.filter(item => ids.has(item.id)) }
  }
  if (account?.role === 'worker') {
    const tankers = state.tankers.filter(item => item.vehicleId === account.resource)
    const repairs = state.repairs.filter(item => item.crew === account.resource)
    return {
      ...safe, tankers, repairs,
      shortages: safe.shortages.filter(item => tankers.some(tanker => tanker.incidentId === item.id)),
      leaks: state.leaks.filter(item => repairs.some(repair => repair.leakId === item.id)),
    }
  }
  return { ...safe, tankers: safe.tankers.filter(item => item.status === 'published') }
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(data))
}

async function readBody(req: IncomingMessage) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('Send JSON.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1_650_000) throw new Error('The request is too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function setCookie(res: ServerResponse, token: string, maxAge: number) {
  const secure = process.env.NOU_SECURE_COOKIE === '1' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `noudilo_session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${secure}`)
}

export function createApi() {
  const db = openDatabase()
  const attempts = new Map<string, { until: number; count: number }>()
  const resources = () => db.prepare("SELECT DISTINCT resource FROM accounts WHERE role = 'worker'").all().map(row => row.resource)

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const path = req.url?.split('?')[0]
    const token = /(?:^|;\s*)noudilo_session=([\w-]+)(?:;|$)/.exec(req.headers.cookie ?? '')?.[1] ?? ''
    const account = getAccount(db, token)
    function snapshot(forAccount = account) {
      const state = readState(db)
      return {
        account: forAccount ?? null,
        state: projectState(db, state, forAccount),
        publicState: forAccount && forAccount.role !== 'resident' ? projectState(db, state) : undefined,
        resources: forAccount?.role === 'coordinator' ? resources() : undefined,
      }
    }

    if (req.method === 'GET' && path === '/api/state') return json(res, 200, snapshot())
    if (req.method !== 'POST') return json(res, 404, { message: 'Endpoint unavailable.' })

    const origin = req.headers.origin
    if (origin && new URL(origin).host !== req.headers.host)
      return json(res, 403, { message: 'This request came from a different site.' })
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { message: 'Use the NouDilo site to continue.' })

    const input = await readBody(req)
    if (path === '/api/logout') {
      revokeSession(db, token)
      setCookie(res, '', 0)
      return json(res, 200, { account: null, state: projectState(db, readState(db)) })
    }

    if (path === '/api/login' || path === '/api/register') {
      const ip = req.socket.remoteAddress ?? ''
      const now = Date.now()
      for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key)
      const slot = attempts.get(ip) ?? { until: now + 60_000, count: 0 }
      attempts.set(ip, slot)
      if (++slot.count > 15) return json(res, 429, { message: 'Too many attempts. Try again in a minute.' })
      const data = record(input)
      const email = text(data.email, 160).toLowerCase()
      const password = data.password
      if (typeof password !== 'string' || !password || password.length > 128)
        return json(res, 400, { message: 'Enter your email and password.' })
      let next: Account | undefined
      if (path === '/api/register') {
        try { next = register(db, email, password, 'resident', null) }
        catch (error) {
          if (error instanceof Error && error.message.includes('UNIQUE')) return json(res, 409, { message: 'This email already has an account.' })
          throw error
        }
      } else {
        next = authenticate(db, email, password)
        if (!next) return json(res, 401, { message: 'Email or password was incorrect.' })
      }
      revokeSession(db, token)
      setCookie(res, createSession(db, next), 8 * 3600)
      return json(res, 200, snapshot(next))
    }

    if (path !== '/api/actions') return json(res, 404, { message: 'Endpoint unavailable.' })
    if (!account) return json(res, 401, { message: 'Sign in before continuing.' })
    const action = readAction(input)
    let notice: Notice | null
    db.exec('BEGIN IMMEDIATE')
    try {
      const state = readState(db)
      if (!canAct(account, action, state)) {
        db.exec('ROLLBACK')
        return json(res, 403, { message: 'Your account does not have permission for this operation.' })
      }
      const resource = action.type === 'assignCrew' ? action.crew : action.type === 'assignTanker' ? action.vehicleId : undefined
      if (resource && !resources().includes(resource)) {
        db.exec('ROLLBACK')
        return json(res, 409, { message: 'This vehicle or crew needs an active worker account before assignment.' })
      }
      const result = reduceNouDilo({ state, notice: null }, action)
      if (result.notice?.error) {
        db.exec('ROLLBACK')
        return json(res, 409, result.notice)
      }
      if (action.type === 'submitReport') db.prepare('INSERT INTO owners VALUES (?, ?)').run(action.report.id, account.id)
      if (result.state.audit[0]) result.state.audit[0] = { ...result.state.audit[0], actor: account.email }
      db.prepare('UPDATE operations SET document = ? WHERE id = 1').run(JSON.stringify(result.state))
      notice = result.notice
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return json(res, 200, { ...snapshot(), notice })
  }

  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/')) return next()
    void handle(req, res).catch(error => {
      if (res.headersSent || res.destroyed) return
      const message = error instanceof Error ? error.message : ''
      const internal = message.includes('SQLITE') || message.includes('constraint') || message.includes('database')
      if (internal) console.error('NouDilo database operation failed:', message)
      json(res, internal ? 500 : 400, { message: internal ? 'The service could not save this request.' : message || 'The request could not be read.' })
    })
  }
}
