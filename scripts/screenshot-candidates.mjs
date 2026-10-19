import { chromium } from 'playwright-core'

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\144.0.3719.92\\msedge.exe'
const out = process.argv[2] || './public/candidates-preview.png'

const browser = await chromium.launch({ executablePath: edge, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 1280 } })
await page.goto('http://localhost:5173/candidates.html', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(5000)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log('saved', out)
