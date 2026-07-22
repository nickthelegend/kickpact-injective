/**
 * Kickpact pool lifecycle against the REAL TxLINE oracle — the local test
 * validator clones the devnet txoracle program AND the daily-roots PDA for
 * epoch day 20649, so `settle` CPIs into the actual validation logic with the
 * actual Merkle proof of England 1–2 Argentina (fixture 18241006).
 *
 *   faucet → alice opens a pool (away) → bob joins (home) → carol joins (away)
 *   → settle with a WRONG outcome fails (oracle refutes)
 *   → settle with the TRUE outcome (away) passes via CPI
 *   → winners split 30 kUSD → loser refused → vault drains to dust-free zero.
 *
 * Run: cd apps/solana && anchor test
 */
import * as anchor from "@coral-xyz/anchor"
import { Program } from "@coral-xyz/anchor"
import {
  Keypair, PublicKey, SystemProgram, ComputeBudgetProgram, LAMPORTS_PER_SOL,
} from "@solana/web3.js"
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync, getAccount, createAssociatedTokenAccountInstruction,
} from "@solana/spl-token"
import BN from "bn.js"
import { expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const PROOF = JSON.parse(fs.readFileSync(path.join(here, "..", "keeper", "out", "proof-18241006.json"), "utf8"))
const FIXTURE_ID = new BN(18241006)
const TXORACLE_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J")

const mapProof = (arr: any[]) => arr.map((n) => ({ hash: Array.from(n.hash), isRightSibling: n.isRightSibling }))
const payload = () => ({
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
})

const epochDay = Math.floor(PROOF.summary.updateStats.minTimestamp / 86400000)
const [dailyRootsPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)],
  TXORACLE_ID,
)

test("pool lifecycle settles a real World Cup semifinal via CPI", async () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const idl = JSON.parse(fs.readFileSync(path.join(here, "..", "target", "idl", "kickpact.json"), "utf8"))
  const program = new Program(idl, provider) as Program

  const connection = provider.connection
  const admin = (provider.wallet as anchor.Wallet).payer
  const alice = Keypair.generate()
  const bob = Keypair.generate()
  const carol = Keypair.generate()
  for (const kp of [alice, bob, carol]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL)
    await connection.confirmTransaction(sig)
  }

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId)
  const [mint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId)
  const [mintAuth] = PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], program.programId)

  // initialize (idempotent across reruns on a fresh validator)
  await program.methods.initialize().accounts({
    admin: admin.publicKey, config, mint, mintAuth,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  }).rpc()

  // faucet 100 kUSD each
  const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner)
  for (const kp of [alice, bob, carol]) {
    await program.methods.faucet(new BN(100_000_000)).accounts({
      user: kp.publicKey, mint, mintAuth, userToken: ata(kp.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([kp]).rpc()
  }
  expect(Number((await getAccount(connection, ata(alice.publicKey))).amount)).toBe(100_000_000)

  // pool #1: England v Argentina, 10 kUSD stake.
  //
  // `settle` compares the deadline against the on-chain Clock, and the test
  // validator's clock drifts behind wall time as it produces slots — so a
  // deadline derived from Date.now() can still be in the chain's future when
  // we settle, and the whole thing fails with MatchNotStarted. Read the
  // chain's own clock instead, and later wait until IT passes the deadline.
  const chainNowMs = async () => {
    const t = await connection.getBlockTime(await connection.getSlot())
    return (t ?? Math.floor(Date.now() / 1000)) * 1000
  }
  const STAKE = new BN(10_000_000)
  const deadlineMs = new BN((await chainNowMs()) + 3_000)
  const kickoffMs = new BN(1784142000000) // 2026-07-15 19:00 UTC
  const poolId = new BN(1)
  const [pool] = PublicKey.findProgramAddressSync([Buffer.from("pool"), poolId.toBuffer("le", 8)], program.programId)
  const member = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("member"), poolId.toBuffer("le", 8), owner.publicKey?.toBuffer?.() ?? owner.toBuffer()], program.programId)[0]
  const vault = getAssociatedTokenAddressSync(mint, pool, true)

  await program.methods.createPool(FIXTURE_ID, STAKE, deadlineMs, kickoffMs, 3 /* away */).accounts({
    user: alice.publicKey, config, pool, member: member(alice.publicKey), mint, vault,
    userToken: ata(alice.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).signers([alice]).rpc()

  for (const [kp, pick] of [[bob, 1], [carol, 3]] as const) {
    await program.methods.joinPool(pick).accounts({
      user: kp.publicKey, pool, member: member(kp.publicKey), vault,
      userToken: ata(kp.publicKey), tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).signers([kp]).rpc()
  }
  expect(Number((await getAccount(connection, vault)).amount)).toBe(30_000_000)

  // wait for the CHAIN's clock to pass the join deadline — not ours
  for (let i = 0; i < 40 && (await chainNowMs()) < deadlineMs.toNumber() + 500; i++) {
    await new Promise((r) => setTimeout(r, 500))
  }
  expect(await chainNowMs()).toBeGreaterThan(deadlineMs.toNumber())

  const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })

  // A lying keeper claims HOME (England). This must fail for exactly one
  // reason — the oracle refused the claim. Matching any error (or any "0x")
  // would let an unrelated failure pass as proof the oracle works.
  let refusal = ""
  try {
    await program.methods.settle(1, payload()).accounts({
      caller: admin.publicKey, pool, dailyScoresMerkleRoots: dailyRootsPda, txoracleProgram: TXORACLE_ID,
    }).preInstructions([cu]).rpc()
  } catch (e: any) {
    refusal = String(e.message ?? e) + JSON.stringify(e.logs ?? [])
  }
  expect(refusal).toContain("OracleRefuted")

  // the true outcome (AWAY, Argentina 2–1) settles via CPI into txoracle
  await program.methods.settle(3, payload()).accounts({
    caller: admin.publicKey, pool, dailyScoresMerkleRoots: dailyRootsPda, txoracleProgram: TXORACLE_ID,
  }).preInstructions([cu]).rpc()

  const p: any = await (program.account as any).pool.fetch(pool)
  expect(p.settled).toBe(true)
  expect(p.result).toBe(3)
  expect(p.winners).toBe(2) // alice + carol

  // winners split 30 → 15 each; bob (home) refused
  const a0 = Number((await getAccount(connection, ata(alice.publicKey))).amount)
  await program.methods.claim().accounts({
    user: alice.publicKey, pool, member: member(alice.publicKey), vault,
    userToken: ata(alice.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
  }).signers([alice]).rpc()
  expect(Number((await getAccount(connection, ata(alice.publicKey))).amount) - a0).toBe(15_000_000)

  let refused = false
  try {
    await program.methods.claim().accounts({
      user: bob.publicKey, pool, member: member(bob.publicKey), vault,
      userToken: ata(bob.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([bob]).rpc()
  } catch {
    refused = true
  }
  expect(refused).toBe(true)

  await program.methods.claim().accounts({
    user: carol.publicKey, pool, member: member(carol.publicKey), vault,
    userToken: ata(carol.publicKey), tokenProgram: TOKEN_PROGRAM_ID,
  }).signers([carol]).rpc()
  expect(Number((await getAccount(connection, vault)).amount)).toBe(0) // fully drained
}, 240_000)
