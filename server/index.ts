import { resolve } from 'node:path'
import staticPlugin from '@fastify/static'
import { createHttpApi } from './api.ts'

const app = await createHttpApi()
await app.register(staticPlugin, { root: resolve('dist'), wildcard: false, preCompressed: true })
app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ message: 'Endpoint unavailable.' }) : reply.sendFile('index.html'))
const host = process.env.NOU_HOST ?? '127.0.0.1'
if (process.env.NOU_DEMO === '1' && host !== '127.0.0.1') throw new Error('The demonstration server must bind to 127.0.0.1.')
await app.listen({ host, port: Number(process.env.NOU_PORT ?? 3000) })
console.log(`NouDilo running at http://${host}:${process.env.NOU_PORT ?? 3000}`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { await app.close(); process.exit(0) })
