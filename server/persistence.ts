import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { openDatabase, type Account, type AccountRole } from './db.ts'
import type { State } from '../src/model.ts'

export type Row = Record<string, unknown>
type Params = Record<string, string | number | null>
export interface Transaction {
  rows(sql: string, params?: Params): Promise<Row[]>
  run(sql: string, params?: Params): Promise<void>
  saveState(state: State): Promise<void>
}
export interface Persistence {
  kind: 'sqlite' | 'oracle'
  read<T>(operation: (tx: Transaction) => Promise<T>): Promise<T>
  write<T>(operation: (tx: Transaction) => Promise<T>): Promise<T>
  close(): Promise<void>
}
export const emptyState = (): State => ({ schema: 1, reports: [], shortages: [], leaks: [], tankers: [], repairs: [], audit: [], notices: [] })
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
export function passwordRecord(password: string) {
  if (password.length < 12 || password.length > 128) throw new Error('Use a password of 12 to 128 characters.')
  const salt = randomBytes(24).toString('hex')
  return { salt, password_hash: scryptSync(password, salt, 64).toString('hex') }
}
export function passwordMatches(password: string, record?: Row) {
  const actual = scryptSync(password, String(record?.salt ?? 'no-account'), 64)
  return !!record && timingSafeEqual(actual, Buffer.from(String(record.password_hash), 'hex'))
}
export function publicAccount(row: Row): Account {
  return { id: String(row.id), email: String(row.email), role: row.role as AccountRole, resource: row.resource ? String(row.resource) : null }
}
export async function stateFrom(tx: Transaction) {
  const [row] = await tx.rows('SELECT document FROM operations WHERE id = 1')
  return row ? JSON.parse(String(row.document)) as State : emptyState()
}

export function sqlitePersistence(directory?: string): Persistence {
  // Preserve the established local database and accounts.
  const previous = process.env.NOU_DATA_DIR
  if (directory) process.env.NOU_DATA_DIR = directory
  const db = openDatabase()
  if (directory) { if (previous === undefined) delete process.env.NOU_DATA_DIR; else process.env.NOU_DATA_DIR = previous }
  db.exec(`CREATE TABLE IF NOT EXISTS idempotency (
    actor TEXT NOT NULL, request_key TEXT NOT NULL, payload_hash TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY(actor, request_key)
  ); CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
  )`)
  const tx: Transaction = {
    rows: async (sql, params = {}) => db.prepare(sql).all(params) as Row[],
    run: async (sql, params = {}) => { db.prepare(sql).run(params) },
    saveState: async state => { db.prepare('UPDATE operations SET document = ? WHERE id = 1').run(JSON.stringify(state)) },
  }
  let queue = Promise.resolve()
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation)
    queue = result.then(() => {}, () => {})
    return result
  }
  return {
    kind: 'sqlite',
    read: operation => serial(() => operation(tx)),
    write: operation => serial(async () => {
      db.exec('BEGIN IMMEDIATE')
      try { const result = await operation(tx); db.exec('COMMIT'); return result }
      catch (error) { db.exec('ROLLBACK'); throw error }
    }),
    close: async () => { await queue; db.close() },
  }
}

const oracleNames: Record<string, string> = { accounts: 'ND_ACCOUNT', sessions: 'ND_SESSION', owners: 'ND_OWNER', operations: 'ND_STATE', idempotency: 'ND_IDEMPOTENCY', notifications: 'ND_NOTIFICATION' }
function oracleSql(sql: string) {
  return sql.replace(/\b(accounts|sessions|owners|operations|idempotency|notifications)\b/g, name => oracleNames[name]).replace(/\bresource\b/g, 'resource_key').replace(/\brole\b/g, 'role_code')
}
const oracleParams = (params: Params) => Object.fromEntries(Object.entries(params).map(([key, value]) => [key === 'resource' ? 'resource_key' : key === 'role' ? 'role_code' : key, value]))

export async function oraclePersistence(): Promise<Persistence> {
  const { default: oracle } = await import('oracledb')
  for (const key of ['NOU_ORACLE_USER', 'NOU_ORACLE_PASSWORD', 'NOU_ORACLE_CONNECT_STRING']) {
    if (!process.env[key]) throw new Error(`Oracle mode requires ${key}; it never silently falls back to SQLite.`)
  }
  oracle.fetchAsString = [oracle.CLOB]
  const pool = await oracle.createPool({
    user: process.env.NOU_ORACLE_USER, password: process.env.NOU_ORACLE_PASSWORD,
    connectString: process.env.NOU_ORACLE_CONNECT_STRING,
    walletLocation: process.env.NOU_ORACLE_WALLET_DIR || undefined,
    walletPassword: process.env.NOU_ORACLE_WALLET_PASSWORD || undefined,
    configDir: process.env.NOU_ORACLE_WALLET_DIR || undefined,
    poolMin: 0, poolMax: Number(process.env.NOU_ORACLE_POOL_MAX ?? 4), poolIncrement: 1,
  })
  async function withConnection<T>(write: boolean, operation: (tx: Transaction) => Promise<T>) {
    const connection = await pool.getConnection()
    const tx: Transaction = {
      rows: async (sql, params = {}) => {
        const result = await connection.execute<Row>(oracleSql(sql), oracleParams(params), { outFormat: oracle.OUT_FORMAT_OBJECT })
        return (result.rows ?? []).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase() === 'resource_key' ? 'resource' : key.toLowerCase() === 'role_code' ? 'role' : key.toLowerCase(), value])))
      },
      run: async (sql, params = {}) => { await connection.execute(oracleSql(sql), oracleParams(params)) },
      saveState: async state => {
        await connection.execute('UPDATE ND_STATE SET document = :document WHERE id = 1', { document: JSON.stringify(state) })
        // Queryable entity projections are updated in the same transaction as the canonical state.
        const entities: Array<[string, { id: string }[]]> = [
          ['ResidentReports', state.reports], ['CommunityIncidents', [...state.shortages, ...state.leaks]],
          ['Assignments', state.tankers], ['RepairWorkOrders', state.repairs], ['AuditLogs', state.audit], ['CommunityNotices', state.notices],
          ['IncidentReportLinks', state.reports.filter(r => r.incidentId).map(r => ({ id: r.id, reportId: r.id, incidentId: r.incidentId }))],
          ['WaterDeliveries', state.tankers.filter(a => a.actualLitres !== undefined).map(a => ({ id: a.id, assignmentId: a.id, actualLitres: a.actualLitres, status: a.status }))],
          ['RepairEvidence', state.repairs.filter(r => r.evidence).map(r => ({ id: r.id, evidence: r.evidence }))],
          ['IncidentStatusHistory', state.audit],
          ['Tankers', state.inventory?.fleet ?? []],
          ['MaintenanceCrews', (state.inventory?.crews ?? []).map((name, i) => ({ id: `CREW-${i}`, name }))],
        ]
        for (const [kind, rows] of entities) {
          if (!rows.length) continue
          await connection.executeMany(`MERGE INTO ND_RECORD r USING (SELECT :kind kind, :id id FROM dual) s
            ON (r.kind = s.kind AND r.id = s.id) WHEN MATCHED THEN UPDATE SET r.document = :document
            WHEN NOT MATCHED THEN INSERT (kind, id, document) VALUES (:kind, :id, :document)`, rows.map(row => ({ kind, id: row.id, document: JSON.stringify(row) })),
          { bindDefs: { kind: { type: oracle.STRING, maxSize: 40 }, id: { type: oracle.STRING, maxSize: 80 }, document: { type: oracle.CLOB } } })
        }
      },
    }
    try {
      if (write) await connection.execute('SELECT id FROM ND_STATE WHERE id = 1 FOR UPDATE WAIT 10')
      const result = await operation(tx)
      if (write) await connection.commit()
      return result
    } catch (error) { if (write) await connection.rollback(); throw error }
    finally { await connection.close() }
  }
  // Fail at startup when the migration has not been applied.
  await withConnection(false, tx => tx.rows('SELECT id FROM operations WHERE id = 1'))
  return { kind: 'oracle', read: operation => withConnection(false, operation), write: operation => withConnection(true, operation), close: () => pool.close(5) }
}

export async function createPersistence() {
  if (process.env.NOU_DATABASE === 'oracle') return oraclePersistence()
  return sqlitePersistence()
}

export async function provision(repository: Persistence, email: string, password: string, role: AccountRole, resource: string | null) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new Error('Enter a valid email address.')
  return repository.write(async tx => {
    const existing = await tx.rows('SELECT id FROM accounts WHERE email = :email', { email: email.toLowerCase() })
    if (existing.length) throw Object.assign(new Error('This email already has an account.'), { statusCode: 409 })
    const account = { id: randomUUID(), email: email.toLowerCase(), role, resource }
    await tx.run('INSERT INTO accounts (id,email,role,resource,salt,password_hash) VALUES (:id,:email,:role,:resource,:salt,:password_hash)', { ...account, ...passwordRecord(password) })
    return account
  })
}
