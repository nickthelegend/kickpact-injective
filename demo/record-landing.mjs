// Record the Kickpact landing / download page as a 1920x1080 scroll.
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const CAP = path.join(here, "capture")
const URL = process.env.LANDING_URL || "http://localhost:3060/download"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: CAP, size: { width: 1920, height: 1080 } },
  colorScheme: "dark",
})
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: "networkidle" }).catch(() => {})
await sleep(500)
await page.screenshot({ path: path.join(CAP, "landing-top.png") }).catch(() => {})
await sleep(3200) // hold on the hero / download CTA
// smooth scroll down through the page (mockups, steps)
const total = await page.evaluate(() => document.body.scrollHeight)
let y = 0
const step = 260
while (y < total - 1080) {
  await page.mouse.wheel(0, step)
  y += step
  await sleep(320)
}
await sleep(2500) // hold at the bottom
const vid = page.video()
await ctx.close()
if (vid) {
  const src = await vid.path()
  const dst = path.join(CAP, "10-landing.webm")
  fs.copyFileSync(src, dst)
  fs.rmSync(src, { force: true })
  console.log("✓ 10-landing.webm (" + Math.round(fs.statSync(dst).size / 1024) + " KB)")
}
await browser.close()
