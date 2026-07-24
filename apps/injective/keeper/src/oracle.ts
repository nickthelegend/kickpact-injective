/**
 * The oracle attestation — an EIP-712 signature over a fixture's raw final
 * goals. This is the whole trust root: the Kickpact contract accepts a
 * settlement only if this signature recovers to its configured `oracleSigner`,
 * then derives the outcome from the goals itself. The signer never chooses a
 * winner; it reports the score.
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
  signature: string
  signer: string
}

/** Sign a fixture's final goals with the oracle key. */
export async function signResult(
  oracle: ethers.Wallet,
  chainId: number,
  kickpact: string,
  fixtureId: number,
  homeGoals: number,
  awayGoals: number,
  tsMs: number,
): Promise<SignedResult> {
  const signature = await oracle.signTypedData(resultDomain(chainId, kickpact), RESULT_TYPES as any, {
    fixtureId,
    homeGoals,
    awayGoals,
    ts: tsMs,
  })
  return { fixtureId, homeGoals, awayGoals, ts: tsMs, signature, signer: oracle.address }
}
