/**
 * Demo x402 client — the buyer side of the attestor, and a real one.
 *
 * It actually pays. The flow:
 *   1. GET /attest/:fixtureId  → 402 with the payment requirements
 *   2. top up: if the wallet holds less kUSD than the quote, call the token's
 *      open testnet faucet() (this is the one step that needs INJ for gas —
 *      the payment itself does not)
 *   3. sign the EIP-3009 TransferWithAuthorization for the advertised terms
 *   4. retry with X-PAYMENT → the server settles it on-chain and returns 200
 *   5. check the goods: every signature must recover to a member of the
 *      escrow's deployed oracle set, ascending — i.e. settle() would accept it
 *
 * It prints the payer's and the recipient's kUSD balance before and after, so
 * you can see the money move.
 *
 *   BUYER_PRIVATE_KEY=0x… bun run src/client.ts 900303
 *   bun run src/client.ts 900303 --header-only    # just an X-PAYMENT header for curl
 *
 * Without BUYER_PRIVATE_KEY a fresh wallet is generated and printed — it has no
 * INJ, so fund it (or set the env var) before it can faucet itself kUSD.
 */
import { ethers } from "ethers"
import { deployedSigners, deployments, loadEnv } from "./config.ts"
import { RESULT_TYPES, resultDomain, type Attestation } from "./attest.ts"
import { GAS, rpcProvider, token, waitMined } from "./chain.ts"
import { TRANSFER_WITH_AUTHORIZATION_TYPES, X402_VERSION, type PaymentRequirements } from "./x402.ts"

loadEnv()
const d = deployments()
const BASE = process.env.ATTESTOR_URL || `http://localhost:${process.env.PORT || 4021}`

const args = process.argv.slice(2)
const fixtureId = Number(args.find((a) => /^\d+$/.test(a)) ?? 0)
const headerOnly = args.includes("--header-only")
if (!fixtureId) throw new Error("usage: bun run src/client.ts <fixtureId> [--header-only]")

const provider = rpcProvider(d)
const buyerKey = process.env.BUYER_PRIVATE_KEY || process.env.PAYER_PRIVATE_KEY
const generated = !buyerKey
const payer = buyerKey ? new ethers.Wallet(buyerKey, provider) : ethers.Wallet.createRandom().connect(provider)

const units = (v: bigint) => `${ethers.formatUnits(v, 6)} (${v} atomic)`

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

/** Mint enough of the demo token to pay the quote. Testnet faucet, capped at 1,000. */
async function topUp(asset: string, need: bigint): Promise<bigint> {
  const t = token(asset, payer)
  let balance: bigint = await t.balanceOf(payer.address)
  if (balance >= need) return balance

  const gas = await provider.getBalance(payer.address)
  console.log(`balance ${units(balance)} < price ${units(need)} — calling faucet() (INJ for gas: ${ethers.formatEther(gas)})`)
  if (gas === 0n) {
    console.log(`payer ${payer.address} has no INJ — fund it from the Injective testnet faucet, then re-run`)
    process.exit(1)
  }
  const CAP = 1_000_000_000n // FAUCET_CAP: 1,000 kUSD per call
  const ONE = 1_000_000n // don't bother minting dust
  const amount = need > ONE ? (need > CAP ? CAP : need) : ONE
  const tx = await t.faucet(amount, GAS)
  const hash = await waitMined(provider, payer.address, { hash: tx.hash, nonce: tx.nonce })
  balance = await t.balanceOf(payer.address)
  console.log(`faucet ok → ${units(balance)}  ${d.explorer}/tx/${hash}`)
  if (balance < need) {
    console.log("faucet did not cover the price — aborting")
    process.exit(1)
  }
  return balance
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

if (headerOnly) {
  console.log(await buildPaymentHeader(req))
  process.exit(0)
}

if (generated) console.log(`no BUYER_PRIVATE_KEY — generated a throwaway wallet; it needs INJ for the faucet call`)
console.log(`402 → pay ${req.maxAmountRequired} of ${req.asset} to ${req.payTo} (${req.network}/${req.scheme})`)
console.log(`     domain ${req.extra.name} v${req.extra.version} on chain ${d.chainId}`)
console.log(`payer ${payer.address}`)

const t = token(req.asset, provider)
await topUp(req.asset, BigInt(req.maxAmountRequired))

const payerBefore: bigint = await t.balanceOf(payer.address)
const recipientBefore: bigint = await t.balanceOf(req.payTo)
console.log(`before  payer ${units(payerBefore)}   recipient ${units(recipientBefore)}`)

const header = await buildPaymentHeader(req)
const paid = await fetch(url, { headers: { "X-PAYMENT": header } })
console.log(`retry with X-PAYMENT → ${paid.status}`)
const body = (await paid.json()) as Attestation & Record<string, any>
if (paid.status !== 200) {
  console.log(JSON.stringify(body, null, 2))
  process.exit(1)
}

const settlement = paid.headers.get("x-payment-response")
console.log(`X-PAYMENT-RESPONSE: ${settlement ? Buffer.from(settlement, "base64").toString("utf8") : "(none)"}`)

const payerAfter: bigint = await t.balanceOf(payer.address)
const recipientAfter: bigint = await t.balanceOf(req.payTo)
const nonce = body.payment?.nonce
const spent = nonce ? await t.authorizationState(payer.address, nonce) : null
console.log(`after   payer ${units(payerAfter)}   recipient ${units(recipientAfter)}`)
console.log(`moved   payer ${payerAfter - payerBefore}   recipient +${recipientAfter - recipientBefore}   tx ${body.payment?.transaction}`)
console.log(`authorizationState(${payer.address}, ${nonce}) = ${spent}`)

// A replay of the very same header must be refused — the nonce is spent.
const replay = await fetch(url, { headers: { "X-PAYMENT": header } })
const replayBody = (await replay.json()) as any
console.log(`replay same X-PAYMENT → ${replay.status} ${replayBody.invalidReason ?? ""}`)

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

const paidForReal =
  body.payment?.settled === true &&
  recipientAfter - recipientBefore === BigInt(req.maxAmountRequired) &&
  spent === true &&
  replay.status === 402
ok &&= paidForReal && body.signatures.length >= body.threshold
console.log(ok ? "OK — payment settled on-chain and settle() would accept this signature set" : "FAILED")
process.exit(ok ? 0 : 1)
