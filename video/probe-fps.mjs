import { chromium } from 'playwright-core'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const EXE = 'C://Users//Administrator//AppData//Local//ms-playwright//chromium-1248//chrome-win64//chrome.exe'
const PREFIX='/car-interior-configurator', SRC=path.resolve('dist'), PORT=8941
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'}
const server=http.createServer((req,res)=>{let p=decodeURIComponent((req.url||'').split('?')[0]);if(!p.startsWith(PREFIX)){res.writeHead(302,{Location:PREFIX+'/'});res.end();return}p=p.slice(PREFIX.length)||'/';if(p==='/')p='/index.html';fs.readFile(path.join(SRC,p),(e,b)=>{if(e){res.writeHead(404);res.end('x');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream','Cache-Control':'public, max-age=3600'});res.end(b)})})
await new Promise(r=>server.listen(PORT,'127.0.0.1',r))
const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 })
const p = await ctx.newPage()
p.setDefaultTimeout(180000)
await p.goto(`http://127.0.0.1:${PORT}${PREFIX}/`, {waitUntil:'load'})
await p.locator('.landing-start').click()
await p.waitForFunction(()=>!document.body.innerText.includes('加载中'),{timeout:180000,polling:400}).catch(()=>{})
await p.waitForTimeout(2500)
const fps = await p.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();const loop=()=>{n++;if(performance.now()-t0<2000)requestAnimationFrame(loop);else res(Math.round(n/((performance.now()-t0)/1000)))};requestAnimationFrame(loop)}))
console.log('exterior fps @1080p:', fps)
await p.click('button:has-text("内饰")')
await p.waitForTimeout(4000)
const fps2 = await p.evaluate(()=>new Promise(res=>{let n=0;const t0=performance.now();const loop=()=>{n++;if(performance.now()-t0<2000)requestAnimationFrame(loop);else res(Math.round(n/((performance.now()-t0)/1000)))};requestAnimationFrame(loop)}))
console.log('interior fps @1080p:', fps2)
await b.close(); server.close()
