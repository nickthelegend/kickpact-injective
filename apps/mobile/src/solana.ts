/**
 * Solana chain module — devnet RPC, the Kickpact pools program, and the
 * TxLINE oracle it CPIs into.
 *
 * Everything here BUILDS instructions/transactions; signing + sending goes
 * through the wallet context (burner keypair or Mobile Wallet Adapter), so
 * this module stays wallet-agnostic.
 */
import { Program } from "@coral-xyz/anchor"
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token"
import BN from "bn.js"

import kickpactIdl from "./idl/kickpact.json"
import txoracleIdl from "./idl/txoracle.json"

export const RPC_URL = "https://api.devnet.solana.com"
export const KICKPACT_ID = new PublicKey((kickpactIdl as any).address)
export const TXORACLE_ID = new PublicKey((txoracleIdl as any).address)
export const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`
export const EXPLORER_ACCT = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`

export const ONE_KUSD = 1_000_000 // 6 dp

// ── PDAs ────────────────────────────────────────────────────────────────────
export const configPda = () => PublicKey.findProgramAddressSync([Buffer.from("config")], KICKPACT_ID)[0]
export const mintPda = () => PublicKey.findProgramAddressSync([Buffer.from("mint")], KICKPACT_ID)[0]
export const mintAuthPda = () => PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], KICKPACT_ID)[0]
export const poolPda = (id: bigint | number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), new BN(id.toString()).toArrayLike(Buffer, "le", 8)],
    KICKPACT_ID,
  )[0]
export const memberPda = (poolId: bigint | number, wallet: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("member"), new BN(poolId.toString()).toArrayLike(Buffer, "le", 8), wallet.toBuffer()],
    KICKPACT_ID,
  )[0]
export const dailyRootsPda = (tsMs: number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(Math.floor(tsMs / 86_400_000)).toArrayLike(Buffer, "le", 2)],
    TXORACLE_ID,
  )[0]
export const kusdAta = (owner: PublicKey, allowOffCurve = false) =>
  getAssociatedTokenAddressSync(mintPda(), owner, allowOffCurve)

// Read-only program handles (instruction building + account fetching).
export function kickpact(connection: Connection): Program {
  return new Program(kickpactIdl as any, { connection })
}

/**
 * The oracle handle carries a full AnchorProvider because `.view()` simulates
 * a transaction — the "wallet" is a funded devnet pubkey that never signs.
 */
export function txoracle(connection: Connection): Program {
  const roWallet = {
    publicKey: new PublicKey("Ab5vEaLwkdvGwrmYwUpA4cok6EUzdgRbCyyNrV7pBqMP"),
    signTransaction: async (t: any) => t,
    signAllTransactions: async (t: any) => t,
  }
  const { AnchorProvider } = require("@coral-xyz/anchor")
  const provider = new AnchorProvider(connection, roWallet, { commitment: "confirmed" })
  return new Program(txoracleIdl as any, provider)
}

// ── balances ────────────────────────────────────────────────────────────────
export async function getKusdBalance(connection: Connection, owner: PublicKey): Promise<number> {
  try {
    const bal = await connection.getTokenAccountBalance(kusdAta(owner))
    return Number(bal.value.amount) / ONE_KUSD
  } catch {
    return 0 // ATA doesn't exist yet
  }
}

// ── pool state ──────────────────────────────────────────────────────────────
export const OUTCOMES = ["home", "draw", "away"] as const
export type PoolOutcome = (typeof OUTCOMES)[number]
export const pickCode = (o: PoolOutcome): number => OUTCOMES.indexOf(o) + 1
export const pickName = (code: number): PoolOutcome | null =>
  code >= 1 && code <= 3 ? OUTCOMES[code - 1] : null

export interface PoolState {
  id: bigint
  address: string
  fixtureId: bigint
  creator: string
  stake: number // kUSD units (not base)
  deadlineMs: number
  kickoffMs: number
  pickCounts: [number, number, number]
  memberCount: number
  settled: boolean
  result: number
  winners: number
  pot: number
}

const asState = (address: PublicKey, p: any): PoolState => ({
  id: BigInt(p.id.toString()),
  address: address.toBase58(),
  fixtureId: BigInt(p.fixtureId.toString()),
  creator: p.creator.toBase58(),
  stake: Number(p.stake.toString()) / ONE_KUSD,
  deadlineMs: Number(p.deadlineMs.toString()),
  kickoffMs: Number(p.kickoffMs.toString()),
  pickCounts: [p.pickCounts[0], p.pickCounts[1], p.pickCounts[2]],
  memberCount: p.memberCount,
  settled: p.settled,
  result: p.result,
  winners: p.winners,
  pot: (Number(p.stake.toString()) * p.memberCount) / ONE_KUSD,
})

/** All pools for a TxLINE fixture (memcmp on fixture_id at offset 16). */
export async function poolsForFixture(connection: Connection, fixtureId: number | bigint): Promise<PoolState[]> {
  const prog = kickpact(connection)
  const all = await (prog.account as any).pool.all([
    { memcmp: { offset: 16, bytes: bs58encode(new BN(fixtureId.toString()).toArrayLike(Buffer, "le", 8)) } },
  ])
  return all.map((a: any) => asState(a.publicKey, a.account)).sort((x: PoolState, y: PoolState) => Number(x.id - y.id))
}

/** Every pool (receipts screen). */
export async function allPools(connection: Connection): Promise<PoolState[]> {
  const prog = kickpact(connection)
  const all = await (prog.account as any).pool.all()
  return all.map((a: any) => asState(a.publicKey, a.account)).sort((x: PoolState, y: PoolState) => Number(y.id - x.id))
}

export async function getPool(connection: Connection, poolId: bigint | number): Promise<PoolState> {
  const prog = kickpact(connection)
  const addr = poolPda(poolId)
  return asState(addr, await (prog.account as any).pool.fetch(addr))
}

export async function myPick(connection: Connection, poolId: bigint | number, wallet: PublicKey): Promise<{ pick: number; claimed: boolean } | null> {
  try {
    const prog = kickpact(connection)
    const m: any = await (prog.account as any).member.fetch(memberPda(poolId, wallet))
    return { pick: m.pick, claimed: m.claimed }
  } catch {
    return null
  }
}

// bs58 without importing the package at top level twice
import bs58 from "bs58"
const bs58encode = (b: Buffer) => bs58.encode(b)

// ── instruction builders (sign with the wallet context) ────────────────────
export async function buildFaucetTx(connection: Connection, user: PublicKey, kusdAmount: number): Promise<Transaction> {
  const prog = kickpact(connection)
  const ix = await (prog.methods as any)
    .faucet(new BN(Math.floor(kusdAmount * ONE_KUSD)))
    .accounts({
      user,
      mint: mintPda(),
      mintAuth: mintAuthPda(),
      userToken: kusdAta(user),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
  return new Transaction().add(ix)
}

export async function buildCreatePoolTx(
  connection: Connection,
  user: PublicKey,
  fixtureId: number | bigint,
  stakeKusd: number,
  deadlineMs: number,
  kickoffMs: number,
  pick: PoolOutcome,
): Promise<{ tx: Transaction; poolId: bigint }> {
  const prog = kickpact(connection)
  const cfg: any = await (prog.account as any).config.fetch(configPda())
  const poolId = BigInt(cfg.nextPoolId.toString())
  const pool = poolPda(poolId)
  const ix = await (prog.methods as any)
    .createPool(
      new BN(fixtureId.toString()),
      new BN(Math.floor(stakeKusd * ONE_KUSD)),
      new BN(deadlineMs),
      new BN(kickoffMs),
      pickCode(pick),
    )
    .accounts({
      user,
      config: configPda(),
      pool,
      member: memberPda(poolId, user),
      mint: mintPda(),
      vault: kusdAta(pool, true),
      userToken: kusdAta(user),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
  return { tx: new Transaction().add(ix), poolId }
}

export async function buildJoinPoolTx(
  connection: Connection,
  user: PublicKey,
  poolId: bigint | number,
  pick: PoolOutcome,
): Promise<Transaction> {
  const prog = kickpact(connection)
  const pool = poolPda(poolId)
  const ix = await (prog.methods as any)
    .joinPool(pickCode(pick))
    .accounts({
      user,
      pool,
      member: memberPda(poolId, user),
      vault: kusdAta(pool, true),
      userToken: kusdAta(user),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
  return new Transaction().add(ix)
}

export async function buildClaimTx(
  connection: Connection,
  user: PublicKey,
  poolId: bigint | number,
  refundExpired = false,
): Promise<Transaction> {
  const prog = kickpact(connection)
  const pool = poolPda(poolId)
  const accounts = {
    user,
    pool,
    member: memberPda(poolId, user),
    vault: kusdAta(pool, true),
    userToken: kusdAta(user),
    tokenProgram: TOKEN_PROGRAM_ID,
  }
  const m = refundExpired ? (prog.methods as any).refundExpired() : (prog.methods as any).claim()
  return new Transaction().add(await m.accounts(accounts).instruction())
}

/** Map a TxLINE stat-validation response to the on-chain payload shape. */
export function proofToPayload(val: any) {
  const mapProof = (arr: any[]) =>
    arr.map((n: any) => ({ hash: Array.from(n.hash) as number[], isRightSibling: n.isRightSibling }))
  return {
    ts: new BN(val.summary.updateStats.minTimestamp),
    fixtureSummary: {
      fixtureId: new BN(val.summary.fixtureId),
      updateStats: {
        updateCount: val.summary.updateStats.updateCount,
        minTimestamp: new BN(val.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(val.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: Array.from(val.summary.eventStatsSubTreeRoot) as number[],
    },
    fixtureProof: mapProof(val.subTreeProof),
    mainTreeProof: mapProof(val.mainTreeProof),
    eventStatRoot: Array.from(val.eventStatRoot) as number[],
    stats: val.statsToProve.map((statObj: any, i: number) => ({
      stat: statObj,
      statProof: mapProof(val.statProofs[i]),
    })),
  }
}

/** Anyone can settle — the oracle refutes lies. */
export async function buildSettleTx(
  connection: Connection,
  caller: PublicKey,
  poolId: bigint | number,
  outcome: PoolOutcome,
  proof: any,
): Promise<Transaction> {
  const prog = kickpact(connection)
  const payload = proofToPayload(proof)
  const ix = await (prog.methods as any)
    .settle(pickCode(outcome), payload)
    .accounts({
      caller,
      pool: poolPda(poolId),
      dailyScoresMerkleRoots: dailyRootsPda(payload.ts.toNumber()),
      txoracleProgram: TXORACLE_ID,
    })
    .instruction()
  return new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }))
    .add(ix)
}

/**
 * Re-run the oracle's validation as a read-only .view() from the phone —
 * the "verify this receipt yourself" button on the Receipt screen.
 */
export async function verifyProofOnChain(
  connection: Connection,
  proof: any,
  outcome: PoolOutcome,
): Promise<boolean> {
  const oracle = txoracle(connection)
  const payload = proofToPayload(proof)
  const strategy =
    outcome === "draw"
      ? { geometricTargets: [], distancePredicate: null, discretePredicates: [{ binary: { indexA: 0, indexB: 1, op: { subtract: {} }, predicate: { threshold: 0, comparison: { equalTo: {} } } } }] }
      : outcome === "home"
        ? { geometricTargets: [], distancePredicate: null, discretePredicates: [{ binary: { indexA: 0, indexB: 1, op: { subtract: {} }, predicate: { threshold: 0, comparison: { greaterThan: {} } } } }] }
        : { geometricTargets: [], distancePredicate: null, discretePredicates: [{ binary: { indexA: 1, indexB: 0, op: { subtract: {} }, predicate: { threshold: 0, comparison: { greaterThan: {} } } } }] }
  return await (oracle.methods as any)
    .validateStatV2(payload, strategy)
    .accounts({ dailyScoresMerkleRoots: dailyRootsPda(payload.ts.toNumber()) })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .view()
}

/** Latest transaction touching a pool (the settle receipt link). */
export async function latestPoolTx(connection: Connection, poolId: bigint | number): Promise<string | null> {
  const sigs = await connection.getSignaturesForAddress(poolPda(poolId), { limit: 1 })
  return sigs[0]?.signature ?? null
}

export function shortAddr(a: string | null): string {
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—"
}

/**
 * A duel's join deadline: friends gathering around a match should be able to
 * join a bit into it, so we allow joins until the 75th minute (but always at
 * least a minute out so `create_pool`'s deadline > now check passes).
 */
export function duelDeadlineMs(kickoffMs: number): number {
  return Math.max(Date.now() + 60_000, kickoffMs + 75 * 60_000)
}

/**
 * Can a duel opened on this kickoff still be joined by anyone else?
 *
 * A fixture's feed state stays "pre" until the provider advances its phase, so
 * matches whose kickoff is days past still look upcoming. Opening a duel on one
 * clamps the deadline to now+60s — the host stakes, and every friend who taps
 * join a minute later is rejected by the program. Only offer fixtures whose
 * real join window (kickoff+75m) is still meaningfully open.
 */
export function duelJoinable(kickoffMs: number, marginMs = 5 * 60_000): boolean {
  return kickoffMs + 75 * 60_000 > Date.now() + marginMs
}
