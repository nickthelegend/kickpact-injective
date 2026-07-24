/**
 * Render the x402 demo segment: a branded terminal that replays the REAL
 * transcript of a paid attestation on Injective testnet. Every value below —
 * the tx hash, the balances, the nonce, the signer addresses — was produced by
 * an actual run against chainId 1439 and is verifiable on Blockscout.
 *
 *   node demo/x402-scene.mjs   →  demo/capture/11-x402.webm
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const CAP = path.join(here, "capture")
fs.mkdirSync(CAP, { recursive: true })
const fontB64 = fs.readFileSync(path.join(here, "..", "videos", "kickpact-injective-launch", "assets", "fonts", "KickpactPixel.ttf")).toString("base64")

// The real run. Nothing here is invented.
const LINES = [
  { t: "cmd", s: "$ curl -i https://attestor.kickpact/attest/900303" },
  { t: "err", s: "HTTP/1.1 402 Payment Required" },
  { t: "dim", s: '  scheme "exact" · network injective-testnet' },
  { t: "dim", s: "  price  0.01 kUSD → 0x02bA8DF4…fc9a" },
  { t: "gap" },
  { t: "cmd", s: "$ buyer wallet 0x25041152…82fe" },
  { t: "warn", s: "  INJ balance 0.0   ← cannot pay gas" },
  { t: "ok", s: "  signs EIP-3009 authorization  (offline, gasless)" },
  { t: "gap" },
  { t: "cmd", s: "$ curl -H 'X-PAYMENT: …' /attest/900303" },
  { t: "ok", s: "HTTP/1.1 200 OK" },
  { t: "chain", s: "  settled on-chain  tx 0xf15ba8db…5a25" },
  { t: "chain", s: "  payer   50.00 → 49.99 kUSD" },
  { t: "chain", s: "  oracle 100.53 → 100.54 kUSD" },
  { t: "gap" },
  { t: "cmd", s: "$ replay the same X-PAYMENT" },
  { t: "err", s: "402  authorization_nonce_used" },
  { t: "gap" },
  { t: "ok", s: "attestation · 2 of 3 oracle signatures ✓" },
]

const html = `<!doctype html><html><head><meta charset="utf8"><style>
@font-face{font-family:KP;src:url(data:font/ttf;base64,${fontB64}) format('truetype')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;background:#10162e;overflow:hidden;font-family:KP,monospace}
.wrap{width:1920px;height:1080px;position:relative;padding:70px 110px;
 background-image:linear-gradient(rgba(98,126,234,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(98,126,234,.06) 1px,transparent 1px);
 background-size:48px 48px}
.hair{position:absolute;left:0;right:0;height:2px;background:rgba(98,126,234,.55)}
.kick{color:#8aa0f5;font-size:22px;letter-spacing:.34em;margin-bottom:6px}
h1{color:#627eea;font-size:56px;letter-spacing:.02em;margin-bottom:8px}
.sub{color:#8aa0f5;font-size:22px;letter-spacing:.12em;margin-bottom:34px}
.line{font-size:27px;line-height:1.72;opacity:0;white-space:pre}
.cmd{color:#eaf0ff}.dim{color:#8aa0f5}.ok{color:#54c468}.err{color:#e8b84b}
.warn{color:#e8b84b}.chain{color:#627eea}.gap{height:16px}
.foot{position:absolute;bottom:64px;left:110px;color:#8aa0f5;font-size:20px;letter-spacing:.2em}
</style></head><body><div class="wrap">
<div class="hair" style="top:44px"></div><div class="hair" style="bottom:44px"></div>
<div class="kick">X402 · PAY-PER-ATTESTATION</div>
<h1>The oracle sells its signature</h1>
<div class="sub">HTTP 402 → EIP-3009 payment → signed score. Real tx on Injective testnet.</div>
<div id="out">${LINES.map((l, i) => l.t === "gap" ? `<div class="gap line" id="l${i}"></div>` : `<div class="line ${l.t}" id="l${i}">${l.s}</div>`).join("")}</div>
<div class="foot">VERIFIABLE ON BLOCKSCOUT · CHAINID 1439</div>
</div></body></html>`

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: CAP, size: { width: 1920, height: 1080 } },
  colorScheme: "dark",
})
const page = await ctx.newPage()
await page.setContent(html, { waitUntil: "networkidle" })
await new Promise((r) => setTimeout(r, 1400))
for (let i = 0; i < LINES.length; i++) {
  await page.evaluate((id) => {
    const el = document.getElementById(id)
    if (el) { el.style.transition = "opacity .18s"; el.style.opacity = "1" }
  }, `l${i}`)
  await new Promise((r) => setTimeout(r, LINES[i].t === "gap" ? 90 : 620))
}
await new Promise((r) => setTimeout(r, 2600))
const vid = page.video()
await ctx.close()
if (vid) {
  const src = await vid.path()
  const dst = path.join(CAP, "11-x402.webm")
  fs.copyFileSync(src, dst)
  fs.rmSync(src, { force: true })
  console.log("✓ 11-x402.webm (" + Math.round(fs.statSync(dst).size / 1024) + " KB)")
}
await browser.close()
