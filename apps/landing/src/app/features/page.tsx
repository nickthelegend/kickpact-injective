"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

const PROGRAM = "4tAPD5tVaWt9TBSMGKfUnguppbg8KLcc2jXbBPufgWDa"
const REPO = "https://github.com/nickthelegend/kickpact/tree/solana"

const FEATURES = [
  {
    tag: "SETTLEMENT · CPI",
    title: "The oracle decides, not us",
    body: "When the match ends, anyone submits TxLINE's Merkle proof of the final goals. Our program doesn't trust the sender: it rebuilds the winning predicate on-chain from the outcome they claimed, then CPIs into TxLINE's validate_stat_v2 to check it against the roots TxODDS anchored on Solana. The only outcome that can settle a pool is the one the proof supports — a lying keeper just gets a failed transaction. There is no admin override, because there's nothing for an admin to decide.",
    shot: "sol-07-receipts",
  },
  {
    tag: "WALLET · MWA",
    title: "Your keys stay in your wallet app",
    body: "Connect Phantom, Solflare, or any Mobile Wallet Adapter wallet — it holds the keys and signs; Kickpact only ever sees your public key, and the session reconnects silently next launch. No wallet app? A burner keypair, generated on-device and sealed in the OS keychain, gets you playing in one tap. Either way nobody custodies your money.",
    shot: "sol-00-connect",
  },
  {
    tag: "NEARBY · BLUETOOTH",
    title: "The friends in the room with you",
    body: "Open the Nearby room and Kickpact finds the other phones around you over Google Nearby Connections — a real Bluetooth/Wi-Fi mesh, no server and no internet needed to coordinate. Chat in the room, and when the host opens a duel the invite hops straight to everyone's phone and they join the same pot. Bluetooth carries the banter and the invite; the money never leaves Solana.",
    shot: "sol-05-nearby-room",
  },
  {
    tag: "DUELS · ANYWHERE",
    title: "A code is all it takes",
    body: "Friends not in the room? Open a duel and share the code. They type it in, pick a side, and they're in the same escrow — from anywhere. The join window runs to the 75th minute, so nobody's locked out for showing up at kickoff.",
    shot: "sol-06-online-duel",
  },
  {
    tag: "POOLS · MANY PLAYERS",
    title: "Everyone stakes, winners split",
    body: "A pool is one primitive: equal stakes, one pick each (home / draw / away), one pot. Call it right and you split the pot with the others who did. Nobody right? Everyone refunds. If no valid proof ever settles it, a 48-hour grace opens self-serve refunds — your stake can never get stuck.",
    shot: "sol-02-match",
  },
  {
    tag: "DATA · TXLINE",
    title: "Live scores, odds, and receipts",
    body: "Fixtures, live scores, and StablePrice odds stream from TxLINE — the same feed that produces the proofs, so what you bet on and what settles you are never two different sources. The app shows implied probabilities off the odds and keeps a receipt for every settlement you can re-verify against the oracle yourself.",
    shot: "sol-01-home",
  },
]

export default function FeaturesPage() {
  return (
    <main className="pt-16 min-h-screen">
      <section className="max-w-6xl mx-auto px-4 pt-20 pb-10 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-4">WHAT&apos;S INSIDE</div>
          <h1 className="font-display text-4xl md:text-5xl text-white">Built so nobody has to be trusted</h1>
          <p className="text-white/55 mt-4 max-w-2xl mx-auto">
            Not a bookie with a blockchain bolted on. The pot is a program account, and the only thing that can open it is a proof of what actually happened on the pitch.
          </p>
        </motion.div>
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-20">
        {FEATURES.map((f, i) => (
          <motion.div key={f.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className={`grid md:grid-cols-2 gap-8 items-center py-10 ${i % 2 ? "md:[direction:rtl]" : ""}`}>
            <div className="md:[direction:ltr]">
              <div className="font-pixel text-[10px] tracking-widest text-[#e8b84b] mb-3">{f.tag}</div>
              <h2 className="font-display text-2xl md:text-3xl text-white leading-tight">{f.title}</h2>
              <p className="mt-4 text-white/55 leading-relaxed">{f.body}</p>
            </div>
            <div className="flex justify-center md:[direction:ltr]">
              <div className="kp-panel overflow-hidden" style={{ width: 230 }}>
                <Image src={`/mockups/${f.shot}.png`} alt={f.title} width={1080} height={2400} className="w-full h-auto block" />
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-24 text-center">
        <div className="kp-panel p-8">
          <div className="font-pixel text-[10px] tracking-widest text-[#8aa0f5] mb-3">ON-CHAIN · DEVNET</div>
          <p className="font-pixel text-[11px] text-white/70 break-all leading-relaxed">{PROGRAM}</p>
          <p className="text-white/45 text-sm mt-3">
            The whole thing is open — the program, the keeper, the app, and the proofs it settles from.
          </p>
          <Link href={REPO} target="_blank" className="inline-block mt-5">
            <Button className="font-pixel text-xs tracking-wider bg-[#627eea] hover:bg-[#8aa0f5] text-white rounded-xl px-6 py-5">
              ★ READ THE CODE
            </Button>
          </Link>
        </div>
      </section>
    </main>
  )
}
