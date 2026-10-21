/**
 * 预设方案对比截图：沉稳商务 vs 运动红黑（BMW 外观 + 内饰）
 * 输出 pv/preset-*.png
 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8925
fs.mkdirSync(OUT, { recursive: true })
const tag = process.argv[2] || 'run'
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml',
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '').split('?')[0])
  if (!p.startsWith(PREFIX)) { res.writeHead(302, { Location: PREFIX + '/' }); res.end(); return }
  p = p.slice(PREFIX.length) || '/'
  if (p === '/') p = '/index.html'
  fs.readFile(path.join(SRC, p), (e, b) => {
    if (e) { res.writeHead(404); res.end('x'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' })
    res.end(b)
  })
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(120000)
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

const shots = []
const shot = async (name) => {
  const buf = await page.locator('#root canvas').first().screenshot({ animations: 'disabled' })
  shots.push({ name, buf })
  log('shot', name)
}

await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load' })
await page.locator('.landing-start').click()
await page.locator('.landing').waitFor({ state: 'detached' }).catch(() => {})
await page.waitForFunction(() => !document.body.innerText.includes('加载中'), { timeout: 180000, polling: 400 })
await page.waitForTimeout(2500)

const PRESETS_TO_SHOOT = [
  ['business', '沉稳商务'],
  ['sport', '运动红黑'],
  ['fresh', '青春气息'],
]

for (const [key, preset] of PRESETS_TO_SHOOT) {
  await page.locator(`button:has-text("${preset}")`).click()
  await page.waitForTimeout(1800)
  await shot(`preset-${key}-ext`)
}

await page.locator('button:has-text("青春气息")').click()
await page.waitForTimeout(600)
await page.click('button:has-text("内饰")')
await page.waitForTimeout(4500)
await shot('preset-fresh-int')

await page.locator('button:has-text("运动红黑")').click()
await page.waitForTimeout(600)
await page.click('button:has-text("外观")')
await page.waitForTimeout(2500)
await page.click('button:has-text("内饰")')
await page.waitForTimeout(4500)
await shot('preset-sport-int')

await page.locator('.parts button:has-text("仪表台")').click()
await page.waitForTimeout(600)
await page.locator('.panel').screenshot({ path: `${OUT}/preset-panel-${tag}.png` }).catch(() => {})

log('errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'none')
await browser.close()
for (const s of shots) {
  try { fs.writeFileSync(`${OUT}/${s.name}-${tag}.png`, s.buf) } catch (e) { log('write fail', s.name, e.message) }
}
server.close()
