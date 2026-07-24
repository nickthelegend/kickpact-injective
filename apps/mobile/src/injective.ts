/**
 * Injective EVM chain module — the Kickpact escrow + kUSD on Injective testnet
 * (chainId 1439). Reads go through a JsonRpcProvider; writes take an ethers
 * Signer from the wallet context (Privy embedded EVM wallet or a keychain
 * burner), so this module stays wallet-agnostic.
 *
 * There is no on-chain sports oracle to CPI into — pools are settled by the
 * keeper relaying an oracle-signed final score, and the contract derives the
 * outcome from the goals itself (see Kickpact.sol). `verifySettlement` lets the
 * phone re-check that a settled pool really carried the oracle's signature.
 */
import { ethers } from "ethers"
import KickpactAbi from "./abi/Kickpact.json"
import KusdAbi from "./abi/KUSD.json"
import deployment from "./deployment.json"

export const CHAIN_ID = deployment.chainId
export const RPC_URL = deployment.rpc
export const KICKPACT_ADDR = deployment.kickpact
export const KUSD_ADDR = deployment.kusd
export const ORACLE_SIGNER = deployment.oracleSigner
export const EXPLORER = (hash: string) => `${deployment.explorer}/tx/${hash}`
export const EXPLORER_ACCT = (a: string) => `${deployment.explorer}/address/${a}`

export const ONE_KUSD = 1_000_000 // 6 dp
// Injective testnet EVM: legacy gasPrice + explicit gasLimit (skip a slow
// eth_estimateGas). Both modest — the escrow calls are small.
const GAS = { gasPrice: 160_000_000n, gasLimit: 600_000n }

/**
 * Injective's eth_getTransactionReceipt(hash) is unreliable behind its k8s RPC
 * load balancer (returns null even for mined txs), so ethers' tx.wait() can
 * hang. STATE reads replicate fine, so confirm a tx by waiting for the sender's
 * nonce to advance instead of fetching the receipt.
 */
async function waitMined(signer: ethers.Signer, tx: ethers.TransactionResponse): Promise<string> {
  const p = signer.provider!
  const from = await signer.getAddress()
  for (let i = 0; i < 90; i++) {
    try {
      if ((await p.getTransactionCount(from, "latest")) > tx.nonce) return tx.hash
    } catch {}
    await new Promise((res) => setTimeout(res, 1500))
  }
  throw new Error(`tx not mined: ${tx.hash}`)
}

export const isDeployed = () => !!KICKPACT_ADDR && !!KUSD_ADDR

// ── provider + contract handles ─────────────────────────────────────────────
export function provider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true })
}
export function kickpact(runner: ethers.ContractRunner) {
  if (!KICKPACT_ADDR) throw new Error("Kickpact not deployed yet — run the deploy script")
  return new ethers.Contract(KICKPACT_ADDR, KickpactAbi, runner)
}
export function kusd(runner: ethers.ContractRunner) {
  if (!KUSD_ADDR) throw new Error("kUSD not deployed yet — run the deploy script")
  return new ethers.Contract(KUSD_ADDR, KusdAbi, runner)
}

// ── outcomes ────────────────────────────────────────────────────────────────
export const OUTCOMES = ["home", "draw", "away"] as const
export type PoolOutcome = (typeof OUTCOMES)[number]
export const pickCode = (o: PoolOutcome): number => OUTCOMES.indexOf(o) + 1
export const pickName = (code: number): PoolOutcome | null =>
  code >= 1 && code <= 3 ? OUTCOMES[code - 1] : null

// ── pool state ──────────────────────────────────────────────────────────────
export interface PoolState {
  id: bigint
  address: string // the escrow contract (all pools live in one contract)
  fixtureId: bigint
  creator: string
  stake: number // kUSD units
  deadlineMs: number
  kickoffMs: number
  pickCounts: [number, number, number]
  memberCount: number
  settled: boolean
  result: number
  winners: number
  pot: number
}

const asState = (p: any): PoolState => ({
  id: BigInt(p.id),
  address: KICKPACT_ADDR,
  fixtureId: BigInt(p.fixtureId),
  creator: p.creator,
  stake: Number(p.stake) / ONE_KUSD,
  deadlineMs: Number(p.deadlineMs),
  kickoffMs: Number(p.kickoffMs),
  pickCounts: [Number(p.pickCounts[0]), Number(p.pickCounts[1]), Number(p.pickCounts[2])],
  memberCount: Number(p.memberCount),
  settled: p.settled,
  result: Number(p.result),
  winners: Number(p.winners),
  pot: (Number(p.stake) * Number(p.memberCount)) / ONE_KUSD,
})

export async function getPool(runner: ethers.ContractRunner, poolId: bigint | number): Promise<PoolState> {
  return asState(await kickpact(runner).getPool(poolId))
}

async function everyPool(runner: ethers.ContractRunner): Promise<PoolState[]> {
  if (!isDeployed()) return []
  const k = kickpact(runner)
  const next = Number(await k.nextPoolId())
  const ids = Array.from({ length: Math.max(0, next - 1) }, (_, i) => i + 1)
  const pools = await Promise.all(ids.map((id) => k.getPool(id).then(asState)))
  return pools.filter((p) => p.id !== 0n)
}

/** Every pool, newest first (receipts screen). */
export async function allPools(runner: ethers.ContractRunner): Promise<PoolState[]> {
  return (await everyPool(runner)).sort((a, b) => Number(b.id - a.id))
}

/** All pools on a fixture, oldest first. */
export async function poolsForFixture(runner: ethers.ContractRunner, fixtureId: number | bigint): Promise<PoolState[]> {
  const fx = BigInt(fixtureId)
  return (await everyPool(runner)).filter((p) => p.fixtureId === fx).sort((a, b) => Number(a.id - b.id))
}

export async function myPick(
  runner: ethers.ContractRunner,
  poolId: bigint | number,
  wallet: string,
): Promise<{ pick: number; claimed: boolean } | null> {
  try {
    const m = await kickpact(runner).getMember(poolId, wallet)
    if (!m.joined) return null
    return { pick: Number(m.pick), claimed: m.claimed }
  } catch {
    return null
  }
}

// ── balances ────────────────────────────────────────────────────────────────
export async function getKusdBalance(runner: ethers.ContractRunner, owner: string): Promise<number> {
  if (!KUSD_ADDR) return 0
  try {
    const bal = await kusd(runner).balanceOf(owner)
    return Number(bal) / ONE_KUSD
  } catch {
    return 0
  }
}

// ── writes (take a Signer from the wallet) ─────────────────────────────────
async function ensureApproval(signer: ethers.Signer, need: bigint) {
  const owner = await signer.getAddress()
  const token = kusd(signer)
  const allowance: bigint = await token.allowance(owner, KICKPACT_ADDR)
  if (allowance < need) {
    const tx = await token.approve(KICKPACT_ADDR, ethers.MaxUint256, GAS)
    await waitMined(signer, tx)
  }
}

export async function faucet(signer: ethers.Signer, kusdAmount: number): Promise<string> {
  const tx = await kusd(signer).faucet(BigInt(Math.round(kusdAmount * ONE_KUSD)), GAS)
  return waitMined(signer, tx)
}

export async function createPool(
  signer: ethers.Signer,
  fixtureId: number | bigint,
  stakeKusd: number,
  deadlineMs: number,
  kickoffMs: number,
  pick: PoolOutcome,
): Promise<{ hash: string; poolId: bigint }> {
  const stake = BigInt(Math.round(stakeKusd * ONE_KUSD))
  await ensureApproval(signer, stake)
  const k = kickpact(signer)
  // poolId comes from state (createPool assigns pool.id = nextPoolId), read
  // before the call — event logs aren't reliably retrievable on this RPC.
  const poolId: bigint = await k.nextPoolId()
  const tx = await k.createPool(BigInt(fixtureId), stake, BigInt(deadlineMs), BigInt(kickoffMs), pickCode(pick), GAS)
  const hash = await waitMined(signer, tx)
  return { hash, poolId }
}

export async function joinPool(
  signer: ethers.Signer,
  poolId: bigint | number,
  pick: PoolOutcome,
): Promise<string> {
  const p = await getPool(signer, poolId)
  await ensureApproval(signer, BigInt(Math.round(p.stake * ONE_KUSD)))
  const tx = await kickpact(signer).joinPool(BigInt(poolId), pickCode(pick), GAS)
  return waitMined(signer, tx)
}

export async function claim(
  signer: ethers.Signer,
  poolId: bigint | number,
  refundExpired = false,
): Promise<string> {
  const k = kickpact(signer)
  const tx = refundExpired ? await k.refundExpired(BigInt(poolId), GAS) : await k.claim(BigInt(poolId), GAS)
  return waitMined(signer, tx)
}

// ── receipts / verification ────────────────────────────────────────────────
/** The settle tx hash for a pool (its receipt link). */
/**
 * Find a pool's PoolSettled event. This RPC caps the eth_getLogs block range
 * (and by-hash tx/receipt lookups are unreliable), so scan recent blocks
 * backward in bounded windows rather than querying from genesis.
 */
async function findPoolSettled(runner: ethers.ContractRunner, poolId: bigint | number): Promise<any | null> {
  const k = kickpact(runner)
  const latest = await runner.provider!.getBlockNumber()
  const SPAN = 9000
  for (let i = 0; i < 12; i++) {
    const to = latest - i * SPAN
    if (to < 0) break
    const from = Math.max(0, to - SPAN)
    try {
      const evs = await k.queryFilter(k.filters.PoolSettled(poolId), from, to)
      if (evs.length) return evs[evs.length - 1]
    } catch {}
    if (from === 0) break
  }
  return null
}

export async function latestPoolTx(runner: ethers.ContractRunner, poolId: bigint | number): Promise<string | null> {
  if (!isDeployed()) return null
  const ev = await findPoolSettled(runner, poolId).catch(() => null)
  return ev?.transactionHash ?? null
}

export interface Settlement {
  homeGoals: number
  awayGoals: number
  outcome: PoolOutcome | null
  oracleSigner: string
  txHash: string | null
  /** True because a PoolSettled event only emits AFTER settle() verifies the
   *  oracle's EIP-712 signature on-chain — the event's existence is the proof. */
  verified: boolean
}

/**
 * Re-verify a settled pool from the phone. The contract emits PoolSettled only
 * after ECDSA.recover over the signed goals equals its configured oracleSigner,
 * so pulling the event proves the oracle signed exactly this score and the
 * contract derived the outcome from it on-chain — "verify this receipt
 * yourself", within what the RPC reliably serves (bounded eth_getLogs).
 */
export async function verifySettlement(
  runner: ethers.ContractRunner,
  poolId: bigint | number,
): Promise<Settlement | null> {
  if (!isDeployed()) return null
  const ev = await findPoolSettled(runner, poolId)
  if (!ev) return null
  return {
    homeGoals: Number(ev.args.homeGoals),
    awayGoals: Number(ev.args.awayGoals),
    outcome: pickName(Number(ev.args.result)),
    oracleSigner: ORACLE_SIGNER,
    txHash: ev.transactionHash,
    verified: true,
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
export function shortAddr(a: string | null): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—"
}

/**
 * A duel's join deadline: friends gathering around a match should be able to
 * join a bit into it, so joins stay open until the 75th minute (but always at
 * least a minute out so createPool's deadline > now check passes).
 */
export function duelDeadlineMs(kickoffMs: number): number {
  return Math.max(Date.now() + 60_000, kickoffMs + 75 * 60_000)
}

/** Can a duel opened on this kickoff still be joined by anyone else? */
export function duelJoinable(kickoffMs: number, marginMs = 5 * 60_000): boolean {
  return kickoffMs + 75 * 60_000 > Date.now() + marginMs
}
