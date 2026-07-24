/**
 * Demo x402 client — the buyer side of the attestor.
 *
 * Hits /attest/:fixtureId, reads the 402's payment requirements, signs an
 * EIP-3009 TransferWithAuthorization for the quoted amount, retries with the
 * X-PAYMENT header, then checks the returned attestation actually recovers to
 * the deployed oracle signer set (ethers.verifyTypedData) in ascending order —
 * i.e. that Kickpact.settle() would accept it.
 *
 *   bun run src/client.ts 900303                  # full 402 → 200 round trip
 *   bun run src/client.ts 900303 --header-only    # just print an X-PAYMENT header for curl
 *
 * The payer key comes from PAYER_PRIVATE_KEY, else a throwaway random wallet.
 * Nothing here moves funds: the authorization is signed, not submitted — the
 * server does not settle it on-chain (see README).
 */
import { ethers } from "ethers"
import { deployedSigners, deployments, loadEnv } from "./config.ts"
import { RESULT_TYPES, resultDomain, type Attestation } from "./attest.ts"
import { TRANSFER_WITH_AUTHORIZATION_TYPES, X402_VERSION, type PaymentRequirements } from "./x402.ts"

loadEnv()
const d = deployments()
const BASE = process.env.ATTESTOR_URL || `http://localhost:${process.env.PORT || 4021}`

const args = process.argv.slice(2)
const fixtureId = Number(args.find((a) => /^\d+$/.test(a)) ?? 0)
const headerOnly = args.includes("--header-only")
if (!fixtureId) throw new Error("usage: bun run src/client.ts <fixtureId> [--header-only]")

const payer = process.env.PAYER_PRIVATE_KEY ? new ethers.Wallet(process.env.PAYER_PRIVATE_KEY) : ethers.Wallet.createRandom()

/** Sign the EIP-3009 authorization the 402 asked for and base64 it, x402 v1 style. */
async function buildPaymentHeader(req: PaymentRequirements): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  const authorization = {
    from: payer.address,
    to: ethers.getAddress(req.payTo),
    value: req.maxAmountRequired,
    validAfter: String(nowSec - 60),
    validBefore: String(nowSec + Math.max(60, req.maxTimeoutSeconds)),
    nonce: ethers.hexlify(ethers.randomBytes(32)),
  }
  const domain = {
    name: req.extra.name,
    version: req.extra.version,
    chainId: d.chainId,
    verifyingContract: req.asset,
  }
  const signature = await payer.signTypedData(domain, TRANSFER_WITH_AUTHORIZATION_TYPES as any, authorization)
  const payload = {
    x402Version: X402_VERSION,
    scheme: req.scheme,
    network: req.network,
    payload: { signature, authorization },
  }
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64")
}

const url = `${BASE}/attest/${fixtureId}`
const first = await fetch(url)
if (first.status !== 402) {
  console.log(`unexpected status ${first.status} (expected 402):`)
  console.log(await first.text())
  process.exit(1)
}
const quote = (await first.json()) as { accepts: PaymentRequirements[] }
const req = quote.accepts[0]
const header = await buildPaymentHeader(req)

if (headerOnly) {
  console.log(header)
  process.exit(0)
}

console.log(`402 → pay ${req.maxAmountRequired} of ${req.asset} to ${req.payTo} (${req.network}/${req.scheme})`)
console.log(`payer ${payer.address}`)

const paid = await fetch(url, { headers: { "X-PAYMENT": header } })
console.log(`retry with X-PAYMENT → ${paid.status}`)
const body = (await paid.json()) as Attestation & Record<string, any>
if (paid.status !== 200) {
  console.log(JSON.stringify(body, null, 2))
  process.exit(1)
}

const settlement = paid.headers.get("x-payment-response")
console.log(`X-PAYMENT-RESPONSE: ${settlement ? Buffer.from(settlement, "base64").toString("utf8") : "(none)"}`)

// Independently confirm the attestation is what settle() will accept.
const domain = resultDomain(d.chainId, body.verifyingContract)
const value = { fixtureId: body.fixtureId, homeGoals: body.homeGoals, awayGoals: body.awayGoals, ts: body.ts }
const known = new Set(deployedSigners(d).map((a) => a.toLowerCase()))
let last = 0n
let ok = true
body.signatures.forEach((sig: string, i: number) => {
  const recovered = ethers.verifyTypedData(domain, RESULT_TYPES as any, value, sig)
  const inSet = known.has(recovered.toLowerCase())
  const ascending = BigInt(recovered) > last
  last = BigInt(recovered)
  ok &&= inSet && ascending && recovered.toLowerCase() === String(body.signers[i]).toLowerCase()
  console.log(`  sig[${i}] → ${recovered}  inDeployedSet=${inSet}  ascending=${ascending}`)
})
console.log(
  `score ${body.homeGoals}-${body.awayGoals} ts=${body.ts} threshold=${body.threshold} sigs=${body.signatures.length}`
)
console.log(ok && body.signatures.length >= body.threshold ? "OK — settle() would accept this set" : "FAILED")
process.exit(ok ? 0 : 1)
