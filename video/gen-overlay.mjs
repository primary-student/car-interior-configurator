/**
 * 生成视频叠加层：每条字幕一张透明 PNG + 片尾品牌卡。
 * 用 HTML 渲染而不是 ffmpeg drawtext，中文排版（字距/字重）才控得住。
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const EXE = 'C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe'
const OUT = path.resolve('video/overlay')
fs.mkdirSync(OUT, { recursive: true })

const CAPTIONS = [
  '外面给世界看，里面给自己',
  '内秀 NEIXIU · 3D 汽车内饰定制',
  '拖拽转身 · 滚轮靠近',
  '四套搭配方案，一键切换',
  '沉稳商务 · 运动红黑 · 青春气息',
  '车顶自动让开',
  '机位固定在前排两座之间',
  '点哪一块，改哪一块',
]

const FONT = `'Microsoft YaHei Light', 'Microsoft YaHei', 'PingFang SC', sans-serif`

const capHTML = (text) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  .cap{display:inline-flex;align-items:center;gap:14px;padding:0 4px;
       font-family:${FONT};font-size:26px;font-weight:300;letter-spacing:.14em;
       color:#f4efe8;text-shadow:0 2px 14px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.6);
       white-space:nowrap}
  .bar{width:2px;height:30px;background:#b48552;box-shadow:0 0 10px rgba(180,133,82,.6)}
</style></head><body><div class="cap"><span class="bar"></span><span>${text}</span></div></body></html>`

const endHTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1920px;height:1080px;background:#08090a;overflow:hidden}
  .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:${FONT};color:#f4efe8}
  .glow{position:absolute;width:1100px;height:1100px;border-radius:50%;
        background:radial-gradient(circle,rgba(160,110,60,.18),rgba(160,110,60,0) 66%);
        left:50%;top:50%;transform:translate(-50%,-50%)}
  .name{font-size:132px;font-weight:300;letter-spacing:.30em;text-indent:.30em;line-height:1;
        color:#f7f2ea;position:relative}
  .en{margin-top:34px;font-size:20px;letter-spacing:.62em;text-indent:.62em;color:#c9a678;font-weight:300}
  .rule{width:96px;height:1px;background:linear-gradient(90deg,transparent,#b48552,transparent);margin:44px 0 40px}
  .desc{font-size:27px;font-weight:300;letter-spacing:.22em;text-indent:.22em;color:#efe8de;opacity:.94}
  .foot{position:absolute;bottom:76px;font-size:15px;letter-spacing:.34em;text-indent:.34em;
        color:#7d7873;font-weight:300}
</style></head><body><div class="wrap"><div class="glow"></div>
  <div class="name">内秀</div><div class="en">NEIXIU</div>
  <div class="rule"></div>
  <div class="desc">外面给世界看，里面给自己</div>
  <div class="foot">3D 汽车内饰定制 · 点选即换色</div>
</div></body></html>`

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] })

// 字幕：700x48 CSS → dsf 2 出 1400x96 像素
const capPage = await browser.newPage({ viewport: { width: 760, height: 60 }, deviceScaleFactor: 2 })
for (let i = 0; i < CAPTIONS.length; i++) {
  await capPage.setContent(capHTML(CAPTIONS[i]))
  await capPage.waitForTimeout(120)
  const el = capPage.locator('.cap')
  await el.screenshot({ path: path.join(OUT, `cap_${i + 1}.png`), omitBackground: true })
  const box = await el.boundingBox()
  console.log(`cap_${i + 1}: ${Math.round(box.width * 2)}x${Math.round(box.height * 2)}`)
}

const endPage = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
await endPage.setContent(endHTML)
await endPage.waitForTimeout(200)
await endPage.screenshot({ path: path.join(OUT, 'endcard.png') })
console.log('endcard ok')

await browser.close()
