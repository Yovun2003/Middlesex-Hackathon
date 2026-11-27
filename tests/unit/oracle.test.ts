import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ execute: vi.fn(), executeMany: vi.fn(), commit: vi.fn(), rollback: vi.fn(), close: vi.fn(), poolClose: vi.fn(), createPool: vi.fn() }))
vi.mock('oracledb', () => ({ default: { CLOB: 2017, STRING: 2001, OUT_FORMAT_OBJECT: 4002, fetchAsString: [], createPool: fake.createPool } }))
import { emptyState, oraclePersistence } from '../../server/persistence'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NOU_ORACLE_USER', 'test_user'); vi.stubEnv('NOU_ORACLE_PASSWORD', 'test_password'); vi.stubEnv('NOU_ORACLE_CONNECT_STRING', 'database.example.test/service')
  fake.execute.mockResolvedValue({ rows: [{ ID: 1 }] }); fake.executeMany.mockResolvedValue({ rowsAffected: 1 })
  fake.createPool.mockResolvedValue({ getConnection: async () => ({ execute: fake.execute, executeMany: fake.executeMany, commit: fake.commit, rollback: fake.rollback, close: fake.close }), close: fake.poolClose })
})
afterEach(() => vi.unstubAllEnvs())
describe('Oracle adapter contract (connection stub, no live database)', () => {
  it('locks the canonical row and commits entity projections in the same transaction', async () => {
    const repository = await oraclePersistence()
    const state = emptyState(); state.reports.push({ id: 'ND-AA000001', type: 'shortage', town: 'Curepipe', condition: 'No running water', description: '', status: 'received', source: 'resident', createdAt: '2026-11-27T00:00:00Z' })
    await repository.write(async tx => { await tx.saveState(state) })
    expect(fake.execute.mock.calls.some(([sql]) => sql.includes('FOR UPDATE WAIT 10'))).toBe(true)
    expect(fake.executeMany.mock.calls[0][0]).toContain('MERGE INTO ND_RECORD')
    expect(fake.executeMany.mock.calls[0][1][0].kind).toBe('ResidentReports')
    expect(fake.commit).toHaveBeenCalledOnce(); expect(fake.rollback).not.toHaveBeenCalled()
    await repository.close(); expect(fake.poolClose).toHaveBeenCalledWith(5)
  })
  it('rolls back a failed command and always returns the connection', async () => {
    const repository = await oraclePersistence()
    await expect(repository.write(async tx => { await tx.run('UPDATE operations SET document = :document WHERE id = 1', { document: '{}' }); throw new Error('Rejected command') })).rejects.toThrow('Rejected command')
    expect(fake.rollback).toHaveBeenCalledOnce(); expect(fake.commit).not.toHaveBeenCalled(); expect(fake.close).toHaveBeenCalledTimes(2)
    await repository.close()
  })
  it('keeps untrusted values in bind parameters and normalises returned column names', async () => {
    const repository = await oraclePersistence(); fake.execute.mockResolvedValueOnce({ rows: [{ EMAIL: 'person@example.test' }] })
    const email = "person' OR '1'='1"
    const result = await repository.read(tx => tx.rows('SELECT email FROM accounts WHERE email = :email', { email }))
    expect(fake.execute.mock.calls.at(-1)?.slice(0, 2)).toEqual(['SELECT email FROM ND_ACCOUNT WHERE email = :email', { email }])
    expect(result).toEqual([{ email: 'person@example.test' }]); await repository.close()
  })
  it('refuses Oracle mode with missing configuration instead of using local data', async () => {
    vi.stubEnv('NOU_ORACLE_PASSWORD', '')
    await expect(oraclePersistence()).rejects.toThrow('NOU_ORACLE_PASSWORD')
    expect(fake.createPool).not.toHaveBeenCalled()
  })
  it('maps account resource identifiers and bind names away from Oracle reserved words', async () => {
    const repository = await oraclePersistence(); fake.execute.mockResolvedValueOnce({ rows: [{ ROLE_CODE: 'worker', RESOURCE_KEY: 'WT-04' }] })
    const rows = await repository.read(tx => tx.rows('SELECT role,resource FROM accounts WHERE resource = :resource AND role = :role', { resource: 'WT-04', role: 'worker' }))
    expect(fake.execute.mock.calls.at(-1)?.slice(0, 2)).toEqual(['SELECT role_code,resource_key FROM ND_ACCOUNT WHERE resource_key = :resource_key AND role_code = :role_code', { resource_key: 'WT-04', role_code: 'worker' }])
    expect(rows).toEqual([{ role: 'worker', resource: 'WT-04' }]); await repository.close()
  })
})
