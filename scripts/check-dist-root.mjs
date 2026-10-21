/**
 * 验证 dist/ 在「根路径」部署（自定义域名 / Cloudflare Pages / Vercel）下是否可用。
 * 与 preview-landing.mjs 的区别：那个服务在 /car-interior-configurator 子路径下，
 * 这个服务在 / 根路径下，用来确认相对 base（BASE=./）构建的产物没有路径问题。
 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('dist')
const OUT = process.cwd() + '/pv'
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8923
fs.mkdirSync(OUT, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '').split('?')[0])
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

let pass = 0, fail = 0
const assert = (ok, msg) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`) }

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = [], failed = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
  page.on('requestfailed', (r) => failed.push(`FAILED ${r.url()} ${r.failure()?.errorText || ''}`))

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle', timeout: 60000 })

  const h1 = (await page.locator('.landing-name').innerText()).trim()
  assert(h1 === '内秀', `根路径下落地页标题正常：「${h1}」`)
  assert(await page.locator('canvas').count() === 0, '首屏未挂载 canvas')

  // 字体是否真的加载成功（相对路径下最容易出错的东西）
  const fontOk = await page.evaluate(() => document.fonts.status)
  assert(fontOk === 'loaded', `字体加载状态 ${fontOk}`)

  await page.click('.landing-start')
  await page.waitForSelector('canvas', { timeout: 120000 })
  await page.waitForTimeout(6000)

  // 模型是否真的拉下来了：查 .glb 请求
  const glb = failed.filter((f) => f.includes('.glb'))
  assert(glb.length === 0, `GLB 模型请求无失败（${glb.length} 条异常）`)
  assert(failed.length === 0, `全部请求无 4xx/5xx（${failed.length} 条异常${failed[0] ? '：' + failed[0] : ''}）`)

  // 画布尺寸正常（注意：three.js 默认 preserveDrawingBuffer=false，
  // 渲染后 readPixels 恒为空，所以这里不取像素，改用截图人工核对）
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return { w: c.width, h: c.height }
  })
  assert(size.w > 300 && size.h > 200, `画布尺寸 ${size.w}×${size.h}`)

  const shot = path.join(OUT, 'dist-root.png')
  await page.screenshot({ path: shot })
  const kb = fs.statSync(shot).size / 1024
  assert(kb > 120, `截图 ${kb.toFixed(0)}KB（空白页通常 <60KB，可作画面有内容的旁证）`)
  console.log(`\n结论：${pass} PASS / ${fail} FAIL`)
  if (errors.length) console.log('页面报错：', errors.slice(0, 3))
} finally {
  await browser.close()
  server.close()
}
process.exit(fail === 0 ? 0 : 1)
