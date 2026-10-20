import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8907
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
await page.addInitScript(() => {
  const origWarn = console.warn
  window.__outlineStats = []
  console.warn = (...a) => { window.__outlineStats.push(a.join(' ')); origWarn(...a) }
})

const bufs = []
async function shoot(name) {
  for (let i = 1; i <= 3; i++) {
    try {
      const buf = await page.screenshot({ timeout: 90000, animations: 'disabled' })
      bufs.push({ name, buf })
      log('captured', name, buf.length)
      return
    } catch (e) { log(`shot ${i} fail:`, e.message.split('\n')[0]); await page.waitForTimeout(1200) }
  }
}

// 统计场景里的虚线对象（LineSegments + LineDashedMaterial）
async function dashStats() {
  return page.evaluate(() => {
    const r = { lines: 0, verts: 0, color: null }
    // 通过 R3F 内部场景引用不可达，改为遍历 canvas 的 renderer？ -> 用全局调试钩子替代
    return window.__dashStats || r
  })
}

log('goto')
await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load', timeout: 60000 })
await page.waitForSelector('button:has-text("BMW M4（分层）")', { timeout: 60000 })
await page.waitForTimeout(1500)

log('click BMW')
await page.click('button:has-text("BMW M4（分层）")')
await page.waitForFunction(
  () => !(document.body.innerText || '').includes('加载中') && !(document.body.innerText || '').includes('后台下载中'),
  { timeout: 180000, polling: 500 },
)
log('bmw loaded')
await page.waitForTimeout(2500)

// 1) 未选中基线
await shoot('bmw-nosel')

// 2) 选中车身漆面（虚线描边，不改色）
log('select body_paint')
await page.click('.part:has-text("车身漆面")')
await page.waitForTimeout(1800)
await shoot('bmw-sel-body')
log('dash(sel body)', JSON.stringify(await dashStats()))

// 3) 取消选中
await page.click('.part:has-text("车身漆面")')
await page.waitForTimeout(1200)
await shoot('bmw-desel-body')

// 4) 内饰：进入后 store 默认选中主驾座椅，直接看描边
log('interior (default selects seat)')
await page.click('button:has-text("内饰")')
await page.waitForTimeout(3200)
await shoot('bmw-sel-seat')
log('dash(sel seat)', JSON.stringify(await dashStats()))

// 4b) 用自由相机从车外看座舱，确认座椅虚线真的画出来了（驾驶位视角看不到身后的座椅）
log('free cam: seat outline')
await page.evaluate(() => { window.__freeCam = true })
await page.evaluate(() => window.__orbit && window.__orbit(0.0, 2.3, -1.7, 0.0, 0.7, 0.3))
await page.waitForTimeout(1800)
await shoot('bmw-free-seat')
await page.evaluate(() => { window.__freeCam = false })

// 5) 方向盘（光滑曲面，检查降级阈值是否生效）
await page.click('.part:has-text("方向盘")')
await page.waitForTimeout(1800)
await shoot('bmw-sel-steering')
log('dash(sel steering)', JSON.stringify(await dashStats()))
await page.evaluate(() => { window.__freeCam = true })
await page.evaluate(() => window.__orbit && window.__orbit(0.34, 1.55, -1.15, 0.34, 0.95, 0.9))
await page.waitForTimeout(1800)
await shoot('bmw-free-steering')
await page.evaluate(() => { window.__freeCam = false })

// 5b) 副驾座椅
await page.click('.part:has-text("副驾座椅")')
await page.waitForTimeout(1800)
await shoot('bmw-sel-seat-passenger')
log('dash(sel passenger)', JSON.stringify(await dashStats()))

// 6) 程序化轿车：选中方向盘
log('sedan + select steering')
await page.click('button:has-text("轿车（程序化）")')
await page.waitForTimeout(2500)
await page.click('.part:has-text("车身漆面")')
await page.waitForTimeout(1500)
await shoot('sedan-sel-body')
await page.click('.part:has-text("主驾座椅")')
await page.waitForTimeout(1500)
await shoot('sedan-sel-seat')
log('dash(sedan seat)', JSON.stringify(await dashStats()))

// 7) GLB 轿车（ConceptCar）车身选中
log('concept car + select body')
await page.click('button:has-text("轿车（GLB）")')
await page.waitForTimeout(4000)
await page.click('.part:has-text("车身漆面")')
await page.waitForTimeout(1800)
await shoot('concept-sel-body')
log('dash(concept body)', JSON.stringify(await dashStats()))

if (errs.length) log('ERRORS:\n' + errs.slice(0, 6).join('\n'))
else log('no page errors')

await browser.close()
for (const s of bufs) {
  const p = `${OUT}/${s.name}-${tag}.png`
  try { fs.writeFileSync(p, s.buf); log('wrote', p) } catch (e) { log('write fail', p, e.message) }
}
server.close()
log('done')
