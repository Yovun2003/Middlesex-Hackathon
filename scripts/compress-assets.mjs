import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'
let original = 0; let brotli = 0; let files = 0
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) { await walk(path); continue }
    if (!/\.(js|css|glb|json|html|svg)$/.test(entry.name)) continue
    const source = await readFile(path)
    if (source.length < 512) continue
    const br = brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 7 } })
    const gzip = gzipSync(source, { level: 9 })
    if (br.length >= source.length * .95) continue
    await Promise.all([writeFile(path + '.br', br), writeFile(path + '.gz', gzip)])
    original += source.length; brotli += br.length; files++
  }
}
await walk('dist')
console.log(`Precompressed ${files} assets: ${original} bytes original, ${brotli} bytes Brotli. Fastify negotiates the available encoding.`)
