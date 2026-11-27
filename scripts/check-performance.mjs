import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const url = process.argv[2] ?? 'http://127.0.0.1:4176/'
const output = process.argv[3] ?? 'test-results/performance.json'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.addInitScript(() => {
    globalThis.__nouPerf = { lcp: null, cls: 0 }
    new PerformanceObserver(list => { for (const entry of list.getEntries()) globalThis.__nouPerf.lcp = entry.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) globalThis.__nouPerf.cls += entry.value }).observe({ type: 'layout-shift', buffered: true })
  })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const canvas = page.locator('[data-world-canvas="persistent"]')
  await canvas.waitFor({ timeout: 45000 })
  const health = await (await page.request.get(new URL('/api/health', url).href)).json()
  if (!health.demo) throw new Error('Use an isolated demo server for the interactive performance scenario.')
  await page.locator('.demo-roles summary').click(); await page.locator('.demo-roles').getByRole('button', { name: 'Resident', exact: true }).click()
  await page.locator('.display-options summary').click()
  await page.getByRole('button', { name: 'Public leak', exact: true }).click()
  await page.getByRole('combobox', { name: 'What are you seeing?', exact: true }).selectOption('Heavy flow')
  await page.getByRole('combobox', { name: 'Scene detail' }).selectOption('high')
  if (await page.getByRole('button', { name: 'Skip travel', exact: true }).isVisible()) await page.getByRole('button', { name: 'Skip travel', exact: true }).click()
  await page.waitForTimeout(300)
  const before = Number(await canvas.getAttribute('data-render-count')); const started = performance.now()
  await page.waitForTimeout(3000)
  const elapsed = performance.now() - started; const after = Number(await canvas.getAttribute('data-render-count'))
  const high = { renderedFrames: after - before, elapsedMs: Math.round(elapsed), measuredFramesPerSecond: Number(((after - before) * 1000 / elapsed).toFixed(1)), drawCalls: Number(await canvas.getAttribute('data-draw-calls')), triangles: Number(await canvas.getAttribute('data-triangles')) }
  await page.getByRole('combobox', { name: 'Scene detail' }).selectOption('low')
  await page.waitForTimeout(300)
  const low = { drawCalls: Number(await canvas.getAttribute('data-draw-calls')), triangles: Number(await canvas.getAttribute('data-triangles')) }
  const browserMetrics = await page.evaluate(() => ({ ...globalThis.__nouPerf, resources: performance.getEntriesByType('resource').filter(entry => /models\/|assets\/|textures\//.test(entry.name)).map(entry => ({ path: new URL(entry.name).pathname, transferredBytes: entry.transferSize, decodedBytes: entry.decodedBodySize })) }))
  const report = { measuredAt: new Date().toISOString(), viewport: { width: 1440, height: 1000 }, environment: 'Local headless Google Chrome; hardware/software rendering depends on the host. A single laboratory sample, not mobile p75 or a device guarantee.', scenario: 'Active heavy-leak illustration; no records submitted', url, high, low, ...browserMetrics, errors }
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2))
} finally { await browser.close() }
