/**
 * 补拍内饰机位：环视角度收到 ±13°，避免露出被裁掉的车顶边缘。
 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = path.resolve('video/shots')
const PORT = 8963
const TAG = process.argv[2] || 'v2'

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

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l) }
const rotAxis = (v, k, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang), kv = cross(k, v), kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]
  return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd * (1 - c))
}
function rotatedLook(eye, look, yawDeg, pitchDeg) {
  const dist = Math.hypot(look[0] - eye[0], look[1] - eye[1], look[2] - eye[2])
  let d = norm([look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]])
  d = rotAxis(d, [0, 1, 0], (yawDeg * Math.PI) / 180)
  d = rotAxis(d, norm(cross(d, [0, 1, 0])), (pitchDeg * Math.PI) / 180)
  return [eye[0] + d[0] * dist, eye[1] + d[1] * dist, eye[2] + d[2] * dist]
}

await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(180000)
const frames = (n = 3) => page.evaluate((c) => new Promise((res) => { let i = 0; const t = () => { if (++i >= c) res(true); else requestAnimationFrame(t) }; requestAnimationFrame(t) }), n)
const shot = async (name) => { const t = Date.now(); await page.screenshot({ path: path.join(OUT, `${TAG}-${name}.png`), animations: 'disabled' }); console.log(`  ${name} ${Date.now() - t}ms`) }

await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.locator('.landing-start').click()
await page.locator('.landing').waitFor({ state: 'detached' }).catch(() => {})
await page.waitForFunction(() => !document.body.innerText.includes('加载中'), { timeout: 180000, polling: 400 })
await frames(3)
// 用青春气息，内饰浅色更讨喜
await page.locator('.presets button:has-text("青春气息")').click()
await frames(2)
await page.locator('.presets button:has-text("内饰")').click()
await page.waitForTimeout(1200)
await frames(4)
const { eye, look } = await page.evaluate(() => window.__bmwDebug.anchors)
const camSet = (l) => page.evaluate(([a, b]) => window.__camSet(a[0], a[1], a[2], b[0], b[1], b[2], 74), [eye, l])

for (const [name, yaw, pitch] of [['int_fwd', 0, -8], ['int_left', -13, -6], ['int_right', 13, -4]]) {
  await camSet(rotatedLook(eye, look, yaw, pitch))
  await frames(3)
  await shot(name)
}

await browser.close()
server.close()
console.log('done')
