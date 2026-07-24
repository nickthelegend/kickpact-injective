/**
 * Kickpact settle-keeper — Injective EVM.
 *
 * Reads the final score of a finished World Cup fixture (API-Football, or the
 * bundled snapshot / a manual score), signs the raw goals with the ORACLE key,
 * and relays settle() for every open pool on that fixture with a RELAYER key.
 * The oracle key only ever signs — it never needs gas or touches a pool.
 *
 *   bun run src/keeper.ts                       # one sweep of settle-able pools
 *   bun run src/keeper.ts --watch               # keep sweeping every 30s
 *   bun run src/keeper.ts --fixture 900201 --home 2 --away 1   # manual settle
 */
import { ethers } from "ethers"
import { loadEnv, deployments, kickpactAbi } from "./env.ts"
import { signResult, type SignedResult } from "./oracle.ts"
import { finalScore } from "./sports.ts"

loadEnv()
const FULL_TIME_MS = 105 * 60 * 1000
const d = deployments()

if (!d.kickpact) throw new Error("deployments.json has no kickpact address — deploy first")
// Every oracle key we hold. Settlement is M-of-N, so the keeper needs at least
// `threshold` of them; in production these would live on separate machines and
// the keeper would collect their signatures over the wire.
const oraclePks = [
  process.env.ORACLE_SIGNER_PRIVATE_KEY,
  process.env.ORACLE_SIGNER_2_PRIVATE_KEY,
  process.env.ORACLE_SIGNER_3_PRIVATE_KEY,
].filter((k): k is string => !!k)
const relayerPk = process.env.RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY
if (!oraclePks.length) throw new Error("set ORACLE_SIGNER_PRIVATE_KEY (and _2/_3 for the full set)")
if (!relayerPk) throw new Error("set RELAYER_PRIVATE_KEY or PRIVATE_KEY (pays gas to submit settle)")

const provider = new ethers.JsonRpcProvider(d.rpc, undefined, { staticNetwork: true })
const oracles = oraclePks.map((pk) => new ethers.Wallet(pk))
const relayer = new ethers.Wallet(relayerPk, provider)
const kickpact = new ethers.Contract(d.kickpact, kickpactAbi(), relayer)
const GAS = {
  gasPrice: BigInt(process.env.INJ_GAS_PRICE || "160000000"),
  gasLimit: BigInt(process.env.INJ_GAS_LIMIT || "500000"),
}

// Only the keys that are actually in the deployed signer set can contribute.
const deployedSet = (d.oracleSigners ?? []).map((a: string) => a.toLowerCase())
const threshold: number = d.threshold ?? 1
const usable = oracles.filter((o) => deployedSet.includes(o.address.toLowerCase()))
for (const o of oracles) {
  if (!deployedSet.includes(o.address.toLowerCase())) {
    console.warn(`⚠ key ${o.address} is not in the deployed signer set — ignoring it`)
  }
}
if (usable.length < threshold) {
  throw new Error(
    `need ${threshold} oracle keys from the deployed set, hold ${usable.length} (set ORACLE_SIGNER_2/3_PRIVATE_KEY)`,
  )
}
console.log(
  `[keeper] oracles ${usable.length}/${deployedSet.length} (threshold ${threshold})  relayer ${relayer.address}  → ${d.kickpact}`,
)

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

// Injective's eth_getTransactionReceipt(hash) is unreliable behind its k8s RPC
// load balancer, but state reads replicate fine — confirm via nonce advance.
async function waitMined(tx: any): Promise<string> {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await provider.getTransactionCount(relayer.address, "latest")) > tx.nonce) return tx.hash
    } catch {}
    await new Promise((res) => setTimeout(res, 1500))
  }
  throw new Error(`tx not mined: ${tx.hash}`)
}

async function settlePool(poolId: bigint, s: SignedResult) {
  try {
    const tx = await kickpact.settle(poolId, s.homeGoals, s.awayGoals, s.ts, s.signatures, GAS)
    const hash = await waitMined(tx)
    const p = await kickpact.getPool(poolId)
    console.log(`  ✔ pool #${poolId} settled ${s.homeGoals}-${s.awayGoals} → result=${p.result} winners=${p.winners}  ${d.explorer}/tx/${hash}`)
  } catch (e: any) {
    console.log(`  · pool #${poolId} skipped: ${(e.shortMessage || e.message || "").slice(0, 80)}`)
  }
}

/** Group open, past-full-time, unsettled pools by fixtureId. */
async function openPoolsByFixture(): Promise<Map<number, bigint[]>> {
  const next = Number(await kickpact.nextPoolId())
  const byFixture = new Map<number, bigint[]>()
  const now = Date.now()
  for (let id = 1; id < next; id++) {
    const p = await kickpact.getPool(id)
    if (p.settled) continue
    if (now < Number(p.kickoffMs) + FULL_TIME_MS) continue // not final yet
    const fx = Number(p.fixtureId)
    ;(byFixture.get(fx) ?? byFixture.set(fx, []).get(fx)!).push(BigInt(id))
  }
  return byFixture
}

async function sweep() {
  const manualFixture = flag("fixture")
  if (manualFixture) {
    const fixtureId = Number(manualFixture)
    const home = Number(flag("home"))
    const away = Number(flag("away"))
    if (Number.isNaN(home) || Number.isNaN(away)) throw new Error("--fixture needs --home and --away")
    const next = Number(await kickpact.nextPoolId())
    const pools: bigint[] = []
    for (let id = 1; id < next; id++) {
      const p = await kickpact.getPool(id)
      if (!p.settled && Number(p.fixtureId) === fixtureId) pools.push(BigInt(id))
    }
    if (!pools.length) return console.log(`no open pools on fixture ${fixtureId}`)
    const s = await signResult(usable.slice(0, threshold), d.chainId, d.kickpact, fixtureId, home, away, Date.now())
    console.log(`manual settle fixture ${fixtureId} = ${home}-${away} across ${pools.length} pool(s)`)
    for (const id of pools) await settlePool(id, s)
    return
  }

  const byFixture = await openPoolsByFixture()
  if (!byFixture.size) return console.log("nothing to settle")
  for (const [fixtureId, pools] of byFixture) {
    const score = await finalScore(fixtureId).catch(() => null)
    if (!score) {
      console.log(`fixture ${fixtureId}: no final score yet (${pools.length} pool(s) waiting)`)
      continue
    }
    const s = await signResult(usable.slice(0, threshold), d.chainId, d.kickpact, fixtureId, score.home, score.away, Math.max(score.tsMs, Date.now()))
    console.log(`fixture ${fixtureId} = ${score.home}-${score.away} → settling ${pools.length} pool(s)`)
    for (const id of pools) await settlePool(id, s)
  }
}

if (args.includes("--watch")) {
  console.log("[keeper] watching — sweeping every 30s")
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sweep().catch((e) => console.error("sweep error:", e.message))
    await new Promise((r) => setTimeout(r, 30_000))
  }
} else {
  await sweep()
}
