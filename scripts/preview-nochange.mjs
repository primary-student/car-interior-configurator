/**
 * 验证：
 * 1. 首页默认就是 BMW 模型（车型列表已无「轿车（程序化）」）
 * 2. 点击部件后 3D 视图零变化（canvas 像素级 diff）
 * 3. 换色仍然生效
 * 只截 #root canvas（右侧面板是 flex 兄弟节点，天然排除在截图外）。
 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8913
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

/** 最小 PNG 解码（8bit，非隔行） */
function decodePNG(buf) {
  let pos = 8
  let width = 0, height = 0, bitDepth = 8, colorType = 6
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error('unsupported bitDepth ' + bitDepth)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v = (v + a) & 255
      else if (filter === 2) v = (v + b) & 255
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
      cur[x] = v
    }
    prev = cur
  }
  return { width, height, channels, data: out }
}

/** 像素比较；跳过左上角 Stats 帧率面板（数字每帧都在变） */
const HUD = { x: 0, y: 0, w: 140, h: 70 }
function diffPNG(bufA, bufB) {
  const A = decodePNG(bufA), B = decodePNG(bufB)
  if (A.width !== B.width || A.height !== B.height) {
    return { sizeMismatch: `${A.width}x${A.height} vs ${B.width}x${B.height}` }
  }
  let changed = 0, maxD = 0
  const ch = A.channels
  for (let y = 0; y < A.height; y++) {
    const inHudRow = y < HUD.h
    for (let x = 0; x < A.width; x++) {
      if (inHudRow && x < HUD.w) continue
      const i = (y * A.width + x) * ch
      const d = Math.max(
        Math.abs(A.data[i] - B.data[i]),
        Math.abs(A.data[i + 1] - B.data[i + 1]),
        Math.abs(A.data[i + 2] - B.data[i + 2]),
      )
      if (d > 3) changed++
      if (d > maxD) maxD = d
    }
  }
  return { changed, maxD, pixels: A.width * A.height }
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox', '--disable-crash-reporter'],
})
const page = await browser.newPage({ viewport: { width: 1100, height: 680 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(90000)
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))

const shots = []
async function canvasShot(name) {
  const buf = await page.locator('#root canvas').first().screenshot({ timeout: 90000, animations: 'disabled' })
  shots.push({ name, buf })
  return buf
}

const results = []
function assert(label, ok, note = '') {
  results.push({ label, ok })
  log(`${ok ? 'PASS' : 'FAIL'} ${label}${note ? ' — ' + note : ''}`)
}
function check(label, a, b) {
  const d = diffPNG(a, b)
  if (d.sizeMismatch) { assert(label, false, d.sizeMismatch); return }
  assert(label, d.changed === 0, `差异像素 ${d.changed}/${d.pixels}，最大通道差 ${d.maxD}`)
}

log('goto')
await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load', timeout: 60000 })

// ---- 1. 首页默认 BMW ----
const sedanBtn = await page.locator('button:has-text("轿车（程序化）")').count()
assert('车型列表已隐藏「轿车（程序化）」', sedanBtn === 0, `匹配到 ${sedanBtn} 个按钮`)

const bmwBtn = page.locator('button:has-text("BMW M4")')
await bmwBtn.waitFor({ timeout: 60000 })
const bmwClass = (await bmwBtn.getAttribute('class')) || ''
assert('首页默认选中 BMW', bmwClass.includes('view-active'), `class="${bmwClass}"`)

// 等 BMW 模型加载完（Suspense 的「加载中」消失）
await page.waitForFunction(
  () => !(document.body.innerText || '').includes('加载中'),
  { timeout: 180000, polling: 400 },
)
await page.waitForTimeout(3500)
await canvasShot('home-bmw')

const homeText = await page.evaluate(() => document.body.innerText)
assert('首页无「加载中」残留', !homeText.includes('加载中'))
assert('首页无程序化轿车字样', !homeText.includes('程序化'))

// ---- 2. BMW 外观：点击零变化 ----
const bmwBase = shots[shots.length - 1].buf
await page.click('.part:has-text("车身漆面")')
await page.waitForTimeout(1600)
check('BMW 外观 · 选中车身漆面无变化', bmwBase, await canvasShot('bmw-sel-body'))

await page.click('.part:has-text("主驾座椅")')
await page.waitForTimeout(1600)
check('BMW 外观 · 选中主驾座椅无变化', bmwBase, await canvasShot('bmw-sel-seat'))

await page.click('.part:has-text("主驾座椅")')
await page.waitForTimeout(1400)
check('BMW 外观 · 取消选中无变化', bmwBase, await canvasShot('bmw-deselect'))

// ---- 3. BMW 内饰：点击零变化 ----
log('interior view')
await page.click('button:has-text("内饰")')
await page.waitForTimeout(4000)
const bmwIntBase = await canvasShot('bmw-interior-base')
await page.click('.part:has-text("方向盘")')
await page.waitForTimeout(1600)
check('BMW 内饰 · 选中方向盘无变化', bmwIntBase, await canvasShot('bmw-interior-steering'))
await page.click('.part:has-text("中控台")')
await page.waitForTimeout(1600)
check('BMW 内饰 · 选中中控台无变化', bmwIntBase, await canvasShot('bmw-interior-console'))

// ---- 4. GLB 轿车：点击零变化 + 换色回归 ----
log('concept')
await page.click('button:has-text("轿车（GLB）")')
await page.waitForTimeout(4500)
const conceptBase = await canvasShot('concept-base')
await page.click('.part:has-text("车身漆面")')
await page.waitForTimeout(1800)
check('GLB 轿车 · 选中车身漆面无变化', conceptBase, await canvasShot('concept-sel-body'))

const beforeColor = await canvasShot('recolor-before')
const swatchName = await page.locator('.swatches .swatch').nth(4).getAttribute('title')
log('pick swatch:', swatchName)
await page.locator('.swatches .swatch').nth(4).click()
await page.waitForTimeout(1600)
const recolor = diffPNG(beforeColor, await canvasShot('recolor-after'))
assert('换色功能仍生效', !recolor.sizeMismatch && recolor.changed > 5000, `差异像素 ${recolor.changed}/${recolor.pixels}`)

if (errs.length) log('ERRORS:\n' + errs.slice(0, 6).join('\n'))
else log('no page errors')

await browser.close()
for (const s of shots) {
  const p = `${OUT}/${s.name}-${tag}.png`
  try { fs.writeFileSync(p, s.buf) } catch (e) { log('write fail', p, e.message) }
}
server.close()

const failed = results.filter((r) => !r.ok)
log('======== RESULT ========')
results.forEach((r) => log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label}`))
log(failed.length === 0 ? 'ALL PASS' : `${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
