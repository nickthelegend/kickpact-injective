"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

// These are what the first paint serves, and what a visitor gets if the pointer
// fetch fails — a stale value here quietly hands people the wrong build. Android
// and desktop sit on different tags: v2.1.0 re-cut the APK only, so the desktop
// artefacts still live on v2.0.0 and pointing them at v2.1.0 404s.
const REL_ANDROID = "https://github.com/nickthelegend/kickpact/releases/download/v2.1.0-solana"
const REL_DESKTOP = "https://github.com/nickthelegend/kickpact/releases/download/v2.0.0-solana"
const REPO = "https://github.com/nickthelegend/kickpact/tree/solana"
const DASHBOARD = "https://kickpact-solana.vercel.app"

// Download targets are resolved at runtime from a raw pointer file in the repo,
// so the APK URL can be re-pointed (new release, mirror) by editing one file on
// `solana` — no landing redeploy. The URLs below are the fallback.
const POINTER = "https://raw.githubusercontent.com/nickthelegend/kickpact/solana/download.json"

const SHOTS: [string, string][] = [
  ["sol-00-connect", "Connect a real wallet"],
  ["sol-01-home", "Home — kUSD + live fixtures"],
  ["sol-02-match", "Match — TxLINE odds + pools"],
  ["sol-04-duels", "Duels — Bluetooth or online"],
  ["sol-05-nearby-room", "Nearby room — chat + pot up"],
  ["sol-06-online-duel", "Duel code — share it anywhere"],
  ["sol-07-receipts", "Receipts — every settlement"],
  ["sol-08-profile", "Profile — your keys"],
]

type Links = {
  apk: string
  mac: string
  win: string
  linux: string
  linuxArm: string
}

const FALLBACK: Links = {
  apk: `${REL_ANDROID}/kickpact-android-arm64.apk`,
  mac: `${REL_DESKTOP}/Kickpact-2.0.0-mac-arm64.dmg`,
  win: `${REL_DESKTOP}/Kickpact-2.0.0-win-x64.exe`,
  linux: `${REL_DESKTOP}/Kickpact-2.0.0-linux-x86_64.AppImage`,
  linuxArm: `${REL_DESKTOP}/Kickpact-2.0.0-linux-arm64.AppImage`,
}

export default function DownloadPage() {
  const [links, setLinks] = useState<Links>(FALLBACK)
  useEffect(() => {
    let alive = true
    fetch(POINTER, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return
        setLinks({
          apk: d?.android?.url ?? FALLBACK.apk,
          mac: d?.desktop?.mac?.url ?? FALLBACK.mac,
          win: d?.desktop?.windows?.url ?? FALLBACK.win,
          linux: d?.desktop?.linux?.url ?? FALLBACK.linux,
          linuxArm: d?.desktop?.linux_arm64?.url ?? FALLBACK.linuxArm,
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const apk = links.apk

  return (
    <main className="pt-16 min-h-screen">
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-10 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-4">GET KICKPACT</div>
          <h1 className="font-display text-4xl md:text-5xl text-white">Grab the app</h1>
          <p className="text-white/55 mt-4 max-w-xl mx-auto">
            Android and desktop, on Solana devnet, fed by live TxLINE World Cup data. Bluetooth duels need two phones in the same room — that&apos;s the fun part.
          </p>
        </motion.div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="grid sm:grid-cols-2 gap-4">
          {/* the app */}
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="kp-panel p-6 flex flex-col border-[#627eea]/40">
            <div className="text-4xl mb-3">📱</div>
            <div className="flex items-baseline gap-2">
              <div className="font-pixel text-base tracking-wide text-white">Android</div>
              <span className="font-pixel text-[9px] tracking-widest text-[#e8b84b] uppercase">the full app</span>
            </div>
            <p className="text-white/55 text-sm leading-relaxed mt-3 flex-1">
              The only client with Bluetooth duels and Mobile Wallet Adapter — connect a real wallet, pot up with the friends in the room, and watch a pool settle itself off a TxLINE proof.
            </p>
            <Link href={apk} target="_blank" className="mt-5">
              <Button className="w-full font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl py-6 transition-all hover:shadow-[0_0_18px_rgba(98,126,234,0.5)]">
                ⬇ Download APK
              </Button>
            </Link>
            <div className="font-pixel text-[9px] tracking-widest text-white/35 text-center mt-3 uppercase">
              arm64 · io.kickpact.app · devnet
            </div>
          </motion.div>

          {/* desktop — the same client, packaged with Electron */}
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.08 }}
            className="kp-panel p-6 flex flex-col border-[#e8b84b]/40">
            <div className="text-4xl mb-3">🖥️</div>
            <div className="flex items-baseline gap-2">
              <div className="font-pixel text-base tracking-wide text-white">Desktop</div>
              <span className="font-pixel text-[9px] tracking-widest text-[#e8b84b] uppercase">mac · win · linux</span>
            </div>
            <p className="text-white/55 text-sm leading-relaxed mt-3 flex-1">
              The same client, packaged with Electron — wallet, live TxLINE odds, pools, duel codes and proof receipts. Bluetooth duels stay on the phone.
            </p>
            <Link href={links.mac} target="_blank" className="mt-5">
              <Button className="w-full font-pixel text-xs tracking-wider bg-[#e8b84b] hover:bg-[#f3cd72] text-[#10162e] rounded-xl py-6 transition-all">
                ⬇ Download for macOS
              </Button>
            </Link>
            <div className="flex gap-2 mt-2">
              <Link href={links.win} target="_blank" className="flex-1">
                <Button variant="outline" className="w-full font-pixel text-[10px] tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl py-4">
                  ⬇ WINDOWS
                </Button>
              </Link>
              <Link href={links.linux} target="_blank" className="flex-1">
                <Button variant="outline" className="w-full font-pixel text-[10px] tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl py-4">
                  ⬇ LINUX
                </Button>
              </Link>
            </div>
            <div className="font-pixel text-[9px] tracking-widest text-white/35 text-center mt-3 uppercase">
              apple silicon · x64 · <Link href={links.linuxArm} target="_blank" className="underline hover:text-white/60">linux arm64</Link>
            </div>
          </motion.div>
        </div>

        {/* no install at all */}
        <div className="kp-panel p-5 mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="font-pixel text-xs tracking-wide text-white">Don&apos;t want to install anything?</div>
            <p className="text-white/50 text-sm mt-1">
              The dashboard runs in any browser — live odds, every pool on devnet, and a receipts explorer that re-runs the oracle&apos;s proof check right there.
            </p>
          </div>
          <Link href={DASHBOARD} target="_blank">
            <Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-5 py-5 whitespace-nowrap">
              Open the dashboard →
            </Button>
          </Link>
        </div>

        <div className="text-center mt-8">
          <Link href={REPO} target="_blank">
            <Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-6 py-5">
              ★ BUILD FROM SOURCE — GITHUB
            </Button>
          </Link>
        </div>

        <div className="kp-panel p-5 mt-8">
          <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-2">FIRST RUN</div>
          <ol className="text-white/55 text-sm leading-relaxed list-decimal pl-5 space-y-1">
            <li>Connect a Mobile Wallet Adapter wallet (Phantom/Solflare), or tap through to a burner.</li>
            <li>Hit <span className="text-white">MINT</span> for testnet kUSD. Need devnet SOL for gas? <code className="text-[#8aa0f5] text-xs">solana airdrop 1 &lt;you&gt; -u devnet</code></li>
            <li>Open a match, start a pool — or head to Duels and find a friend over Bluetooth.</li>
          </ol>
        </div>
      </section>

      {/* real screens */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <h2 className="font-display text-3xl text-white text-center mb-3">Real screens, real chain</h2>
        <p className="text-center text-white/50 mb-10">Captured from the release build against Solana devnet.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {SHOTS.map(([s, label]) => (
            <div key={s} className="text-center">
              <div className="kp-panel overflow-hidden inline-block">
                <Image src={`/mockups/${s}.png`} alt={label} width={1080} height={2400} className="w-full h-auto block max-w-[240px]" />
              </div>
              <div className="font-pixel text-[10px] tracking-wider text-white/50 mt-3 uppercase">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
