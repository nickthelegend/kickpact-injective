/**
 * Record the Injective Kickpact web app, one clip per segment, by driving it
 * with Playwright (which captures real video). Seeds a funded testnet burner
 * into localStorage so the flow does real on-chain transactions on camera.
 *
 *   DEMO_PK=0x... node demo/record-web.mjs [only-segment-id]
 *
 * Clips land in demo/capture/<id>.webm. The app must be running at :8081.
 */
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const CAP = path.join(here, "capture")
fs.mkdirSync(CAP, { recursive: true })

const URL = process.env.APP_URL || "http://localhost:8081"
const DEMO_PK = process.env.DEMO_PK
if (!DEMO_PK) throw new Error("set DEMO_PK to the funded demo burner private key")
const ONLY = process.argv[2] || null

const VP = { width: 440, height: 860 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// tap a text label (RN-web renders text nodes); prefer the last match for
// buttons that collide with row labels, first for nav.
async function tap(page, text, { which = "first", timeout = 15000 } = {}) {
  const loc = page.getByText(text, { exact: false })
  const el = which === "last" ? loc.last() : loc.first()
  await el.waitFor({ state: "visible", timeout })
  await el.click({ force: true })
}

const segments = [
  {
    id: "01-onboarding",
    seed: false,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("Ready for the final?").waitFor({ timeout: 30000 })
      await sleep(3500)
      await tap(page, "CREATE A BURNER WALLET")
      await page.getByText("Back up your key").waitFor({ timeout: 15000 })
      await sleep(3500)
      await tap(page, "I'VE SAVED IT")
      await page.getByText("TOTAL BALANCE").waitFor({ timeout: 20000 })
      await sleep(2500)
    },
  },
  {
    id: "02-home",
    seed: true,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("World Cup", { exact: true }).first().waitFor({ timeout: 30000 })
      await sleep(3500)
      await page.mouse.wheel(0, 300)
      await sleep(3000)
      await page.mouse.wheel(0, 300)
      await sleep(3000)
    },
  },
  {
    id: "03-mint",
    seed: true,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 })
      await sleep(2000)
      await tap(page, "+ MINT", { which: "last" })
      // real faucet tx — wait for the balance/note to update
      await page.getByText(/minted 100 kUSD/).waitFor({ timeout: 40000 }).catch(() => {})
      await sleep(4000)
    },
  },
  {
    id: "04-bet",
    seed: true,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("Argentina").first().waitFor({ timeout: 30000 })
      await sleep(1500)
      await tap(page, "Argentina")
      await page.getByText("OPEN A POOL").waitFor({ timeout: 20000 })
      await sleep(3500)
      await tap(page, "CREATE POOL")
      // approve + create (two real txs)
      await page.getByText(/pool opened/).waitFor({ timeout: 60000 }).catch(() => {})
      await sleep(4000)
    },
  },
  {
    id: "05-duels",
    seed: true,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 })
      await sleep(1500)
      await tap(page, "duels", { which: "last" })
      await page.getByText("Nearby · Bluetooth").waitFor({ timeout: 15000 })
      await sleep(4000)
      await tap(page, "Nearby · Bluetooth")
      await page.getByText("Nearby room").waitFor({ timeout: 15000 }).catch(() => {})
      await sleep(4000)
    },
  },
  {
    id: "06-receipts",
    seed: true,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 })
      await sleep(1500)
      await tap(page, "receipts", { which: "last" })
      await page.getByText("SETTLED", { exact: false }).first().waitFor({ timeout: 20000 })
      await sleep(3000)
      // open the first settled receipt
      await tap(page, "SETTLED", { which: "first" })
      await page.getByText("ORACLE ATTESTATION").waitFor({ timeout: 20000 }).catch(() => {})
      // wait for the on-chain signature verification to resolve (bounded getLogs)
      await page.getByText(/VERIFIED ON-CHAIN/).waitFor({ timeout: 30000 }).catch(() => {})
      await sleep(4000)
    },
  },
  {
    id: "07-withdraw",
    seed: true,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 })
      await sleep(3000) // show the starting balance
      // the finished quarter-final you won (Brazil v Croatia)
      await tap(page, "completed")
      await page.getByText("Brazil").first().waitFor({ timeout: 20000 })
      await sleep(1500)
      await tap(page, "Brazil")
      // your settled winning pool shows a CLAIM button
      const claim = page.getByText("CLAIM", { exact: true }).last()
      await claim.waitFor({ state: "visible", timeout: 20000 })
      await sleep(2000)
      await claim.click({ force: true })
      // claim tx confirms; the card flips to CLAIMED ✓
      await page.getByText(/CLAIMED/).first().waitFor({ timeout: 45000 }).catch(() => {})
      await sleep(2500)
      // back home — the withdrawn winnings have landed in the wallet balance
      await tap(page, "BACK")
      await page.getByText("TOTAL BALANCE").waitFor({ timeout: 20000 })
      await sleep(5000) // hold on the new, higher balance
    },
  },
  {
    id: "08-online",
    seed: true,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 })
      await sleep(1500)
      await tap(page, "duels", { which: "last" })
      await page.getByText("Online · Duel code").waitFor({ timeout: 15000 })
      await sleep(2500)
      await tap(page, "Online · Duel code")
      await page.getByText("PICK A MATCH").waitFor({ timeout: 15000 }).catch(() => {})
      await sleep(1800)
      // pick a semi-final in the fixture strip
      await page.getByText(/ARG v FRA/).first().click({ force: true }).catch(async () => {
        await page.getByText(/v FRA/).first().click({ force: true }).catch(() => {})
      })
      await sleep(1800)
      await tap(page, "CREATE DUEL")
      // shows the shareable duel code
      await page.getByText("DUEL CODE").waitFor({ timeout: 45000 }).catch(() => {})
      await sleep(4500)
    },
  },
  {
    id: "09-profile",
    seed: true,
    async run(page) {
      await page.goto(URL, { waitUntil: "domcontentloaded" })
      await page.getByText("TOTAL BALANCE").waitFor({ timeout: 30000 })
      await sleep(1500)
      await tap(page, "profile", { which: "last" })
      await page.getByText("Profile").first().waitFor({ timeout: 15000 })
      await sleep(6000) // hold on the self-custody wallet details
    },
  },
]

const run = async () => {
  const browser = await chromium.launch({ headless: true })
  for (const seg of segments) {
    if (ONLY && seg.id !== ONLY) continue
    console.log(`▶ recording ${seg.id}…`)
    const context = await browser.newContext({
      viewport: VP,
      deviceScaleFactor: 2,
      recordVideo: { dir: CAP, size: VP },
      colorScheme: "dark",
    })
    if (seg.seed) {
      await context.addInitScript((pk) => {
        try {
          window.localStorage.setItem("kickpact.injective.secret", pk)
        } catch {}
      }, DEMO_PK)
    }
    const page = await context.newPage()
    let err = null
    try {
      await seg.run(page)
    } catch (e) {
      err = e
      console.log(`  ! ${seg.id}: ${e.message.slice(0, 120)}`)
    }
    const vid = page.video()
    await context.close() // finalizes the video file
    if (vid) {
      const src = await vid.path()
      const dst = path.join(CAP, `${seg.id}.webm`)
      fs.copyFileSync(src, dst)
      fs.rmSync(src, { force: true })
      const kb = Math.round(fs.statSync(dst).size / 1024)
      console.log(`  ✓ ${seg.id}.webm (${kb} KB)${err ? " [with a soft error]" : ""}`)
    }
  }
  await browser.close()
  console.log("done.")
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
