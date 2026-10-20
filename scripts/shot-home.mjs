/** 首页整页截图：加载中 / 加载完成 两个瞬间，用于核对车型列表与加载提示层 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8915
fs.mkdirSync(OUT, { recursive: true })
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
const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)

const shots = []
await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })

// 加载中（模型没到之前）
await page.waitForTimeout(350)
const loadingVisible = await page.locator('.scene-loading').count()
log('loading layer present:', loadingVisible)
shots.push({ name: 'home-loading', buf: await page.screenshot({ animations: 'disabled' }) })

// 加载完成
await page.waitForFunction(
  () => !(document.body.innerText || '').includes('加载中'),
  { timeout: 180000, polling: 400 },
)
await page.waitForTimeout(3000)
shots.push({ name: 'home-loaded', buf: await page.screenshot({ animations: 'disabled' }) })

const buttons = await page.locator('.presets button').allInnerTexts()
log('presets:', JSON.stringify(buttons))
const loadingGone = await page.locator('.scene-loading').count()
log('loading layer after load:', loadingGone)

await browser.close()
for (const s of shots) {
  const p = `${OUT}/${s.name}-${tag}.png`
  fs.writeFileSync(p, s.buf)
  log('wrote', p)
}
server.close()
log('done')
