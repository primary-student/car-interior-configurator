import { chromium } from 'playwright-core'

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\144.0.3719.92\\msedge.exe'

const browser = await chromium.launch({ executablePath: edge, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

async function shot(name, action) {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  await action()
  await page.waitForTimeout(2000)
  const out = `./public/${name}.png`
  await page.screenshot({ path: out, fullPage: false })
  console.log('saved', out)
}

await shot('glb-exterior', async () => {
  await page.click('button:has-text("轿车（GLB）")')
  await page.waitForTimeout(1500)
})

await shot('glb-interior', async () => {
  await page.click('button:has-text("轿车（GLB）")')
  await page.waitForTimeout(1500)
  await page.click('button:has-text("内饰")')
  await page.waitForTimeout(1500)
})

await browser.close()
