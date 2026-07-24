/**
 * The oracle attestation — EIP-712 signatures over a fixture's raw final goals.
 * This is the whole trust root: the Kickpact contract accepts a settlement only
 * if `threshold` distinct signatures recover to keys in its configured signer
 * set, and it then derives the outcome from the goals itself. No signer ever
 * chooses a winner; they report the score, and a minority can't settle alone.
 *
 * The domain + type MUST match Kickpact.sol exactly.
 */
import { ethers } from "ethers"

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

export interface SignedResult {
  fixtureId: number
  homeGoals: number
  awayGoals: number
  ts: number // epoch ms
  /** Signatures sorted by recovered signer address ASCENDING — settle() requires it. */
  signatures: string[]
  /** The signer addresses, in the same order as `signatures`. */
  signers: string[]
}

/**
 * Sign a fixture's final goals with EVERY oracle key we hold, and return the
 * signatures sorted by signer address ascending. `settle()` walks the array and
 * requires each recovered address to be strictly greater than the last, which is
 * how it rejects a duplicate signature without an O(n²) scan.
 */
export async function signResult(
  oracles: ethers.Wallet[],
  chainId: number,
  kickpact: string,
  fixtureId: number,
  homeGoals: number,
  awayGoals: number,
  tsMs: number,
): Promise<SignedResult> {
  const domain = resultDomain(chainId, kickpact)
  const value = { fixtureId, homeGoals, awayGoals, ts: tsMs }
  const signed = await Promise.all(
    oracles.map(async (o) => ({
      signer: o.address,
      signature: await o.signTypedData(domain, RESULT_TYPES as any, value),
    })),
  )
  signed.sort((a, b) => (a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1))
  return {
    fixtureId,
    homeGoals,
    awayGoals,
    ts: tsMs,
    signatures: signed.map((s) => s.signature),
    signers: signed.map((s) => s.signer),
  }
}
