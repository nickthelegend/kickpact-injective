/**
 * The product being sold: an M-of-N oracle attestation over a fixture's raw
 * final goals.
 *
 * The domain and the type MUST match Kickpact.sol (and keeper/src/oracle.ts)
 * exactly, byte for byte — these are the same signatures the escrow's
 * permissionless `settle(poolId, homeGoals, awayGoals, ts, bytes[] signatures)`
 * accepts. The contract recovers every signature, requires the recovered
 * addresses to STRICTLY INCREASE (so duplicates are impossible), requires each
 * to be a configured oracle key, then derives home/draw/away from the goals
 * itself. The signers report a score; they never pick a winner.
 */
import { ethers } from "ethers"
import { deployedSigners, type Deployments } from "./config.ts"

export const RESULT_TYPES = {
  Result: [
    { name: "fixtureId", type: "uint64" },
    { name: "homeGoals", type: "uint8" },
    { name: "awayGoals", type: "uint8" },
    { name: "ts", type: "uint64" },
  ],
} as const

export function resultDomain(chainId: number, verifyingContract: string) {
  return { name: "Kickpact", version: "1", chainId, verifyingContract }
}

export interface Attestation {
  fixtureId: number
  homeGoals: number
  awayGoals: number
  /** epoch ms of the final whistle; the contract requires ts >= kickoff + 105m. */
  ts: number
  /** EIP-712 signatures, ordered by recovered signer address ASCENDING. */
  signatures: string[]
  /** The recovered addresses, in the same order. */
  signers: string[]
  threshold: number
  chainId: number
  verifyingContract: string
}

/**
 * Load the oracle keys from the environment (ORACLE_SIGNER_PRIVATE_KEY,
 * ORACLE_SIGNER_2_PRIVATE_KEY, …) and keep only those that are actually in the
 * deployed signer set — a key the escrow doesn't know produces a signature that
 * reverts settle(). Keys are never logged; only addresses are.
 */
export function oracleWallets(d: Deployments): ethers.Wallet[] {
  const allowed = new Set(deployedSigners(d).map((a) => a.toLowerCase()))
  const names = ["ORACLE_SIGNER_PRIVATE_KEY"]
  for (let i = 2; i <= 10; i++) names.push(`ORACLE_SIGNER_${i}_PRIVATE_KEY`)

  const wallets: ethers.Wallet[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const pk = process.env[name]
    if (!pk) continue
    let w: ethers.Wallet
    try {
      w = new ethers.Wallet(pk)
    } catch {
      // Never surface the offending value.
      throw new Error(`${name} is not a valid private key`)
    }
    const addr = w.address.toLowerCase()
    if (seen.has(addr)) continue
    if (allowed.size && !allowed.has(addr)) continue
    seen.add(addr)
    wallets.push(w)
  }
  return wallets
}

export function thresholdOf(d: Deployments): number {
  const env = Number(process.env.ORACLE_THRESHOLD)
  if (Number.isFinite(env) && env > 0) return env
  return d.threshold && d.threshold > 0 ? d.threshold : 1
}

/**
 * Sign the goals with every available oracle key, recover each signature to
 * confirm it is what the contract will see, sort by recovered address ascending
 * (settle() rejects anything else), and return exactly `threshold` of them —
 * any ascending prefix of an ascending list is still ascending.
 */
export async function attest(
  wallets: ethers.Wallet[],
  threshold: number,
  chainId: number,
  verifyingContract: string,
  fixtureId: number,
  homeGoals: number,
  awayGoals: number,
  tsMs: number
): Promise<Attestation> {
  if (wallets.length < threshold) {
    throw new Error(`need ${threshold} oracle keys, ${wallets.length} configured`)
  }
  const domain = resultDomain(chainId, verifyingContract)
  const value = { fixtureId, homeGoals, awayGoals, ts: tsMs }

  const signed: { signer: string; signature: string }[] = []
  for (const w of wallets) {
    const signature = await w.signTypedData(domain, RESULT_TYPES as any, value)
    const signer = ethers.verifyTypedData(domain, RESULT_TYPES as any, value, signature)
    if (signer.toLowerCase() !== w.address.toLowerCase()) throw new Error("signature failed self-verification")
    signed.push({ signer, signature })
  }
  signed.sort((a, b) => (BigInt(a.signer) < BigInt(b.signer) ? -1 : 1))
  const chosen = signed.slice(0, threshold)

  return {
    fixtureId,
    homeGoals,
    awayGoals,
    ts: tsMs,
    signatures: chosen.map((s) => s.signature),
    signers: chosen.map((s) => s.signer),
    threshold,
    chainId,
    verifyingContract,
  }
}
