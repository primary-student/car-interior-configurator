import { chromium } from 'playwright-core'

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\144.0.3719.92\\msedge.exe'

const browser = await chromium.launch({ executablePath: edge, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(3000)

await page.click('button:has-text("轿车")')
await page.waitForTimeout(2500)

await page.screenshot({ path: './public/check-glb-exterior-fixed.png', fullPage: false })
console.log('saved ./public/check-glb-exterior-fixed.png')

await browser.close()
