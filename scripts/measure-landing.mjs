/**
 * 量落地页内容块占屏比例，并落盘截图。
 * 用法: node scripts/measure-landing.mjs
 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PREFIX = '/car-interior-configurator'
const SRC = path.resolve('dist')
const OUT = path.resolve('pv')
const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const PORT = 8931
fs.mkdirSync(OUT, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}
const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '').split('?')[0])
  if (p.startsWith(PREFIX)) p = p.slice(PREFIX.length) || '/'
  if (p === '/' || p === '') p = '/index.html'
  const file = path.join(SRC, p)
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
    res.end(buf)
  })
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=swiftshader'] })
const VIEWS = [
  { name: 'fhd', w: 1920, h: 1080 },
  { name: 'desktop', w: 1440, h: 900 },
  { name: 'laptop', w: 1280, h: 800 },
  { name: 'mobile', w: 390, h: 844 },
]

for (const v of VIEWS) {
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.landing-inner', { timeout: 15000 })
  await page.waitForTimeout(1600) // 等逐层入场动画跑完
  const box = await page.locator('.landing-inner').boundingBox()
  const rh = (box.height / v.h) * 100
  const rw = (box.width / v.w) * 100
  console.log(`${v.name.padEnd(8)} ${v.w}x${v.h}  内容块 ${box.width.toFixed(0)}x${box.height.toFixed(0)}`
    + `  高占 ${rh.toFixed(1)}%  宽占 ${rw.toFixed(1)}%`)
  const f = path.join(OUT, `landing-fit-${v.name}.png`)
  await page.screenshot({ path: f })
  await page.close()
}

await browser.close()
server.close()
