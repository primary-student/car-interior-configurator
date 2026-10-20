import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8902
mkdirSync(OUT, { recursive: true })
const tag = process.argv[2] || 'run'
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '').split('?')[0])
  if (!p.startsWith(PREFIX)) { res.writeHead(302, { Location: PREFIX + '/' }); res.end(); return }
  p = p.slice(PREFIX.length) || '/'
  if (p === '/' || p === '') p = '/index.html'
  const file = path.join(SRC, p)
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
    res.end(buf)
  })
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
log('static server on', PORT)

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox', '--disable-crash-reporter'],
})
const page = await browser.newPage({ viewport: { width: 1100, height: 680 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))

const shotBufs = []
async function shoot(name) {
  for (let i = 1; i <= 3; i++) {
    try {
      const buf = await page.screenshot({ timeout: 90000, animations: 'disabled' })
      shotBufs.push({ name, buf })
      log('captured', name, buf.length, 'bytes')
      return
    } catch (e) { log(`shot ${i} fail:`, e.message.split('\n')[0]); await page.waitForTimeout(1200) }
  }
}
const cam = () => page.evaluate(() => window.__bmwCam || null)
async function drag(dx, dy, steps = 18) {
  const x = 320, y = 330
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps)
  await page.mouse.up()
  await page.waitForTimeout(1400)
}

log('goto')
await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load', timeout: 60000 })
await page.waitForSelector('button:has-text("BMW M4")', { timeout: 60000 })
await page.waitForTimeout(2000)

log('click BMW')
await page.click('button:has-text("BMW M4")')
await page.waitForFunction(() => !(document.body.innerText || '').includes('加载中') && !(document.body.innerText || '').includes('后台下载中'), { timeout: 160000, polling: 500 })
log('model loaded')
await page.waitForTimeout(2000)
await shoot('bmw-exterior')

const checkbox = await page.evaluate(() => ({
  text: (document.body.innerText || '').includes('隐藏车顶'),
  count: document.querySelectorAll('input[type=checkbox]').length,
}))
log('checkbox removed?', JSON.stringify(checkbox))

log('click interior')
await page.click('button:has-text("内饰")')
await page.waitForTimeout(3500)
await shoot('bmw-driver-center')
const camCenter = await cam()
log('cam center', JSON.stringify(camCenter))

log('drag right 400px')
await drag(400, 0)
await shoot('bmw-driver-right')
const camRight = await cam()
log('cam right', JSON.stringify(camRight))

log('drag left 800px')
await drag(-800, 0)
await shoot('bmw-driver-left')
const camLeft = await cam()
log('cam left', JSON.stringify(camLeft))

log('drag up 400px')
await drag(0, -400)
await shoot('bmw-driver-up')
const camUp = await cam()
log('cam up', JSON.stringify(camUp))

log('drag down 800px')
await drag(0, 800)
await shoot('bmw-driver-down')
const camDown = await cam()
log('cam down', JSON.stringify(camDown))

log('wheel zoom attempt')
await page.mouse.move(320, 330)
await page.mouse.wheel(0, -600)
await page.waitForTimeout(900)
const camZoom = await cam()
log('after wheel', JSON.stringify(camZoom))

log('free cam for roof verification')
await page.evaluate(() => { window.__freeCam = true })
await page.evaluate(() => window.__orbit && window.__orbit(5.6, 1.15, 0.15, 0.0, 0.85, 0.0))
await page.waitForTimeout(2200)
await shoot('bmw-roof-side')
await page.evaluate(() => window.__orbit && window.__orbit(0.0, 3.4, 0.6, 0.0, 0.7, 0.0))
await page.waitForTimeout(2200)
await shoot('bmw-roof-top')
await page.evaluate(() => { window.__freeCam = false })

log('back to exterior')
await page.evaluate(() => window.__orbit && window.__orbit(5.6, 1.15, 0.15, 0.0, 0.85, 0.0))
await page.click('button:has-text("外观")')
await page.waitForTimeout(3000)
await page.evaluate(() => window.__orbit && window.__orbit(5.6, 1.15, 0.15, 0.0, 0.85, 0.0))
await page.waitForTimeout(1500)
await shoot('bmw-exterior-side')
const clipBack = await page.evaluate(() => window.__bmwRoofClip || null)
log('roofClip(exterior)', JSON.stringify(clipBack))

const posSet = new Set([camCenter, camRight, camLeft, camUp, camDown, camZoom].filter(Boolean).map((c) => c.pos.join(',')))
log('=== CHECK ===')
log('camera positions across all drags/zoom:', JSON.stringify([...posSet]))
log('yaw center/right/left:', camCenter?.yawDeg, camRight?.yawDeg, camLeft?.yawDeg)
log('pitch center/up/down:', camCenter?.pitchDeg, camUp?.pitchDeg, camDown?.pitchDeg)
if (errs.length) log('ERRORS:\n' + errs.slice(0, 6).join('\n'))

await browser.close()
for (const s of shotBufs) {
  const p = `${OUT}/${s.name}-${tag}.png`
  try { fs.writeFileSync(p, s.buf); log('wrote', p) } catch (e) { log('write fail', p, e.message) }
}
server.close()
log('done')
