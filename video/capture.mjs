/**
 * 逐张抓取视频用高清静帧（软件渲染下实时录屏不可行：1080p 仅 0.85fps）。
 * 相机位姿全部用数学直接给定，不依赖交互阻尼，保证每个镜头精确可控。
 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = path.resolve('video/shots')
const PORT = 8961
const W = 1920
const H = 1080
const TAG = process.argv[2] || 'v1'

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
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    })
    res.end(b)
  })
})

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l) }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const rotAxis = (v, k, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang)
  const kv = cross(k, v)
  const kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]
  return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd * (1 - c))
}
/** 以 eye 为原点、把 look-eye 方向按 yaw/pitch 旋转后的注视点 */
function rotatedLook(eye, look, yawDeg, pitchDeg) {
  const dist = Math.hypot(look[0] - eye[0], look[1] - eye[1], look[2] - eye[2])
  let d = norm([look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]])
  d = rotAxis(d, [0, 1, 0], (yawDeg * Math.PI) / 180)
  const right = norm(cross(d, [0, 1, 0]))
  d = rotAxis(d, right, (pitchDeg * Math.PI) / 180)
  return [eye[0] + d[0] * dist, eye[1] + d[1] * dist, eye[2] + d[2] * dist]
}

await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.setDefaultTimeout(180000)

const shot = async (name) => {
  const t = Date.now()
  await page.screenshot({ path: path.join(OUT, `${TAG}-${name}.png`), animations: 'disabled' })
  console.log(`  shot ${name} (${Date.now() - t}ms)`)
}

/** 等渲染真的吐出几帧（软件渲染下 rAF 很慢，不能只 waitForTimeout） */
const frames = (n = 3) =>
  page.evaluate(
    (count) =>
      new Promise((res) => {
        let i = 0
        const tick = () => { if (++i >= count) res(true); else requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }),
    n,
  )

const orbit = (px, py, pz, tx, ty, tz) =>
  page.evaluate(([a, b, c, d, e, f]) => window.__orbit(a, b, c, d, e, f), [px, py, pz, tx, ty, tz])

/** 外观机位：方位角/仰角/距离；az=0 为正前方，正值向右前 */
async function setExterior(azDeg, elDeg, dist, targetY = 0.72) {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  const x = Math.sin(az) * Math.cos(el) * dist
  const z = Math.cos(az) * Math.cos(el) * dist
  const y = targetY + Math.sin(el) * dist
  await orbit(x, y, z, 0, targetY, 0)
  await frames(3)
}

console.log('goto landing')
await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load' })
await page.waitForTimeout(2200)
await shot('landing')

console.log('enter configurator')
await page.locator('.landing-start').click()
await page.locator('.landing').waitFor({ state: 'detached' }).catch(() => {})
await page.waitForFunction(() => !document.body.innerText.includes('加载中'), { timeout: 180000, polling: 400 })
await frames(4)

// 外观：默认蓝
await setExterior(36, 12, 6.55)
await shot('ext_default')
await setExterior(-58, 8, 6.1, 0.66)
await shot('ext_side')
await setExterior(-128, 14, 6.3)
await shot('ext_rear')

// 三套方案：同一机位便于对照
for (const [name, preset] of [['biz', '沉稳商务'], ['sport', '运动红黑'], ['fresh', '青春气息']]) {
  await page.locator(`.presets button:has-text("${preset}")`).click()
  await frames(3)
  await setExterior(30, 11, 6.3)
  await shot(`ext_${name}`)
}

// 内饰：驾驶位
console.log('interior')
await page.locator('.presets button:has-text("内饰")').click()
await page.waitForTimeout(1200)
await frames(4)
const anchors = await page.evaluate(() => window.__bmwDebug && window.__bmwDebug.anchors)
if (!anchors) throw new Error('anchors 未就绪')
console.log('  eye', JSON.stringify(anchors.eye), 'look', JSON.stringify(anchors.look))
const eye = anchors.eye
const baseLook = anchors.look

const camSet = (look, fov = 74) =>
  page.evaluate(([a, b]) => window.__camSet(a[0], a[1], a[2], b[0], b[1], b[2], 74), [eye, look])

const lookShots = [
  ['int_fwd', 0, -2],
  ['int_left', 30, -3],
  ['int_right', -32, 2],
  ['int_dash', -4, -13],
]
for (const [name, yaw, pitch] of lookShots) {
  const look = rotatedLook(eye, baseLook, yaw, pitch)
  await camSet(look)
  await frames(3)
  await shot(name)
}

// 仪表台换色：换色后同一机位再拍一张
await page.locator('.parts button:has-text("仪表台")').click()
await frames(2)
await page.locator('.swatches .swatch[title="原木色"]').click()
await frames(4)
await camSet(rotatedLook(eye, baseLook, -4, -13))
await frames(2)
await shot('int_dash_wood')

await browser.close()
server.close()
console.log('done ->', OUT)
