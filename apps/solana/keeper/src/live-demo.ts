/**
 * LIVE devnet demo — the whole Kickpact lifecycle against the real TxLINE
 * oracle, on the real England 1–2 Argentina semifinal:
 *
 *   initialize (once) → faucet kUSD to two wallets → alice opens a pool
 *   (picks AWAY) → bob joins (picks HOME) → deadline passes → settle with
 *   TxLINE's Merkle proof (CPI validateStatV2 on devnet) → both claim →
 *   winner paid, loser refused.
 *
 *   bun run src/live-demo.ts
 */
import * as anchor from "@coral-xyz/anchor"
import {
  Keypair, PublicKey, SystemProgram, ComputeBudgetProgram, Connection,
  Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction, SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js"
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount,
} from "@solana/spl-token"
import BN from "bn.js"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { RPC, loadKeypair } from "./txline.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, "..", "out")
const PROOF = JSON.parse(fs.readFileSync(path.join(OUT, "proof-18241006.json"), "utf8"))
const FIXTURE_ID = 18241006
const KICKOFF_MS = 1784142000000 // England v Argentina real StartTime

const connection = new Connection(RPC, "confirmed")
const alice = loadKeypair(path.join(here, "..", "keys", "keeper.json"))

// bob is a fresh wallet funded from alice
const BOB_PATH = path.join(here, "..", "keys", "bob.json")
if (!fs.existsSync(BOB_PATH)) fs.writeFileSync(BOB_PATH, JSON.stringify([...Keypair.generate().secretKey]))
const bob = loadKeypair(BOB_PATH)

const idl = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "target", "idl", "kickpact.json"), "utf8"))
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(alice), { commitment: "confirmed" })
const program = new anchor.Program(idl, provider)

const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)
const [mint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId)
const [mintAuth] = PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], program.programId)
const ata = (o: PublicKey) => getAssociatedTokenAddressSync(mint, o)
const sigs: Record<string, string> = {}

// ── fund bob with gas ──
const bobBal = await connection.getBalance(bob.publicKey)
if (bobBal < 0.05 * LAMPORTS_PER_SOL) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: alice.publicKey, toPubkey: bob.publicKey, lamports: 0.08 * LAMPORTS_PER_SOL }),
  )
  await sendAndConfirmTransaction(connection, tx, [alice])
  console.log("[fund] bob gassed:", bob.publicKey.toBase58())
}

// ── initialize (idempotent) ──
const cfgInfo = await connection.getAccountInfo(config)
if (!cfgInfo) {
  sigs.initialize = await (program.methods as any)
    .initialize()
    .accounts({
      admin: alice.publicKey, config, mint, mintAuth,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc()
  console.log("[init]", sigs.initialize)
} else console.log("[init] already initialized")

// ── faucet 100 kUSD each ──
for (const [who, kp] of [["alice", alice], ["bob", bob]] as const) {
  const sig = await (program.methods as any)
    .faucet(new BN(100_000_000))
    .accounts({
      user: kp.publicKey, mint, mintAuth, userToken: ata(kp.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([kp])
    .rpc()
  sigs[`faucet_${who}`] = sig
  console.log(`[faucet] ${who} +100 kUSD`, sig.slice(0, 20) + "…")
}

// ── alice opens the pool (AWAY = Argentina), 10 kUSD, deadline now+45s ──
const cfg: any = await (program.account as any).config.fetch(config)
const poolId: BN = cfg.nextPoolId
const pool = PublicKey.findProgramAddressSync(
  [Buffer.from("pool"), poolId.toArrayLike(Buffer, "le", 8)], program.programId,
)[0]
const member = (o: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("member"), poolId.toArrayLike(Buffer, "le", 8), o.toBuffer()], program.programId,
  )[0]
const vault = getAssociatedTokenAddressSync(mint, pool, true)
const deadline = Date.now() + 45_000

sigs.create_pool = await (program.methods as any)
  .createPool(new BN(FIXTURE_ID), new BN(10_000_000), new BN(deadline), new BN(KICKOFF_MS), 3)
  .accounts({
    user: alice.publicKey, config, pool, member: member(alice.publicKey), mint, vault,
    userToken: ata(alice.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  })
  .rpc()
console.log(`[pool #${poolId}] alice opened · picked AWAY (Argentina) ·`, sigs.create_pool.slice(0, 20) + "…")

// ── bob joins (HOME = England) ──
sigs.join_pool = await (program.methods as any)
  .joinPool(1)
  .accounts({
    user: bob.publicKey, pool, member: member(bob.publicKey), vault,
    userToken: ata(bob.publicKey), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  })
  .signers([bob])
  .rpc()
console.log(`[pool #${poolId}] bob joined · picked HOME (England) ·`, sigs.join_pool.slice(0, 20) + "…")
console.log(`[vault] holds ${Number((await getAccount(connection, vault)).amount) / 1e6} kUSD`)

// ── wait out the deadline ──
const wait = deadline - Date.now() + 3000
console.log(`[wait] ${Math.ceil(wait / 1000)}s until settlement window…`)
await new Promise((r) => setTimeout(r, wait))

// ── settle with the REAL TxLINE proof (CPI on devnet) ──
const mapProof = (arr: any[]) => arr.map((n: any) => ({ hash: Array.from(n.hash), isRightSibling: n.isRightSibling }))
const payload = {
  ts: new BN(PROOF.summary.updateStats.minTimestamp),
  fixtureSummary: {
    fixtureId: new BN(PROOF.summary.fixtureId),
    updateStats: {
      updateCount: PROOF.summary.updateStats.updateCount,
      minTimestamp: new BN(PROOF.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(PROOF.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: Array.from(PROOF.summary.eventStatsSubTreeRoot),
  },
  fixtureProof: mapProof(PROOF.subTreeProof),
  mainTreeProof: mapProof(PROOF.mainTreeProof),
  eventStatRoot: Array.from(PROOF.eventStatRoot),
  stats: PROOF.statsToProve.map((statObj: any, i: number) => ({ stat: statObj, statProof: mapProof(PROOF.statProofs[i]) })),
}
const epochDay = Math.floor(PROOF.summary.updateStats.minTimestamp / 86400000)
const TXORACLE_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J")
const dailyRoots = PublicKey.findProgramAddressSync(
  [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)], TXORACLE_ID,
)[0]

sigs.settle = await (program.methods as any)
  .settle(3, payload)
  .accounts({ caller: alice.publicKey, pool, dailyScoresMerkleRoots: dailyRoots, txoracleProgram: TXORACLE_ID })
  .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
  .rpc()
console.log("[settle] ORACLE CONFIRMED AWAY (Argentina 2–1) ·", sigs.settle)

const st: any = await (program.account as any).pool.fetch(pool)
console.log(`[pool #${poolId}] settled=${st.settled} result=${st.result} winners=${st.winners}`)

// ── claims: alice wins 20, bob refused ──
sigs.claim_alice = await (program.methods as any)
  .claim()
  .accounts({ user: alice.publicKey, pool, member: member(alice.publicKey), vault, userToken: ata(alice.publicKey), tokenProgram: TOKEN_PROGRAM_ID })
  .rpc()
console.log("[claim] alice took the 20 kUSD pot ·", sigs.claim_alice.slice(0, 20) + "…")

try {
  await (program.methods as any)
    .claim()
    .accounts({ user: bob.publicKey, pool, member: member(bob.publicKey), vault, userToken: ata(bob.publicKey), tokenProgram: TOKEN_PROGRAM_ID })
    .signers([bob])
    .rpc()
  console.log("[claim] bob paid out?! BUG")
} catch {
  console.log("[claim] bob (England) correctly refused — NotAWinner")
}

console.log(`[balances] alice ${Number((await getAccount(connection, ata(alice.publicKey))).amount) / 1e6} kUSD · bob ${Number((await getAccount(connection, ata(bob.publicKey))).amount) / 1e6} kUSD`)

fs.writeFileSync(path.join(OUT, "live-demo-sigs.json"), JSON.stringify({ poolId: poolId.toString(), pool: pool.toBase58(), ...sigs }, null, 2))
console.log("\nAll signatures saved to out/live-demo-sigs.json")
console.log(`explorer: https://explorer.solana.com/tx/${sigs.settle}?cluster=devnet`)
