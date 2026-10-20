import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8901
mkdirSync(OUT, { recursive: true })
const tag = process.argv[2] || 'run'
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
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
const geologs = []
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))
page.on('console', (m) => { const t = m.text(); if (t.includes('[BMW-GEO]')) geologs.push(t) })

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

log('goto')
await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load', timeout: 60000 })
await page.waitForSelector('button:has-text("BMW M4（分层）")', { timeout: 60000 })
await page.waitForTimeout(2500)

log('click BMW')
await page.click('button:has-text("BMW M4（分层）")')
await page.waitForFunction(() => !(document.body.innerText || '').includes('加载中') && !(document.body.innerText || '').includes('后台下载中'), { timeout: 160000, polling: 500 })
log('model loaded')
await page.waitForTimeout(2500)
await shoot('bmw-exterior')

log('click interior')
await page.click('button:has-text("内饰")')
await page.waitForTimeout(4500)
await shoot('bmw-interior')

// 用调试相机切到俯视角，确认车顶是否真的被去掉
log('set top-down camera')
await page.evaluate(() => window.__orbit && window.__orbit(0.0, 3.4, 0.6, 0.0, 0.7, 0.0))
await page.waitForTimeout(2500)
await shoot('bmw-interior-top')

// 侧面轮廓：最能直观看出车顶是否消失
log('set side camera')
await page.evaluate(() => window.__orbit && window.__orbit(5.6, 1.15, 0.15, 0.0, 0.85, 0.0))
await page.waitForTimeout(2500)
await shoot('bmw-interior-side')

// 切回外观，确认车顶完整恢复（可逆性）
log('back to exterior')
await page.click('button:has-text("外观")')
await page.waitForTimeout(3500)
await page.evaluate(() => window.__orbit && window.__orbit(5.6, 1.15, 0.15, 0.0, 0.85, 0.0))
await page.waitForTimeout(2000)
await shoot('bmw-exterior-side')
const clipBack = await page.evaluate(() => window.__bmwRoofClip || null)
log('--- roofClip(exterior) ---'); log(JSON.stringify(clipBack))

const data = await page.evaluate(() => ({ dbg: window.__bmwDebug || null, roof: window.__bmwRoofVisible || null, clip: window.__bmwRoofClip || null, cam: window.__bmwCam || null }))
log('--- [BMW-GEO] ---')
geologs.slice(-6).forEach((g) => log(g))
log('--- cam ---'); log(JSON.stringify(data.cam))
log('--- roofVisible ---'); log(JSON.stringify(data.roof))
log('--- roofClip ---'); log(JSON.stringify(data.clip))
log('--- debug ---'); log(JSON.stringify(data.dbg).slice(0, 2400))
if (errs.length) log('ERRORS:\n' + errs.slice(0, 6).join('\n'))

await browser.close()
// 浏览器关闭后再落盘：避免「浏览器运行期间写 png」被安全策略拦截
for (const s of shotBufs) {
  const p = `${OUT}/${s.name}-${tag}.png`
  try { fs.writeFileSync(p, s.buf); log('wrote', p) } catch (e) { log('write fail', p, e.message) }
}
server.close()
log('done')
