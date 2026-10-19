import { chromium } from 'playwright-core'

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const url = 'http://localhost:5173/'
const outDir = './public'

const browser = await chromium.launch({ executablePath: edge, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

// 切换到 BMW M4
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const btn = btns.find((b) => b.textContent?.includes('BMW M4'))
  if (btn) btn.click()
})
await page.waitForTimeout(5000)

await page.screenshot({ path: `${outDir}/bmw-exterior.png`, fullPage: false })
console.log('saved bmw-exterior.png')

// 隐藏车顶
await page.evaluate(() => {
  const input = document.querySelector('.roof-toggle input')
  if (input) input.click()
})
await page.waitForTimeout(3000)
await page.screenshot({ path: `${outDir}/bmw-roof-hidden.png`, fullPage: false })
console.log('saved bmw-roof-hidden.png')

// 取消隐藏车顶，切换到内饰模式
await page.evaluate(() => {
  const input = document.querySelector('.roof-toggle input')
  if (input) input.click()
})
await page.waitForTimeout(1000)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const btn = btns.find((b) => b.textContent?.includes('内饰'))
  if (btn) btn.click()
})
await page.waitForTimeout(3000)
await page.screenshot({ path: `${outDir}/bmw-interior.png`, fullPage: false })
console.log('saved bmw-interior.png')

// 内饰模式下点选主驾座椅并换色
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const btn = btns.find((b) => b.textContent?.includes('主驾座椅'))
  if (btn) btn.click()
})
await page.waitForTimeout(1000)
await page.evaluate(() => {
  const swatches = [...document.querySelectorAll('.swatch')]
  if (swatches[3]) swatches[3].click()
})
await page.waitForTimeout(3000)
await page.screenshot({ path: `${outDir}/bmw-seat-red.png`, fullPage: false })
console.log('saved bmw-seat-red.png')

await browser.close()
