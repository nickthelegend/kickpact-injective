// Capture fresh Injective app screenshots for the landing-page mockups.
//   DEMO_PK=0x... node demo/capture-mockups.mjs
import { chromium } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const MOCK = path.join(here, "..", "apps", "landing", "public", "mockups")
const URL = "http://localhost:8081"
const DEMO_PK = process.env.DEMO_PK
if (!DEMO_PK) throw new Error("set DEMO_PK")
const VP = { width: 440, height: 924 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function tap(page, text, which = "first") {
  const loc = page.getByText(text, { exact: false })
  const el = which === "last" ? loc.last() : loc.first()
  await el.waitFor({ state: "visible", timeout: 15000 })
  await el.click({ force: true })
}

const shots = [
  { file: "sol-00-connect", seed: false, async go(p) { await p.goto(URL); await p.getByText("Ready for the final?").waitFor({ timeout: 30000 }); await sleep(1500) } },
  { file: "sol-01-home", seed: true, async go(p) { await p.goto(URL); await p.getByText("Semi-finals").first().waitFor({ timeout: 30000 }); await sleep(2000) } },
  { file: "sol-02-match", seed: true, async go(p) { await p.goto(URL); await p.getByText("Argentina").first().waitFor({ timeout: 30000 }); await tap(p, "Argentina"); await p.getByText("OPEN A POOL").waitFor({ timeout: 20000 }); await sleep(1500) } },
  { file: "sol-04-duels", seed: true, async go(p) { await p.goto(URL); await p.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 }); await tap(p, "duels", "last"); await p.getByText("Nearby · Bluetooth").waitFor({ timeout: 15000 }); await sleep(1500) } },
  { file: "sol-05-nearby-room", seed: true, async go(p) { await p.goto(URL); await p.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 }); await tap(p, "duels", "last"); await tap(p, "Nearby · Bluetooth"); await p.getByText("Nearby room").waitFor({ timeout: 15000 }).catch(() => {}); await sleep(2000) } },
  { file: "sol-06-online-duel", seed: true, async go(p) { await p.goto(URL); await p.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 }); await tap(p, "duels", "last"); await tap(p, "Online · Duel code"); await p.getByText("PICK A MATCH").waitFor({ timeout: 15000 }).catch(() => {}); await sleep(1800) } },
  { file: "sol-07-receipts", seed: true, async go(p) { await p.goto(URL); await p.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 }); await tap(p, "receipts", "last"); await p.getByText(/SETTLED|OPEN/).first().waitFor({ timeout: 20000 }); await sleep(1800) } },
  { file: "sol-08-profile", seed: true, async go(p) { await p.goto(URL); await p.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 }); await tap(p, "profile", "last"); await p.getByText("Profile").first().waitFor({ timeout: 15000 }); await sleep(1500) } },
]

const browser = await chromium.launch()
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, colorScheme: "dark" })
  if (s.seed) await ctx.addInitScript((pk) => { try { window.localStorage.setItem("kickpact.injective.secret", pk) } catch {} }, DEMO_PK)
  const page = await ctx.newPage()
  try {
    await s.go(page)
    await page.screenshot({ path: path.join(MOCK, `${s.file}.png`) })
    console.log(`✓ ${s.file}.png`)
  } catch (e) {
    console.log(`! ${s.file}: ${e.message.slice(0, 80)}`)
  }
  await ctx.close()
}
await browser.close()
console.log("done")
