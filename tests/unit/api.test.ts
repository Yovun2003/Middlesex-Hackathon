import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { createHttpApi } from '../../server/api'
import { provision, sqlitePersistence, type Persistence } from '../../server/persistence'
import type { Action } from '../../src/model'
import { availableWater } from '../../src/model'

let app: FastifyInstance; let repository: Persistence; let directory: string
const password = 'NouDilo-test-only-password-2026'
const cookies: Record<string, string> = {}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'noudilo-test-'))
  repository = sqlitePersistence(directory)
  for (const [name, role, resource] of [['resident', 'resident', null], ['neighbour', 'resident', null], ['coordinator', 'coordinator', null], ['driver', 'worker', 'WT-04'], ['otherdriver', 'worker', 'WT-07'], ['crew', 'worker', 'Central maintenance crew']] as const) await provision(repository, `${name}@example.test`, password, role, resource)
  app = await createHttpApi({ repository, demo: false }); await app.ready()
  for (const name of ['resident', 'neighbour', 'coordinator', 'driver', 'otherdriver', 'crew']) {
    const response = await app.inject({ method: 'POST', url: '/api/login', payload: { email: `${name}@example.test`, password } })
    expect(response.statusCode).toBe(200); cookies[name] = String(response.headers['set-cookie']).split(';')[0]
  }
})
afterEach(async () => { await app?.close(); await repository?.close(); await rm(directory, { recursive: true, force: true }) })
const report = (id = 'ND-AA000001', type: 'shortage' | 'leak' = 'shortage') => ({ id, type, town: type === 'shortage' ? 'Curepipe' : 'Rose Hill', condition: type === 'shortage' ? 'No running water' : 'Heavy flow', duration: 'Over 48 hours', households: 8, description: 'A report from a test household.', location: 'Near the community centre', additionalNeeds: true })
async function act(role: string, action: Action, expected = 200, key = randomUUID()) {
  const response = await app.inject({ method: 'POST', url: '/api/actions', headers: { cookie: cookies[role], 'idempotency-key': key }, payload: action })
  expect(response.statusCode, response.body).toBe(expected)
  return response.json()
}
async function state(role?: string) { return (await app.inject({ method: 'GET', url: '/api/state', headers: role ? { cookie: cookies[role] } : {} })).json() }
async function verifiedShortage() { await act('resident', { type: 'submitReport', report: report() }); const result = await act('coordinator', { type: 'verifyReport', reportId: 'ND-AA000001', estimatedLitres: 4000 }); return result.state.shortages[0].id as string }

describe('transactional water response', () => {
  it('completes reporting, grouping, dispatch, delivery, publication and separate supply restoration', async () => {
    const incidentId = await verifiedShortage()
    await act('neighbour', { type: 'submitReport', report: report('ND-AA000002') })
    expect((await state('neighbour')).state.reports[0]).toMatchObject({ status: 'linked', incidentId })
    await act('coordinator', { type: 'verifyReport', reportId: 'ND-AA000002', estimatedLitres: 4000 })
    let result = await act('coordinator', { type: 'assignTanker', incidentId, vehicleId: 'WT-04', approvedLitres: 4000, destination: 'Curepipe community distribution point' })
    const id = result.state.tankers[0].id
    await act('driver', { type: 'advanceTanker', id, step: 'arrived' }, 409)
    await act('driver', { type: 'advanceTanker', id, step: 'accepted' })
    await act('driver', { type: 'advanceTanker', id, step: 'en-route' })
    await act('driver', { type: 'advanceTanker', id, step: 'arrived' })
    await act('driver', { type: 'recordDelivery', id, actualLitres: 3600 })
    expect((await state('resident')).state.tankers[0].actualLitres).toBeUndefined()
    expect((await state('resident')).state.tankers[0].status).toBe('delivered')
    expect((await state('resident')).state.tankers[0].vehicleId).toBe('')
    result = await act('coordinator', { type: 'publishDelivery', id })
    expect(result.state.shortages[0].status).toBe('relief-delivered')
    expect((await state('resident')).state.tankers[0].actualLitres).toBe(3600)
    expect((await state('resident')).notifications.length).toBeGreaterThan(0)
    await act('coordinator', { type: 'verifyRestoration', incidentId, evidence: 'Independent test confirms regular household supply.' })
    expect((await state()).state.shortages[0].status).toBe('restored')
  })
  it('requires inspection, submitted work and independent verification for a repair', async () => {
    await act('resident', { type: 'submitReport', report: report('ND-BB000001', 'leak') })
    const verified = await act('coordinator', { type: 'verifyReport', reportId: 'ND-BB000001' })
    const leakId = verified.state.leaks[0].id
    const assigned = await act('coordinator', { type: 'assignCrew', leakId, crew: 'Central maintenance crew' })
    const id = assigned.state.repairs[0].id
    await act('coordinator', { type: 'verifyRepair', id, evidence: 'Too early.' }, 409)
    await act('crew', { type: 'startRepair', id })
    await act('crew', { type: 'submitRepair', id, work: 'Attempted before inspection.' }, 409)
    await act('crew', { type: 'inspectRepair', id, inspection: 'Split public pipe located and isolated.' })
    await act('crew', { type: 'submitRepair', id, work: 'Replaced the damaged segment and pressure-tested the sleeve.' })
    expect((await state()).state.leaks[0].status).toBe('awaiting-verification')
    await act('crew', { type: 'verifyRepair', id, evidence: 'Cannot self-verify.' }, 403)
    await act('coordinator', { type: 'verifyRepair', id, evidence: 'Independent inspection and pressure test passed.' })
    expect((await state()).state.leaks[0].status).toBe('repaired')
    expect((await state()).state.leaks[0].waterRestoredAt).toBeUndefined()
    expect((await state('resident')).state.reports[0].updatedAt).toBeTruthy()
  })
  it('protects private reports, evidence, assignment writes and coordinator actions', async () => {
    const incidentId = await verifiedShortage()
    expect((await state()).state.reports).toEqual([])
    expect((await state('neighbour')).state.reports).toEqual([])
    await act('resident', { type: 'assignTanker', incidentId, vehicleId: 'WT-04', approvedLitres: 1000, destination: 'Forbidden' }, 403)
    const result = await act('coordinator', { type: 'assignTanker', incidentId, vehicleId: 'WT-04', approvedLitres: 1000, destination: 'Community point' })
    await act('otherdriver', { type: 'advanceTanker', id: result.state.tankers[0].id, step: 'accepted' }, 403)
    expect((await state('otherdriver')).state.tankers).toEqual([])
    expect((await state()).state.audit).toEqual([])
  })
  it('replays a committed request without duplicating a report or audit event', async () => {
    const action: Action = { type: 'submitReport', report: report() }; const key = randomUUID()
    await act('resident', action, 200, key)
    const response = await act('resident', action, 200, key)
    expect(response.replayed).toBe(true); expect(response.state.reports).toHaveLength(1)
    expect((await state('coordinator')).state.audit).toHaveLength(1)
    await act('resident', { type: 'submitReport', report: { ...report(), description: 'Changed payload' } }, 409, key)
  })
  it('declines a job atomically and releases its reserved water and vehicle', async () => {
    const incidentId = await verifiedShortage()
    const assigned = await act('coordinator', { type: 'assignTanker', incidentId, vehicleId: 'WT-04', approvedLitres: 4000, destination: 'Community point' })
    expect(availableWater(assigned.state)).toBe(24000)
    const declined = await act('driver', { type: 'declineTanker', id: assigned.state.tankers[0].id, reason: 'Vehicle has a mechanical fault.' })
    expect(declined.state.tankers[0].status).toBe('declined')
    const current = await state('coordinator'); expect(availableWater(current.state)).toBe(28000); expect(current.state.shortages[0].status).toBe('critical')
    await act('coordinator', { type: 'assignTanker', incidentId, vehicleId: 'WT-07', approvedLitres: 4000, destination: 'Alternative community point' })
  })
  it('prevents concurrent double dispatch and checks capacity and provisioned workers', async () => {
    const incidentId = await verifiedShortage()
    await act('coordinator', { type: 'assignTanker', incidentId, vehicleId: 'WT-04', approvedLitres: 9000, destination: 'Exceeds capacity' }, 409)
    await act('coordinator', { type: 'assignTanker', incidentId, vehicleId: 'WT-09', approvedLitres: 1000, destination: 'No driver' }, 409)
    const action = { type: 'assignTanker', incidentId, vehicleId: 'WT-04', approvedLitres: 4000, destination: 'Community point' }
    const responses = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/api/actions', headers: { cookie: cookies.coordinator, 'idempotency-key': randomUUID() }, payload: action })))
    expect(responses.map(r => r.statusCode).sort()).toEqual([200, 409])
    expect((await state('coordinator')).state.tankers).toHaveLength(1)
  })
  it('saves exact private locations and rejects coordinates outside Mauritius', async () => {
    await act('resident', { type: 'submitReport', report: { ...report('ND-AA000088'), coordinates: { latitude: 50, longitude: 2 } } }, 400)
    const point = { latitude: -20.31881, longitude: 57.52592 }
    const saved = await act('resident', { type: 'submitReport', report: { ...report('ND-AA000089'), coordinates: point } })
    expect(saved.state.reports[0].coordinates).toEqual(point)
    expect((await state('resident')).state.reports[0].coordinates).toEqual(point)
    expect((await state('coordinator')).state.reports[0].coordinates).toEqual(point)
    expect((await state()).state.reports).toEqual([])
    expect((await state('neighbour')).state.reports).toEqual([])
  })
  it('rejects invalid conditions, unauthenticated writes and cross-origin commands', async () => {
    await act('resident', { type: 'submitReport', report: { ...report(), condition: 'Invalid' } }, 409)
    const anonymous = await app.inject({ method: 'POST', url: '/api/actions', payload: { type: 'publishNotice', town: 'Curepipe', text: 'No access' } }); expect(anonymous.statusCode).toBe(401)
    const cross = await app.inject({ method: 'POST', url: '/api/logout', headers: { origin: 'https://example.invalid' }, payload: {} }); expect(cross.statusCode).toBe(403)
    const demo = await app.inject({ method: 'POST', url: '/api/demo-login', payload: { role: 'coordinator' } }); expect(demo.statusCode).toBe(404)
  })
})
