/** 程序化轿车：内饰模式冒烟测试（改了 CarBody 去顶来源 + 开放视角按钮） */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8903
const tag = process.argv[2] || 'run'
mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '').split('?')[0])
  if (!p.startsWith(PREFIX)) { res.writeHead(302, { Location: PREFIX + '/' }); res.end(); return }
  p = p.slice(PREFIX.length) || '/'
  if (p === '/' || p === '') p = '/index.html'
  const file = path.join(SRC, p)
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('x'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
    res.end(buf)
  })
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const browser = await chromium.launch({
  executablePath: EXE, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox', '--disable-crash-reporter'],
})
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } })
page.setDefaultTimeout(60000)
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))
const bufs = []
async function shoot(n) {
  try {
    const b = await page.screenshot({ timeout: 60000, animations: 'disabled' })
    bufs.push({ n, b })
    log('captured', n)
  } catch (e) { log('shot fail', n, e.message.split('\n')[0]) }
}

await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load', timeout: 60000 })
await page.waitForSelector('button:has-text("轿车（程序化）")', { timeout: 60000 })
await page.waitForTimeout(2500)
await shoot('sedan-exterior')
log('click sedan interior')
await page.click('button:has-text("内饰")')
await page.waitForTimeout(3000)
await shoot('sedan-interior')
const cam = await page.evaluate(() => window.__bmwCam || null)
log('cam', JSON.stringify(cam))
const info = await page.evaluate(() => ({
  checkbox: document.querySelectorAll('input[type=checkbox]').length,
  hint: (document.querySelector('.hint') || {}).textContent || '',
}))
log('info', JSON.stringify(info))
if (errs.length) log('ERRORS:\n' + errs.slice(0, 5).join('\n')); else log('no page errors')

await browser.close()
for (const s of bufs) {
  const p = `${OUT}/${s.n}-${tag}.png`
  try { fs.writeFileSync(p, s.b); log('wrote', p) } catch (e) { log('write fail', e.message) }
}
server.close()
log('done')
