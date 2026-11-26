import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { State } from '../src/model.ts'

export type AccountRole = 'resident' | 'coordinator' | 'worker'
export type Account = { id: string; email: string; role: AccountRole; resource: string | null }
type StoredAccount = Account & { salt: string; password_hash: string }

const empty: State = { schema: 1, reports: [], shortages: [], leaks: [], tankers: [], repairs: [], audit: [], notices: [] }
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const hash = (password: string, salt: string) => scryptSync(password, salt, 64)

export function openDatabase() {
  const dir = resolve(process.env.NOU_DATA_DIR || '.noudilo')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(resolve(dir, 'noudilo.sqlite'))
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 4000;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL
        CHECK (role IN ('resident', 'coordinator', 'worker')),
      resource TEXT, salt TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS worker_resource ON accounts(resource) WHERE role = 'worker';
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS owners (
      report TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id)
    );
    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL
    );
  `)
  db.prepare('INSERT OR IGNORE INTO operations VALUES (1, ?)').run(JSON.stringify(empty))
  return db
}

export function register(db: DatabaseSync, email: string, password: string, role: AccountRole, resource: string | null): Account {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160 || password.length < 12 || password.length > 128)
    throw new Error('Enter a valid email address and a password of 12 to 128 characters.')
  const salt = randomBytes(24).toString('hex')
  const account = { id: randomUUID(), email: email.toLowerCase(), role, resource }
  db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)').run(
    account.id, account.email, role, resource, salt, hash(password, salt).toString('hex'),
  )
  return account
}

export function authenticate(db: DatabaseSync, email: string, password: string): Account | undefined {
  const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email.toLowerCase()) as StoredAccount | undefined
  const computed = hash(password, account?.salt ?? 'no-account')
  if (!account || !timingSafeEqual(computed, Buffer.from(account.password_hash, 'hex'))) return
  const { id, role, resource } = account
  return { id, email: account.email, role, resource }
}

export function createSession(db: DatabaseSync, account: Account) {
  const token = randomBytes(32).toString('base64url')
  db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now())
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), account.id, Date.now() + 8 * 3_600_000)
  return token
}

export function getAccount(db: DatabaseSync, token: string): Account | undefined {
  if (!/^[\w-]{43}$/.test(token)) return
  return db.prepare(`
    SELECT a.id, a.email, a.role, a.resource FROM sessions s
    JOIN accounts a ON a.id = s.account WHERE s.token = ? AND s.expires > ?
  `).get(digest(token), Date.now()) as Account | undefined
}

export function revokeSession(db: DatabaseSync, token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(digest(token))
}

export function readState(db: DatabaseSync): State {
  const row = db.prepare('SELECT document FROM operations WHERE id = 1').get()
  return JSON.parse(String(row?.document)) as State
}
