import Fastify from 'fastify'
import type { ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { readAction, record, text } from './actions.ts'
import { createPersistence, provision, publicAccount, type Persistence } from './persistence.ts'
import { createService, ServiceError } from './service.ts'
import { seedDemo } from './demo.ts'

export async function createHttpApi(options: { repository?: Persistence; demo?: boolean } = {}) {
  const repository = options.repository ?? await createPersistence()
  const demo = options.demo ?? process.env.NOU_DEMO === '1'
  if (demo) {
    if (repository.kind !== 'sqlite' || !(process.env.NOU_DATA_DIR ?? '').includes('demo')) throw new Error('Demo mode requires a separate SQLite directory whose name includes demo.')
    await seedDemo(repository)
  }
  const service = createService(repository)
  const app = Fastify({ bodyLimit: 1_650_000, logger: false, trustProxy: false, requestTimeout: 15_000 })
  const events = new EventEmitter()
  events.setMaxListeners(200)
  const clients = new Set<ServerResponse>()
  const attempts = new Map<string, { until: number; count: number }>()
  const token = (cookie?: string) => /(?:^|;\s*)noudilo_session=([\w-]+)(?:;|$)/.exec(cookie ?? '')?.[1] ?? ''
  const cookie = (value: string, age: number) => `noudilo_session=${value}; Max-Age=${age}; Path=/; HttpOnly; SameSite=Strict${process.env.NOU_SECURE_COOKIE === '1' ? '; Secure' : ''}`
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
    if (!['GET', 'HEAD'].includes(request.method)) {
      if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) throw new ServiceError(403, 'This request came from a different site.')
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new ServiceError(403, 'Use the NouDilo site to continue.')
      if (!request.headers['content-type']?.startsWith('application/json')) throw new ServiceError(415, 'Send JSON.')
    }
  })
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ServiceError) return reply.code(error.status).send({ message: error.message })
    const message = error instanceof Error ? error.message : 'The service could not complete this request.'
    const internal = /SQLITE|ORA-|constraint|database|NJS-|DPI-/i.test(message)
    if (internal) console.error('NouDilo persistence operation failed. Check server configuration and database availability.')
    const status = (error as { statusCode?: number }).statusCode
    return reply.code(internal ? 503 : status && status >= 400 && status < 500 ? status : 400).send({ message: internal ? 'The service could not save this request. Your details are still here; try again.' : message })
  })
  app.get('/api/health', async () => ({ status: 'ok', database: repository.kind, demo, telemetry: false }))
  app.get('/api/state', async request => service.snapshot(await service.account(token(request.headers.cookie))))
  app.get('/api/events', async (request, reply) => {
    if (clients.size >= 100) return reply.code(503).send({ message: 'Use periodic refresh while the event service is busy.' })
    reply.hijack()
    const response = reply.raw
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    response.write('retry: 3000\n\n')
    clients.add(response)
    // Only revisions travel over this public channel; reads remain role-filtered.
    const notify = () => response.write(`event: revision\ndata: ${Date.now()}\n\n`)
    events.on('revision', notify)
    const timer = setInterval(() => response.write(': keepalive\n\n'), 20_000)
    request.raw.on('close', () => { clearInterval(timer); events.off('revision', notify); clients.delete(response) })
  })
  app.post('/api/logout', async (request, reply) => {
    await service.logout(token(request.headers.cookie)); reply.header('Set-Cookie', cookie('', 0))
    return service.snapshot()
  })
  for (const path of ['login', 'register'] as const) app.post(`/api/${path}`, async (request, reply) => {
    const now = Date.now()
    for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key)
    const attempt = attempts.get(request.ip) ?? { until: now + 60_000, count: 0 }; attempts.set(request.ip, attempt)
    if (++attempt.count > 15) throw new ServiceError(429, 'Too many attempts. Try again in a minute.')
    const data = record(request.body); const email = text(data.email, 160).toLowerCase()
    if (typeof data.password !== 'string' || data.password.length > 128 || !data.password) throw new ServiceError(400, 'Enter your email and password.')
    const account = path === 'register' ? await provision(repository, email, data.password, 'resident', null) : await service.authenticate(email, data.password)
    if (!account) throw new ServiceError(401, 'Email or password was incorrect.')
    reply.header('Set-Cookie', cookie(await service.session(account, token(request.headers.cookie)), 8 * 3600))
    return service.snapshot(account)
  })
  app.post('/api/demo-login', async (request, reply) => {
    if (!demo || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(request.ip)) throw new ServiceError(404, 'This operation is unavailable.')
    const role = text(record(request.body).role, 24)
    const email = ({ resident: 'resident@demo.noudilo.test', resident2: 'neighbour@demo.noudilo.test', coordinator: 'coordinator@demo.noudilo.test', driver: 'driver@demo.noudilo.test', crew: 'crew@demo.noudilo.test' } as Record<string, string>)[role]
    if (!email) throw new ServiceError(400, 'Choose a demonstration role.')
    const account = await repository.read(async tx => { const [row] = await tx.rows('SELECT id,email,role,resource FROM accounts WHERE email = :email', { email }); return row ? publicAccount(row) : null })
    if (!account) throw new ServiceError(503, 'The isolated demonstration is not configured.')
    reply.header('Set-Cookie', cookie(await service.session(account, token(request.headers.cookie)), 8 * 3600))
    return service.snapshot(account)
  })
  app.post('/api/actions', async request => {
    const account = await service.account(token(request.headers.cookie))
    if (!account) throw new ServiceError(401, 'Sign in before continuing.')
    const key = request.headers['idempotency-key'] ?? randomUUID()
    if (typeof key !== 'string' || !/^[\w-]{8,100}$/.test(key)) throw new ServiceError(400, 'Invalid request reference.')
    const result = await service.apply(account, readAction(request.body), key)
    if (!result.replayed) events.emit('revision')
    return result
  })
  app.addHook('preClose', async () => { for (const response of clients) response.end(); clients.clear() })
  app.addHook('onClose', async () => { events.removeAllListeners(); if (!options.repository) await repository.close() })
  return app
}
