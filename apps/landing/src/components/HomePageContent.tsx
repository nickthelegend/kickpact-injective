"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

const REPO = "https://github.com/nickthelegend/kickpact/tree/solana"
const DASHBOARD = "https://kickpact-solana.vercel.app"

const WAYS = [
  {
    icon: "📡",
    name: "Bluetooth duels",
    desc: "Friends in the room with you? Find each other over Bluetooth, talk trash in the room chat, and pot up — the invite never touches a server.",
  },
  {
    icon: "🌐",
    name: "Online duels",
    desc: "Friends across the world? Open a duel, share the code, and everyone lands in the same on-chain pot.",
  },
  {
    icon: "🏆",
    name: "Group pools",
    desc: "Everyone stakes the same and picks a side. Winners split the pot; if nobody called it, everyone refunds.",
  },
  {
    icon: "🧾",
    name: "Proof receipts",
    desc: "Every settlement shows its work — the Merkle proof, the roots account, the validation call. Verify it yourself, in the app.",
  },
]

function Mock({ src, w = 250, className = "" }: { src: string; w?: number; className?: string }) {
  return (
    <div className={`kp-panel overflow-hidden ${className}`} style={{ width: w }}>
      <Image src={src} alt="Kickpact screen" width={1080} height={2400} className="w-full h-auto block" />
    </div>
  )
}

export default function HomePageContent() {
  return (
    <main className="pt-16">
      {/* ── HERO ── */}
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-16 md:pt-28">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0, duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-[#627eea]/40 bg-[#627eea]/10 px-3 py-1 mb-6">
              <span className="font-pixel text-[10px] tracking-widest text-[#8aa0f5]">BLUETOOTH DUELS · TXLINE PROOF · SOLANA</span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5 }}
              className="font-display text-5xl md:text-6xl leading-[1.05] text-white">
              Bet the mate<br /><span className="text-[#627eea]">sitting next</span> to you.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.5 }}
              className="mt-5 text-white/60 text-lg max-w-md leading-relaxed">
              Kickpact finds the friends in the room with you <span className="text-white">over Bluetooth</span> — no server,
              no signal, nothing in the middle. You both stake into the same Solana escrow, and it pays out only what{" "}
              <span className="text-white">TxLINE&apos;s cryptographic proof</span> of the final score supports.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.5 }} className="mt-8 flex flex-wrap gap-3">
              <Link href="/download">
                <Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl px-6 py-6 transition-all hover:shadow-[0_0_22px_rgba(98,126,234,0.55)]">
                  ⬇ GET THE APP
                </Button>
              </Link>
              <Link href={DASHBOARD} target="_blank">
                <Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-6 py-6">
                  ▶ LIVE DASHBOARD
                </Button>
              </Link>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.5 }} className="mt-8 flex gap-6">
              {[["0", "servers between you"], ["0", "trusted oracles"], ["CPI", "settled on-chain"]].map(([n, l]) => (
                <div key={l}>
                  <div className="font-display text-3xl text-white">{n}</div>
                  <div className="font-pixel text-[9px] tracking-widest text-white/45 uppercase">{l}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="relative flex justify-center">
            {/* the nearby room leads now — the headline is about Bluetooth, so the
                hero image should be the thing the headline is talking about */}
            <Mock src="/mockups/sol-05-nearby-room.png" w={260} className="kp-glow rotate-[-4deg] z-10" />
            <Mock src="/mockups/sol-02-match.png" w={220} className="absolute -right-2 top-16 rotate-[6deg] opacity-90 hidden sm:block" />
          </motion.div>
        </div>
      </section>

      {/* ── HOW THE MONEY MOVES ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="kp-panel p-8 md:p-12 border-[#e8b84b]/30">
          <div className="font-pixel text-[10px] tracking-widest text-[#e8b84b] mb-3">THE WHOLE TRICK</div>
          <h2 className="font-display text-3xl md:text-4xl text-white leading-tight max-w-2xl">
            Anyone can settle the pot. Only the truth settles it.
          </h2>
          <p className="mt-4 text-white/60 leading-relaxed max-w-3xl">
            When the match ends, <span className="text-white">anyone</span> — a friend, a keeper bot, a stranger — submits TxLINE&apos;s Merkle proof of the final goals. Our program doesn&apos;t take their word for the result: it rebuilds the winning condition <span className="text-white">on-chain</span> from what they claimed, then calls into TxLINE&apos;s{" "}
            <code className="text-[#8aa0f5] font-pixel text-xs">validate_stat_v2</code> to check it against the roots TxODDS anchored on Solana. Lie about the score and the transaction simply fails.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mt-8">
            {[
              ["1", "Everyone stakes", "Equal kUSD into a program escrow. Pick home, draw or away."],
              ["2", "The match happens", "TxLINE streams the scores and anchors them on Solana."],
              ["3", "The proof pays", "A proof settles the pool by CPI; winners split. Nobody right? Everyone refunds."],
            ].map(([n, t, d]) => (
              <div key={n} className="kp-panel p-5">
                <div className="font-display text-2xl text-[#627eea]">{n}</div>
                <div className="font-pixel text-xs tracking-wide text-white mt-2">{t}</div>
                <p className="text-white/50 text-sm leading-relaxed mt-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WAYS TO PLAY ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="font-display text-3xl md:text-4xl text-white text-center">Four ways in — one pot</h2>
        <p className="text-center text-white/50 mt-3 max-w-xl mx-auto">
          However your friends gather, the money always lands in the same on-chain escrow.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
          {WAYS.map((t, i) => (
            <motion.div key={t.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5 }}
              className="kp-panel p-5">
              <div className="text-3xl mb-3">{t.icon}</div>
              <div className="font-pixel text-sm tracking-wide text-white mb-2">{t.name}</div>
              <p className="text-white/55 text-sm leading-relaxed">{t.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── BLUETOOTH ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="kp-panel p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center border-[#627eea]/30">
          <div>
            <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-3">NEARBY · NO SERVER</div>
            <h2 className="font-display text-3xl md:text-4xl text-white leading-tight">Watching together? Bet together.</h2>
            <p className="mt-4 text-white/60 leading-relaxed">
              Kickpact finds the friends in the room with you over Bluetooth — Google Nearby Connections, a real mesh, no internet needed to coordinate. Chat in the room, and when the host opens a duel every phone gets the invite and joins the same pot.
            </p>
            <p className="mt-4 text-white/80">
              Bluetooth carries the chat and the invite. <span className="text-[#627eea]">The money never leaves Solana.</span>
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <Mock src="/mockups/sol-05-nearby-room.png" w={200} className="rotate-[-3deg]" />
            <Mock src="/mockups/sol-04-duels.png" w={200} className="rotate-[3deg] mt-8 hidden sm:block" />
          </div>
        </div>
      </section>

      {/* ── RECEIPTS ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="kp-panel p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center border-[#e8b84b]/30">
          <div className="flex justify-center order-2 md:order-1">
            <Mock src="/mockups/sol-07-receipts.png" w={230} className="rotate-[-2deg]" />
          </div>
          <div className="order-1 md:order-2">
            <div className="font-pixel text-[10px] tracking-widest text-[#e8b84b] mb-3">RECEIPTS · VERIFY IT YOURSELF</div>
            <h2 className="font-display text-3xl md:text-4xl text-white leading-tight">Don&apos;t trust us. Check.</h2>
            <p className="mt-4 text-white/60 leading-relaxed">
              Every settled pool keeps its receipt: the stats that were proven, the Merkle branches, the daily-roots account it was checked against, and the transaction that did it. Tap verify and the app re-runs the oracle&apos;s validation live — you never have to take our word for a result.
            </p>
            <Link href={DASHBOARD} target="_blank" className="inline-block mt-5">
              <Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-5 py-5">
                OPEN THE DASHBOARD →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h2 className="font-display text-4xl md:text-5xl text-white">Your keys. Your pot.<br />The match decides.</h2>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link href="/download">
            <Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl px-6 py-6">
              ⬇ GET THE APP
            </Button>
          </Link>
          <Link href={REPO} target="_blank">
            <Button variant="outline" className="font-pixel text-xs tracking-wider border-white/20 bg-transparent text-white hover:bg-white/5 rounded-xl px-6 py-6">
              ★ VIEW ON GITHUB
            </Button>
          </Link>
        </div>
      </section>
    </main>
  )
}
