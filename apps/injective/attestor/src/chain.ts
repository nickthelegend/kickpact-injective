/**
 * Injective EVM plumbing shared by the server (which settles payments) and the
 * demo client (which faucets itself kUSD).
 *
 * ┌── THE RPC GOTCHA THIS FILE EXISTS FOR ──────────────────────────────────┐
 * │ Injective's k8s JSON-RPC load balancer answers eth_getTransaction-      │
 * │ Receipt / …ByHash unreliably: a mined transaction often reads back as   │
 * │ "unknown" for a while, so `tx.wait()` hangs or throws on a tx that      │
 * │ actually succeeded. STATE reads (eth_call, eth_getTransactionCount)     │
 * │ replicate fine. So we confirm the way keeper/src/keeper.ts does —       │
 * │ poll the sender's nonce until it passes the tx's nonce — and then       │
 * │ confirm the EFFECT by reading state (authorizationState, balanceOf)     │
 * │ rather than trusting a receipt's status field.                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { ethers } from "ethers"
import { deployments, kusdAbi, type Deployments } from "./config.ts"

/** Legacy gas — Injective EVM rejects EIP-1559 fee fields from ethers' estimator. */
export const GAS = {
  gasPrice: BigInt(process.env.INJ_GAS_PRICE || "160000000"),
  gasLimit: BigInt(process.env.INJ_GAS_LIMIT || "300000"),
}

export function rpcProvider(d: Deployments = deployments()) {
  const url = process.env.INJ_TESTNET_RPC_URL || d.rpc
  return new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true })
}

export function token(address: string, runner: ethers.ContractRunner) {
  return new ethers.Contract(address, kusdAbi(), runner)
}

/**
 * Wait for `tx` to be mined without asking for its receipt.
 * Returns the hash once the sender's nonce has moved past it.
 */
export async function waitMined(
  provider: ethers.Provider,
  from: string,
  tx: { hash: string; nonce: number },
  attempts = 90,
  intervalMs = 1500
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    try {
      if ((await provider.getTransactionCount(from, "latest")) > tx.nonce) return tx.hash
    } catch {
      // transient RPC failure — keep polling
    }
    await new Promise((res) => setTimeout(res, intervalMs))
  }
  throw new Error(`tx not mined within ${(attempts * intervalMs) / 1000}s: ${tx.hash}`)
}

/** Chain time, which is what the EIP-3009 validAfter/validBefore window is judged against. */
export async function chainNow(provider: ethers.Provider): Promise<number> {
  const block = await provider.getBlock("latest")
  return block?.timestamp ?? Math.floor(Date.now() / 1000)
}

/** Strip ethers' wrapping so a revert surfaces as `AuthorizationExpired`, not a 400-char blob. */
export function revertReason(e: any): string {
  return (
    e?.revert?.name ||
    e?.errorName ||
    e?.shortMessage ||
    e?.info?.error?.message ||
    e?.message ||
    "unknown_error"
  )
    .toString()
    .slice(0, 200)
}
