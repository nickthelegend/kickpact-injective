import { chromium } from "playwright"
import fs from "node:fs"

const SP = "/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-tether-kickpact-injective/c5814b27-7359-42f7-aefe-8b9266205c70/scratchpad"
const fontB64 = fs.readFileSync(`${SP}/kp.ttf`).toString("base64")

const shell = (inner) => `<!doctype html><html><head><meta charset="utf8"><style>
@font-face{font-family:KP;src:url(data:font/ttf;base64,${fontB64}) format('truetype')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;background:#10162e;overflow:hidden;font-family:KP,monospace;color:#627eea}
.wrap{width:1920px;height:1080px;position:relative;
  background-image:linear-gradient(rgba(98,126,234,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(98,126,234,.06) 1px,transparent 1px);
  background-size:48px 48px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.hair{position:absolute;left:0;right:0;height:2px;background:rgba(98,126,234,.55)}
.kick{position:absolute;top:150px;left:0;right:0;color:#8aa0f5;font-size:26px;letter-spacing:.4em}
.foot{position:absolute;bottom:150px;left:0;right:0;color:#8aa0f5;font-size:24px;letter-spacing:.28em}
.big{font-size:150px;color:#627eea;letter-spacing:.02em;line-height:1}
.mid{font-size:64px;color:#eaf0ff;margin-top:28px}
.sub{font-size:38px;color:#8aa0f5;margin-top:34px;letter-spacing:.14em}
.mono{font-size:26px;color:#8aa0f5;margin-top:22px;letter-spacing:.06em}
.gold{color:#e8b84b}
</style></head><body><div class="wrap"><div class="hair" style="top:200px"></div><div class="hair" style="bottom:200px"></div>${inner}</div></body></html>`

const cards = {
  intro: shell(`<div class="kick">KICKPACT</div><div class="big">THE&nbsp;APP</div><div class="sub">LIVE ON INJECTIVE EVM TESTNET</div><div class="foot">SELF-CUSTODIAL · ORACLE-SIGNED · SEMI-FINALS</div>`),
  outro: shell(`<div class="kick">WORLD CUP PREDICTION POOLS</div><div class="big">KICKPACT</div><div class="mid">Predict together.</div><div class="sub gold">TRUST THE DATA, NOT US</div><div class="mono">Kickpact 0x528c…62DB5 · Injective EVM testnet · verified on Blockscout</div><div class="foot">GET THE APP · ON INJECTIVE</div>`),
}

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage()
for (const [name, html] of Object.entries(cards)) {
  await page.setContent(html, { waitUntil: "networkidle" })
  await new Promise((r) => setTimeout(r, 400))
  await page.screenshot({ path: `${SP}/card-${name}.png` })
  console.log(`card-${name}.png written`)
}
await browser.close()
