/** 补拍侧面镜头：抬高相机，让地面与接地阴影进画。 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = path.resolve('video/shots')
const PORT = 8965

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json',
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '').split('?')[0])
  if (!p.startsWith(PREFIX)) { res.writeHead(302, { Location: PREFIX + '/' }); res.end(); return }
  p = p.slice(PREFIX.length) || '/'
  if (p === '/') p = '/index.html'
  fs.readFile(path.join(SRC, p), (e, b) => {
    if (e) { res.writeHead(404); res.end('x'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' })
    res.end(b)
  })
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const frames = (n = 3) => page.evaluate((c) => new Promise((res) => { let i = 0; const t = () => { if (++i >= c) res(true); else requestAnimationFrame(t) }; requestAnimationFrame(t) }), n)

await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.locator('.landing-start').click()
await page.locator('.landing').waitFor({ state: 'detached' }).catch(() => {})
await page.waitForFunction(() => !document.body.innerText.includes('加载中'), { timeout: 180000, polling: 400 })
await frames(3)

const setCam = async (azDeg, elDeg, dist, targetY) => {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  const x = Math.sin(az) * Math.cos(el) * dist
  const z = Math.cos(az) * Math.cos(el) * dist
  const y = targetY + Math.sin(el) * dist
  await page.evaluate(([a, b, c, d, e, f]) => window.__orbit(a, b, c, d, e, f), [x, y, z, 0, targetY, 0])
  await frames(3)
}

const t = Date.now()
await setCam(-62, 17, 6.2, 0.55)
await page.screenshot({ path: path.join(OUT, 'v3-ext_side.png'), animations: 'disabled' })
console.log('shot side', Date.now() - t, 'ms')

await browser.close()
server.close()
