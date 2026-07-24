/**
 * x402 (HTTP 402 Payment Required), protocol version 1, `exact` scheme on EVM.
 *
 * Wire shapes follow coinbase/x402 `specs/x402-specification-v1.md` +
 * `specs/transports-v1/http.md`:
 *   402 body   → { x402Version, error, accepts: PaymentRequirements[] }
 *   X-PAYMENT  → base64(JSON PaymentPayload { x402Version, scheme, network, payload })
 *   payload    → { signature, authorization } where `authorization` is the
 *                EIP-3009 TransferWithAuthorization struct the payer signed.
 *   X-PAYMENT-RESPONSE → base64(JSON SettlementResponse)
 *
 * ┌── HONEST SCOPE OF VERIFICATION ─────────────────────────────────────────┐
 * │ IMPLEMENTED (offline, deterministic):                                   │
 * │   · structural decode of the X-PAYMENT header                           │
 * │   · x402Version / scheme / network match what we advertised             │
 * │   · authorization.to == payTo, value >= maxAmountRequired               │
 * │   · validAfter <= now <= validBefore (time window)                      │
 * │   · EIP-712 recovery of the TransferWithAuthorization signature against │
 * │     the token's EIP-3009 domain, and recovered == authorization.from    │
 * │   · single-use nonce (in-memory replay set, pruned at validBefore)      │
 * │                                                                         │
 * │ NOT IMPLEMENTED — do not read this module as proof of payment:          │
 * │   · no on-chain settlement: transferWithAuthorization is NEVER          │
 * │     submitted, so no USDC actually moves                                │
 * │   · no facilitator /verify or /settle call                              │
 * │   · no balanceOf(from) check, no authorizationState(from, nonce) check, │
 * │     no transaction simulation                                           │
 * │   · the replay set is process-memory only — it resets on restart        │
 * │ A structurally valid authorization from an empty wallet passes here.    │
 * │ This is a demo/hackathon service; treat the attestation as free.        │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { ethers } from "ethers"

export const X402_VERSION = 1

/** PaymentRequirements — one entry of the 402 body's `accepts` array. */
export interface PaymentRequirements {
  scheme: "exact"
  network: string
  maxAmountRequired: string
  asset: string
  payTo: string
  resource: string
  description: string
  mimeType: string
  outputSchema: unknown | null
  maxTimeoutSeconds: number
  /** Scheme extra: the token's EIP-712 domain name/version, so the payer signs
   *  the same struct we verify. */
  extra: { name: string; version: string }
}

export interface Authorization {
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}

export interface PaymentPayload {
  x402Version: number
  scheme: string
  network: string
  payload: { signature: string; authorization: Authorization }
}

/** SettlementResponse — the decoded X-PAYMENT-RESPONSE header. */
export interface SettlementResponse {
  success: boolean
  errorReason?: string
  transaction: string
  network: string
  payer: string
}

/** EIP-3009, as referenced by the x402 `exact` EVM scheme. */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const

export function assetDomain(req: PaymentRequirements, chainId: number) {
  return { name: req.extra.name, version: req.extra.version, chainId, verifyingContract: req.asset }
}

export function paymentRequiredBody(error: string, accepts: PaymentRequirements[]) {
  return { x402Version: X402_VERSION, error, accepts }
}

export type VerifyResult =
  | { isValid: true; payer: string; authorization: Authorization }
  | { isValid: false; invalidReason: string; payer?: string }

/** Single-use nonces, keyed by asset:from:nonce, expiring at validBefore. */
export class NonceStore {
  private used = new Map<string, number>()

  private key(asset: string, a: Authorization) {
    return `${asset.toLowerCase()}:${a.from.toLowerCase()}:${a.nonce.toLowerCase()}`
  }

  has(asset: string, a: Authorization): boolean {
    this.prune()
    return this.used.has(this.key(asset, a))
  }

  remember(asset: string, a: Authorization) {
    this.used.set(this.key(asset, a), Number(a.validBefore))
  }

  private prune() {
    const nowSec = Math.floor(Date.now() / 1000)
    for (const [k, exp] of this.used) if (exp < nowSec) this.used.delete(k)
  }

  get size() {
    return this.used.size
  }
}

const isAddr = (v: unknown): v is string => typeof v === "string" && ethers.isAddress(v)
const isUint = (v: unknown): v is string => typeof v === "string" && /^[0-9]+$/.test(v)

/**
 * Verify an X-PAYMENT header against the requirements we advertised.
 * See the scope banner at the top of this file: this is offline validation of
 * a payment AUTHORIZATION, not confirmation that funds moved.
 */
export function verifyPayment(
  header: string,
  req: PaymentRequirements,
  chainId: number,
  nonces: NonceStore
): VerifyResult {
  let decoded: PaymentPayload
  try {
    decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"))
  } catch {
    return { isValid: false, invalidReason: "invalid_payload" }
  }
  if (!decoded || typeof decoded !== "object") return { isValid: false, invalidReason: "invalid_payload" }
  if (decoded.x402Version !== X402_VERSION) return { isValid: false, invalidReason: "invalid_x402_version" }
  if (decoded.scheme !== req.scheme) return { isValid: false, invalidReason: "invalid_scheme" }
  if (decoded.network !== req.network) return { isValid: false, invalidReason: "invalid_network" }

  const p = decoded.payload
  const a = p?.authorization
  if (!p || typeof p.signature !== "string" || !a) return { isValid: false, invalidReason: "invalid_payload" }
  if (!isAddr(a.from) || !isAddr(a.to)) return { isValid: false, invalidReason: "invalid_payload" }
  if (!isUint(a.value) || !isUint(a.validAfter) || !isUint(a.validBefore)) {
    return { isValid: false, invalidReason: "invalid_payload" }
  }
  if (typeof a.nonce !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(a.nonce)) {
    return { isValid: false, invalidReason: "invalid_payload" }
  }

  // Paying someone else doesn't buy anything here.
  if (a.to.toLowerCase() !== req.payTo.toLowerCase()) {
    return { isValid: false, invalidReason: "invalid_exact_evm_payload_recipient_mismatch" }
  }
  if (BigInt(a.value) < BigInt(req.maxAmountRequired)) {
    return { isValid: false, invalidReason: "invalid_exact_evm_payload_authorization_value" }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  if (nowSec < Number(a.validAfter)) {
    return { isValid: false, invalidReason: "invalid_exact_evm_payload_authorization_valid_after" }
  }
  if (nowSec >= Number(a.validBefore)) {
    return { isValid: false, invalidReason: "invalid_exact_evm_payload_authorization_valid_before" }
  }

  // The one real cryptographic check we can do without a chain: recover the
  // EIP-3009 signature and confirm the payer signed exactly this authorization
  // against this token's domain.
  let payer: string
  try {
    payer = ethers.verifyTypedData(
      assetDomain(req, chainId),
      TRANSFER_WITH_AUTHORIZATION_TYPES as any,
      {
        from: a.from,
        to: a.to,
        value: a.value,
        validAfter: a.validAfter,
        validBefore: a.validBefore,
        nonce: a.nonce,
      },
      p.signature
    )
  } catch {
    return { isValid: false, invalidReason: "invalid_exact_evm_payload_signature" }
  }
  if (payer.toLowerCase() !== a.from.toLowerCase()) {
    return { isValid: false, invalidReason: "invalid_exact_evm_payload_signature", payer }
  }

  // EIP-3009 nonces are single-use on-chain; they are single-use here too.
  // (Reason string extends the spec's list — it has no replay-specific code.)
  if (nonces.has(req.asset, a)) {
    return { isValid: false, invalidReason: "invalid_exact_evm_payload_authorization_nonce_used", payer }
  }

  return { isValid: true, payer, authorization: a }
}

export function encodeSettlementResponse(r: SettlementResponse): string {
  return Buffer.from(JSON.stringify(r), "utf8").toString("base64")
}
