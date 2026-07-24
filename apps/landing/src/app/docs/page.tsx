"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

const REPO = "https://github.com/nickthelegend/kickpact/tree/solana"
const SCAN = "https://testnet.blockscout.injective.network/address"
const CLUSTER = ""

const STEPS = [
  {
    n: "01",
    t: "Bring a wallet",
    d: "Sign in for a Privy embedded EVM wallet, or connect MetaMask or any EVM wallet — it keeps the keys and signs; Kickpact only sees your address. Want no accounts at all? A burner keypair is generated on-device and sealed in the OS keychain.",
  },
  {
    n: "02",
    t: "Mint some kUSD",
    d: "kUSD is the demo stake token (an ERC-20, 6dp) with an open faucet — tap MINT for 100. Gas is testnet INJ from testnet.faucet.injective.network.",
  },
  {
    n: "03",
    t: "Pick a match",
    d: "Home lists the World Cup straight from API-Football, with live scores and bookmaker odds turned into implied probabilities.",
  },
  {
    n: "04",
    t: "Pot up",
    d: "Open a pool on the match, or head to Duels: find friends nearby over Bluetooth and invite the whole room, or share a duel code with friends anywhere. Everyone stakes the same and picks a side.",
  },
  {
    n: "05",
    t: "The signed score settles it",
    d: "After full time anyone submits the oracle-signed final score. The contract verifies the signature against the oracle key and derives the outcome on-chain — winners split the pot, and every settlement keeps a receipt you can re-verify.",
  },
]

const ACCOUNTS: [string, string, string][] = [
  ["oracle signer", "the key every settled score is checked against", "0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a"],
]

const ENDPOINTS: [string, string][] = [
  ["GET /fixtures?league=1&season=2026", "the World Cup schedule"],
  ["GET /fixtures?id={fixtureId}", "one fixture — live score + status"],
  ["GET /odds?fixture={fixtureId}&bet=1", "1X2 odds → implied probability"],
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
            <code className="text-[#8aa0f5] font-pixel text-xs">settle(fixtureId, homeGoals, awayGoals, signature)</code> is permissionless — anyone may call it. The caller hands over the final score and the oracle&apos;s signature over it. The contract then, <span className="text-white">on-chain</span>, recovers the signer from the signature, checks it equals the fixed oracle key, and builds the outcome from the score itself (home = home goals &gt; away, draw = equal, away = away &gt; home). It also refuses a score for the wrong fixture, an expired or replayed signature, or anything the oracle key didn&apos;t sign.
          </p>
          <p className="text-white/60 leading-relaxed mt-4">
            So the caller can carry the score to the chain, but can&apos;t change what it says. Submit a score the oracle never signed and signature recovery fails and the transaction reverts. The pot can only ever open to what the oracle actually signed.
          </p>
        </div>
      </section>

      {/* on-chain */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="font-display text-2xl text-white mb-2">On-chain — Injective EVM testnet</h2>
        <p className="text-white/45 text-sm mb-5">Chain ID 1439 · the escrow and kUSD are a Solidity contract and an ERC-20, verified on Blockscout. Settlements are checked against the oracle signer below.</p>
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

      {/* match data */}
      <section className="max-w-4xl mx-auto px-4 pb-24">
        <h2 className="font-display text-2xl text-white mb-2">The API-Football endpoints we use</h2>
        <p className="text-white/45 text-sm mb-5">Live World Cup fixtures, scores and 1X2 odds — authenticated with a single x-apisports-key header.</p>
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
