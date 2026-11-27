/** One-off asset authoring helper; Chrome is only needed to regenerate bundled WebP maps. */
import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../public/textures/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
const browser = await chromium.launch({ executablePath: process.env.NOU_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
 const page = await browser.newPage()
 for (const asset of manifest.assets) {
  const bytes = await readFile(new URL(asset.file.replace(/\.webp$/, '.jpg'), root))
  const output = await page.evaluate(async base64 => {
   const image = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${base64}`)).blob())
   const canvas = new OffscreenCanvas(image.width, image.height);canvas.getContext('2d').drawImage(image, 0, 0)
   return Array.from(new Uint8Array(await (await canvas.convertToBlob({type:'image/webp',quality:.85})).arrayBuffer()))
  }, bytes.toString('base64'))
  const file = asset.file.replace(/\.jpg$/, '.webp')
  await writeFile(new URL(file, root), Buffer.from(output));asset.sourceBytes=bytes.length;asset.sourceMd5=asset.sourceMd5 ?? asset.md5;delete asset.md5;asset.file=file;asset.bytes=output.length
 }
 manifest.optimization='1024px WebP, quality 85; source checksum retained'
 await writeFile(new URL('manifest.json', root), JSON.stringify(manifest,null,2)+'\n')
 console.log(JSON.stringify({sourceBytes:manifest.assets.reduce((n,a)=>n+a.sourceBytes,0),webpBytes:manifest.assets.reduce((n,a)=>n+a.bytes,0)}))
} finally { await browser.close() }
