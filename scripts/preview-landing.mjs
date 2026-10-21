/**
 * 验证落地页流程：
 * 1. 首屏只有标题 + 描述 + 开始按钮，3D 场景未挂载（DOM 里没有 canvas）
 * 2. 点「开始定制」→ 落地页淡出并移除，3D 场景挂载
 * 3. 左上角品牌标点击 → 回到落地页，3D 场景卸载
 * 截图落盘 pv/landing-*。
 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8917
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

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox', '--disable-crash-reporter'],
})

const results = []
const shots = []
function assert(label, ok, note = '') {
  results.push({ label, ok })
  log(`${ok ? 'PASS' : 'FAIL'} ${label}${note ? ' — ' + note : ''}`)
}

async function run(width, height, label) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  page.setDefaultTimeout(90000)
  const errs = []
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message))

  await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'load', timeout: 60000 })
  // 等入场动画跑完（首帧时间取决于 JS bundle 解析速度，headless 下偏慢）
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
    { timeout: 30000, polling: 200 },
  ).catch(() => {})
  await page.waitForTimeout(600)

  // 1. 落地页
  const text = await page.evaluate(() => document.body.innerText)
  assert(`[${label}] 首屏显示品牌名`, text.includes('内秀') && text.includes('NEIXIU'))
  assert(`[${label}] 首屏显示描述`, text.includes('外面给世界看'))
  const startBtn = page.locator('.landing-start')
  assert(`[${label}] 首屏有开始按钮`, await startBtn.count() === 1)
  const canvasBefore = await page.locator('#root canvas').count()
  assert(`[${label}] 落地页未挂载 3D 场景`, canvasBefore === 0, `canvas=${canvasBefore}`)
  const panelBehind = await page.evaluate(() => {
    const el = document.querySelector('.landing')
    return !!el && getComputedStyle(el).position === 'absolute'
  })
  assert(`[${label}] 落地页为全屏浮层`, panelBehind)

  shots.push({ name: `landing-${label}`, buf: await page.screenshot({ type: 'png' }) })

  // 2. 进入配置器
  await startBtn.click()
  await page.locator('.landing').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
  const canvasAfter = await page.locator('#root canvas').count()
  assert(`[${label}] 点击开始后挂载 3D 场景`, canvasAfter >= 1, `canvas=${canvasAfter}`)
  const landingGone = await page.locator('.landing').count()
  assert(`[${label}] 淡出后落地页已移除`, landingGone === 0)
  const brand = await page.locator('.brand-mark').count()
  assert(`[${label}] 配置器出现品牌标`, brand === 1)

  await page.waitForFunction(
    () => !(document.body.innerText || '').includes('加载中'),
    { timeout: 180000, polling: 400 },
  )
  await page.waitForTimeout(2600)
  shots.push({ name: `entered-${label}`, buf: await page.screenshot({ type: 'png' }) })

  // 3. 返回首页
  await page.click('.brand-mark')
  await page.waitForTimeout(600)
  assert(`[${label}] 点击品牌标回到落地页`, await page.locator('.landing').count() === 1)
  assert(`[${label}] 返回后 3D 场景已卸载`, await page.locator('#root canvas').count() === 0)
  shots.push({ name: `back-${label}`, buf: await page.screenshot({ type: 'png' }) })

  assert(`[${label}] 无页面报错`, errs.length === 0, errs.slice(0, 3).join(' | '))
  await page.close()
}

await run(1440, 900, 'desktop')
await run(390, 844, 'mobile')

await browser.close()
for (const s of shots) {
  try { fs.writeFileSync(`${OUT}/${s.name}-${tag}.png`, s.buf) } catch (e) { log('write fail', s.name, e.message) }
}
server.close()

const failed = results.filter((r) => !r.ok)
log('======== RESULT ========')
results.forEach((r) => log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label}`))
log(failed.length === 0 ? 'ALL PASS' : `${failed.length} FAILED`)
process.exit(failed.length === 0 ? 0 : 1)
