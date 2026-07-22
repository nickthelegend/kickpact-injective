"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

const REPO = "https://github.com/nickthelegend/kickpact/tree/solana"
const SCAN = "https://explorer.solana.com/address"
const CLUSTER = "?cluster=devnet"

const STEPS = [
  {
    n: "01",
    t: "Bring a wallet",
    d: "Connect Phantom, Solflare, or any Mobile Wallet Adapter wallet — it keeps the keys and signs; Kickpact only sees your public key. No wallet app? A burner keypair is generated on-device and sealed in the OS keychain.",
  },
  {
    n: "02",
    t: "Mint some kUSD",
    d: "kUSD is the demo stake token (6dp) with an open faucet — tap MINT for 100. Gas is devnet SOL: solana airdrop 1 <you> -u devnet.",
  },
  {
    n: "03",
    t: "Pick a match",
    d: "Home lists the World Cup straight from TxLINE (competition 72), with live scores and StablePrice odds turned into implied probabilities.",
  },
  {
    n: "04",
    t: "Pot up",
    d: "Open a pool on the match, or head to Duels: find friends nearby over Bluetooth and invite the whole room, or share a duel code with friends anywhere. Everyone stakes the same and picks a side.",
  },
  {
    n: "05",
    t: "The proof settles it",
    d: "After full time anyone submits TxLINE's Merkle proof of the final goals. The program rebuilds the predicate on-chain and CPIs into validate_stat_v2 — winners split the pot, and every settlement keeps a receipt you can re-verify.",
  },
]

const ACCOUNTS: [string, string, string][] = [
  ["kickpact", "pools, duels + proof settlement", "4tAPD5tVaWt9TBSMGKfUnguppbg8KLcc2jXbBPufgWDa"],
  ["txoracle", "TxLINE's oracle (devnet) we CPI into", "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"],
]

const ENDPOINTS: [string, string][] = [
  ["GET /api/fixtures/snapshot?competitionId=72", "the World Cup schedule"],
  ["GET /api/scores/snapshot/{fixtureId}", "live score + game phase"],
  ["GET /api/odds/snapshot/{fixtureId}", "StablePrice odds → implied probability"],
  ["GET /api/scores/stream · /api/odds/stream", "SSE, resumed with Last-Event-ID"],
  ["GET /api/scores/stat-validation?statKeys=1,2", "the Merkle proof that settles a pool"],
]

export default function DocsPage() {
  return (
    <main className="pt-16 min-h-screen">
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-10 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-4">HOW IT WORKS</div>
          <h1 className="font-display text-4xl md:text-5xl text-white">From tap to payout</h1>
          <p className="text-white/55 mt-4 max-w-xl mx-auto">
            Five steps, no custodian anywhere in them.
          </p>
        </motion.div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        {STEPS.map((s, i) => (
          <motion.div key={s.n} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            transition={{ delay: i * 0.05, duration: 0.4 }} className="flex gap-5 py-5">
            <div className="font-display text-3xl text-[#627eea] shrink-0 w-14">{s.n}</div>
            <div>
              <div className="font-pixel text-sm tracking-wide text-white">{s.t}</div>
              <p className="text-white/55 text-sm leading-relaxed mt-2">{s.d}</p>
            </div>
          </motion.div>
        ))}
      </section>

      {/* the settlement explainer */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="kp-panel p-8 border-[#e8b84b]/30">
          <div className="font-pixel text-[10px] tracking-widest text-[#e8b84b] mb-3">WHY YOU CAN&apos;T CHEAT IT</div>
          <p className="text-white/60 leading-relaxed">
            <code className="text-[#8aa0f5] font-pixel text-xs">settle(outcome, payload)</code> is permissionless — anyone may call it. The caller says which outcome they think happened and hands over TxLINE&apos;s proof of both final goal counts. The program then, <span className="text-white">on-chain</span>, builds the predicate for that claim (home = P1 goals &gt; P2, draw = equal, away = P2 &gt; P1) and asks the oracle to validate it. It also refuses a proof for the wrong fixture, one missing either goal stat, one that isn&apos;t final, or a roots account that isn&apos;t the oracle&apos;s real PDA for that proof&apos;s epoch day.
          </p>
          <p className="text-white/60 leading-relaxed mt-4">
            So the caller can pick <em>which</em> claim to test, but not <em>whether</em> it&apos;s true. Claim the wrong winner and the CPI returns false and the transaction reverts. The pot can only ever open to what the match actually did.
          </p>
        </div>
      </section>

      {/* on-chain */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="font-display text-2xl text-white mb-5">On-chain — Solana devnet</h2>
        <div className="kp-panel divide-y divide-white/10">
          {ACCOUNTS.map(([name, what, addr]) => (
            <div key={name} className="p-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="sm:w-40 shrink-0">
                <div className="font-pixel text-xs text-white">{name}</div>
                <div className="text-white/40 text-xs mt-1">{what}</div>
              </div>
              <Link href={`${SCAN}/${addr}${CLUSTER}`} target="_blank"
                className="font-pixel text-[10px] text-[#8aa0f5] hover:text-white break-all underline underline-offset-4">
                {addr}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* txline */}
      <section className="max-w-4xl mx-auto px-4 pb-24">
        <h2 className="font-display text-2xl text-white mb-2">The TxLINE endpoints we use</h2>
        <p className="text-white/45 text-sm mb-5">Free World Cup tier — guest JWT, then an on-chain subscribe activates the API token.</p>
        <div className="kp-panel divide-y divide-white/10">
          {ENDPOINTS.map(([ep, what]) => (
            <div key={ep} className="p-4 flex flex-col sm:flex-row sm:justify-between gap-1">
              <code className="font-pixel text-[10px] text-[#8aa0f5] break-all">{ep}</code>
              <span className="text-white/45 text-xs shrink-0 sm:pl-6">{what}</span>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link href={REPO} target="_blank">
            <Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl px-6 py-5">
              ★ FULL TECHNICAL DOCS
            </Button>
          </Link>
        </div>
      </section>
    </main>
  )
}
