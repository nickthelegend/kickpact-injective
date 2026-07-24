/**
 * The settlement half of x402 — the service acts as its own facilitator.
 *
 * The payer signs an EIP-3009 `TransferWithAuthorization` off-chain (no gas, no
 * prior `approve`). This module takes that authorization, checks it can succeed,
 * SUBMITS `transferWithAuthorization` on-chain from a gas-paying relayer key,
 * waits for it to be mined, and then proves it happened by reading state back:
 * `authorizationState(from, nonce)` must have flipped to true and the
 * recipient's `balanceOf` must have risen by `value`.
 *
 * Nothing here is simulated. If `settlePayment` returns `ok`, tokens moved.
 */
import { ethers } from "ethers"
import { chainNow, GAS, revertReason, token, waitMined } from "./chain.ts"
import type { Authorization } from "./x402.ts"

export interface Facilitator {
  /** The gas payer's address (never its key). */
  relayer: string
  asset: string
  provider: ethers.Provider
  preflight(a: Authorization, value: bigint): Promise<PreflightResult>
  settle(a: Authorization, signature: string): Promise<SettleResult>
  balanceOf(who: string): Promise<bigint>
  authorizationState(from: string, nonce: string): Promise<boolean>
}

export type PreflightResult = { ok: true } | { ok: false; reason: string; detail: string }

export type SettleResult =
  | {
      ok: true
      transaction: string
      payer: string
      recipient: string
      amount: string
      payerBalanceBefore: string
      payerBalanceAfter: string
      recipientBalanceBefore: string
      recipientBalanceAfter: string
      authorizationStateBefore: boolean
      authorizationStateAfter: boolean
    }
  | { ok: false; reason: string; detail: string; transaction?: string }

/**
 * Build a facilitator bound to one ERC-3009 asset and one gas-paying key.
 * The key is turned into a wallet here and never leaves this module.
 */
export function facilitator(provider: ethers.Provider, relayerKey: string, asset: string): Facilitator {
  const wallet = new ethers.Wallet(relayerKey, provider)
  const contract = token(asset, wallet)

  const balanceOf = async (who: string): Promise<bigint> => BigInt(await contract.balanceOf(who))
  const authorizationState = async (from: string, nonce: string): Promise<boolean> =>
    Boolean(await contract.authorizationState(from, nonce))

  return {
    relayer: wallet.address,
    asset,
    provider,
    balanceOf,
    authorizationState,

    /** Fail fast, and for the real reason, instead of burning gas on a revert. */
    async preflight(a, value) {
      let now: number
      try {
        now = await chainNow(provider)
      } catch (e) {
        return { ok: false, reason: "settlement_rpc_unavailable", detail: revertReason(e) }
      }
      // The contract's window is strict on both ends: validAfter < now < validBefore.
      if (now <= Number(a.validAfter)) {
        return {
          ok: false,
          reason: "invalid_exact_evm_payload_authorization_valid_after",
          detail: `chain time ${now} <= validAfter ${a.validAfter}`,
        }
      }
      if (now >= Number(a.validBefore)) {
        return {
          ok: false,
          reason: "invalid_exact_evm_payload_authorization_valid_before",
          detail: `chain time ${now} >= validBefore ${a.validBefore}`,
        }
      }
      try {
        if (await authorizationState(a.from, a.nonce)) {
          return {
            ok: false,
            reason: "invalid_exact_evm_payload_authorization_nonce_used",
            detail: `authorizationState(${a.from}, ${a.nonce}) is already true on-chain`,
          }
        }
        const balance = await balanceOf(a.from)
        if (balance < value) {
          return {
            ok: false,
            reason: "insufficient_funds",
            detail: `payer holds ${balance} atomic units of ${asset}, needs ${value}`,
          }
        }
      } catch (e) {
        return { ok: false, reason: "settlement_rpc_unavailable", detail: revertReason(e) }
      }
      return { ok: true }
    },

    /**
     * Submit the authorization and only resolve `ok` once the chain agrees it
     * happened. Confirmation is nonce-advance + a state re-read, never a receipt.
     */
    async settle(a, signature) {
      const value = BigInt(a.value)
      let payerBefore: bigint
      let recipientBefore: bigint
      try {
        payerBefore = await balanceOf(a.from)
        recipientBefore = await balanceOf(a.to)
      } catch (e) {
        return { ok: false, reason: "settlement_rpc_unavailable", detail: revertReason(e) }
      }

      let tx: ethers.TransactionResponse
      try {
        tx = await contract.transferWithAuthorization(
          a.from,
          a.to,
          value,
          BigInt(a.validAfter),
          BigInt(a.validBefore),
          a.nonce,
          signature,
          GAS
        )
      } catch (e) {
        return { ok: false, reason: "settlement_reverted", detail: revertReason(e) }
      }

      try {
        await waitMined(provider, wallet.address, { hash: tx.hash, nonce: tx.nonce })
      } catch (e) {
        return { ok: false, reason: "settlement_not_mined", detail: revertReason(e), transaction: tx.hash }
      }

      // Mined is not settled — a reverted tx also advances the nonce. Read the
      // effect back out of state before calling this a payment.
      const usedAfter = await authorizationState(a.from, a.nonce)
      const payerAfter = await balanceOf(a.from)
      const recipientAfter = await balanceOf(a.to)
      if (!usedAfter || recipientAfter - recipientBefore < value) {
        return {
          ok: false,
          reason: "settlement_reverted",
          detail: `tx ${tx.hash} mined but state did not change: authorizationState=${usedAfter}, recipient +${recipientAfter - recipientBefore} of ${value}`,
          transaction: tx.hash,
        }
      }

      return {
        ok: true,
        transaction: tx.hash,
        payer: a.from,
        recipient: a.to,
        amount: a.value,
        payerBalanceBefore: payerBefore.toString(),
        payerBalanceAfter: payerAfter.toString(),
        recipientBalanceBefore: recipientBefore.toString(),
        recipientBalanceAfter: recipientAfter.toString(),
        authorizationStateBefore: false,
        authorizationStateAfter: usedAfter,
      }
    },
  }
}
