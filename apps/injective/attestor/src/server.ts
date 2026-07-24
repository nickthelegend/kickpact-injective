/**
 * Kickpact attestor — an x402-priced oracle attestation service.
 *
 * Sells the one thing Kickpact's escrow can't get from a chain feed: an
 * M-of-N oracle attestation over a World Cup fixture's final goals, in exactly
 * the EIP-712 form the escrow's permissionless `settle()` accepts. Anyone can
 * buy one and settle every pool on that match; the fee funds the oracle.
 *
 *   GET /                  free  — index + price
 *   GET /fixtures          free  — which fixtures are attestable right now
 *   GET /attest/:fixtureId PAID  — 402 without X-PAYMENT, 200 + signatures with it
 *
 * Run:  bun run src/server.ts        (PORT=4021 by default)
 *
 * PAYMENTS ARE REAL. A valid X-PAYMENT is verified offline (src/x402.ts), then
 * pre-flighted and SETTLED on-chain (src/facilitator.ts): the service submits
 * the payer's EIP-3009 `transferWithAuthorization` from its own gas-paying key
 * and waits for the transfer to be confirmed in state. The 200 — and the
 * signatures — are released only after kUSD has actually moved.
 */
import { ethers } from "ethers"
import { deployedSigners, deployments, escrows, loadEnv, relayerKey } from "./config.ts"
import { attest, oracleWallets, RESULT_TYPES, resultDomain, thresholdOf } from "./attest.ts"
import { rpcProvider } from "./chain.ts"
import { facilitator } from "./facilitator.ts"
import { attestableFixtures, fetchFixture, isAttestable, usingLiveApi, type Fixture } from "./fixtures.ts"
import {
  encodeSettlementResponse,
  NonceStore,
  paymentRequiredBody,
  verifyPayment,
  X402_VERSION,
  type PaymentRequirements,
} from "./x402.ts"

loadEnv()

const d = deployments()
const PORT = Number(process.env.PORT || process.env.ATTESTOR_PORT || 4021)
const NETWORK = process.env.ATTESTOR_NETWORK || "injective-testnet"
/** Atomic units of a 6-decimal token. 10000 = 0.01 kUSD. */
const PRICE = process.env.ATTESTOR_PRICE || "10000"
const MAX_TIMEOUT_SECONDS = Number(process.env.ATTESTOR_MAX_TIMEOUT || 300)
/**
 * The token payments are denominated in: kUSD, the deployment's EIP-3009 token.
 *
 * Not native USDC — deliberately. USDC can't be minted on Injective testnet and
 * there's no CCTP route to bridge it in, so pricing in USDC would mean either
 * nobody can pay or we pretend they did. kUSD has an open faucet and the same
 * EIP-3009 surface, so the payment is real end to end; pointing ATTESTOR_ASSET
 * at real USDC on a chain where the buyer holds some changes nothing else.
 */
const ASSET = process.env.ATTESTOR_ASSET || d.kusd || ""
const ASSET_SYMBOL = process.env.ATTESTOR_ASSET_SYMBOL || "kUSD"
/** EIP-3009 domain of that token; advertised in `extra` so payers sign what we submit. */
const ASSET_NAME = process.env.ATTESTOR_ASSET_EIP712_NAME || "Kickpact USD"
const ASSET_VERSION = process.env.ATTESTOR_ASSET_EIP712_VERSION || "1"

const SIGNERS = deployedSigners(d)
const THRESHOLD = thresholdOf(d)
const WALLETS = oracleWallets(d)
/** Fees go to the oracle. Never a private key — an address, from the deployed set. */
const PAY_TO = process.env.ATTESTOR_PAY_TO || SIGNERS[0] || ""
const ESCROWS = escrows(d)
const DEFAULT_ESCROW = d.kickpact

const nonces = new NonceStore()

if (!ASSET) throw new Error("no payment asset — deployments.json has no kusd address (or set ATTESTOR_ASSET)")
if (!PAY_TO) throw new Error("no payTo address — set ATTESTOR_PAY_TO or deploy with oracleSigners")
if (!DEFAULT_ESCROW) throw new Error("deployments.json has no kickpact address — deploy first")
if (WALLETS.length < THRESHOLD) {
  throw new Error(
    `need ${THRESHOLD} of the deployed oracle keys in .env (ORACLE_SIGNER_PRIVATE_KEY, ORACLE_SIGNER_2_PRIVATE_KEY, …); ${WALLETS.length} usable`
  )
}

// The service is its own x402 facilitator: it pays the gas to submit the
// payer's authorization. RELAYER_PRIVATE_KEY, else PRIVATE_KEY. Never logged.
const provider = rpcProvider(d)
const fac = facilitator(provider, relayerKey(), ASSET)

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body, null, 2) + "\n", {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  })

/** Resolve ?contract= to the escrow the attestation is bound to (EIP-712 domain). */
function resolveEscrow(url: URL): string | null {
  const q = url.searchParams.get("contract")
  if (!q) return DEFAULT_ESCROW
  if (ESCROWS[q]) return ESCROWS[q]
  if (ethers.isAddress(q)) return ethers.getAddress(q)
  return null
}

function requirements(resource: string, fixture: Fixture): PaymentRequirements {
  return {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: PRICE,
    asset: ASSET,
    payTo: PAY_TO,
    resource,
    description: `Oracle-signed final score for World Cup fixture ${fixture.id} (${fixture.home} vs ${fixture.away}) — ${THRESHOLD}-of-${SIGNERS.length} EIP-712 attestation accepted by Kickpact.settle()`,
    mimeType: "application/json",
    outputSchema: null,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: { name: ASSET_NAME, version: ASSET_VERSION },
  }
}

const fixtureView = (f: Fixture) => ({
  fixtureId: f.id,
  home: f.home,
  away: f.away,
  round: f.round,
  kickoffMs: f.kickoffMs,
  state: f.state,
  homeGoals: f.homeGoals,
  awayGoals: f.awayGoals,
  finalWhistleMs: f.tsMs,
  attestable: isAttestable(f),
})

function index(origin: string) {
  return {
    service: "kickpact-attestor",
    description:
      "x402-priced oracle attestations over World Cup final scores. Buy an EIP-712 signature set and settle any Kickpact pool on that fixture — permissionlessly.",
    x402Version: X402_VERSION,
    price: {
      maxAmountRequired: PRICE,
      humanReadable: `${(Number(PRICE) / 1e6).toFixed(6)} ${ASSET_SYMBOL} per attestation`,
      asset: ASSET,
      assetSymbol: ASSET_SYMBOL,
      assetDecimals: 6,
      assetDomain: { name: ASSET_NAME, version: ASSET_VERSION },
      network: NETWORK,
      payTo: PAY_TO,
      scheme: "exact",
      settlement: "on-chain EIP-3009 transferWithAuthorization, submitted by this service",
      faucet: `${ASSET_SYMBOL}.faucet(uint256) is open on testnet — any wallet can fund itself to pay`,
    },
    endpoints: [
      { method: "GET", path: "/", price: "free", description: "this index" },
      { method: "GET", path: "/fixtures", price: "free", description: "fixtures with a final score, i.e. what can be attested now" },
      {
        method: "GET",
        path: "/attest/{fixtureId}",
        price: `${PRICE} atomic units of ${ASSET}`,
        description:
          "402 Payment Required without an X-PAYMENT header; with one, 200 + the M-of-N EIP-712 signatures Kickpact.settle() accepts",
        query: { contract: `escrow the signatures bind to: ${Object.keys(ESCROWS).join(" | ")} | 0x… (default ${DEFAULT_ESCROW})` },
      },
    ],
    oracle: {
      signers: SIGNERS,
      threshold: THRESHOLD,
      keysLoaded: WALLETS.length,
      eip712: { primaryType: "Result", types: RESULT_TYPES, domain: resultDomain(d.chainId, DEFAULT_ESCROW) },
    },
    chain: { network: d.network, chainId: d.chainId, rpc: d.rpc, explorer: d.explorer, escrows: ESCROWS },
    dataSource: usingLiveApi() ? "api-football (live)" : "bundled snapshot (keeper/fixtures.snapshot.json)",
    verification: {
      implemented: [
        "X-PAYMENT base64/JSON decode + x402Version/scheme/network match",
        "authorization.to == payTo, value >= maxAmountRequired",
        "validAfter <= now < validBefore",
        "EIP-712 recovery of the EIP-3009 TransferWithAuthorization signature (recovered == from)",
        "single-use nonce (in-memory claim, plus on-chain authorizationState)",
        "pre-flight against chain state: balanceOf(from) >= value, authorizationState(from, nonce) == false, block-timestamp window",
        "ON-CHAIN SETTLEMENT: transferWithAuthorization submitted by this service and confirmed before the goods are released",
      ],
      notImplemented: [
        "no external x402 facilitator — this service settles for itself",
        "the in-flight nonce claim is process memory; the durable replay guard is the token's authorizationState",
        "x402 v2 wire shapes (amount / CAIP-2 network / PAYMENT-SIGNATURE)",
      ],
      settledBy: fac.relayer,
      note: "The 200 is returned only after the transfer is confirmed in chain state. A signed authorization from an empty wallet is rejected with 402 insufficient_funds.",
    },
    example: `curl -i ${origin}/attest/${900303}`,
  }
}

/** 402 + an honest X-PAYMENT-RESPONSE. `detail` explains a chain-side failure. */
function rejected(
  reqs: PaymentRequirements,
  reason: string,
  payer?: string,
  detail?: string,
  transaction = ""
): Response {
  return json(
    {
      ...paymentRequiredBody(`payment rejected: ${reason}`, [reqs]),
      invalidReason: reason,
      ...(detail ? { detail } : {}),
      ...(transaction ? { transaction, explorer: `${d.explorer}/tx/${transaction}` } : {}),
      settled: false,
    },
    {
      status: 402,
      headers: {
        "x-payment-response": encodeSettlementResponse({
          success: false,
          errorReason: reason,
          transaction,
          network: NETWORK,
          payer: payer ?? "",
          asset: reqs.asset,
          amount: reqs.maxAmountRequired,
          payTo: reqs.payTo,
        }),
      },
    }
  )
}

async function handleAttest(url: URL, req: Request, fixtureIdRaw: string): Promise<Response> {
  const fixtureId = Number(fixtureIdRaw)
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    return json({ error: "bad fixtureId" }, { status: 400 })
  }
  const verifyingContract = resolveEscrow(url)
  if (!verifyingContract) return json({ error: "unknown ?contract= — expected an escrow name or address" }, { status: 400 })

  // Availability BEFORE payment: never demand a fee for something we can't sign.
  const fixture = await fetchFixture(fixtureId).catch(() => null)
  if (!fixture) return json({ error: `unknown fixture ${fixtureId}` }, { status: 404 })
  if (!isAttestable(fixture)) {
    return json(
      {
        error: `fixture ${fixtureId} has no final score yet — nothing to attest`,
        fixture: fixtureView(fixture),
      },
      { status: 409 }
    )
  }

  const resource = `${url.origin}${url.pathname}`
  const reqs = requirements(resource, fixture)

  const header = req.headers.get("x-payment")
  if (!header) {
    return json(paymentRequiredBody("X-PAYMENT header is required", [reqs]), { status: 402 })
  }

  const v = verifyPayment(header, reqs, d.chainId, nonces)
  if (!v.isValid) return rejected(reqs, v.invalidReason, v.payer)

  // Reserve the nonce for the duration of settlement so two copies of the same
  // header can't both reach the chain. Released if settlement fails.
  if (!nonces.claim(reqs.asset, v.authorization)) {
    return rejected(reqs, "invalid_exact_evm_payload_authorization_nonce_used", v.payer)
  }

  let settlement: Awaited<ReturnType<typeof fac.settle>>
  try {
    // Balance is checked against what will actually move (an overpay is allowed
    // by verifyPayment, and transferWithAuthorization moves the full value).
    const pre = await fac.preflight(v.authorization, BigInt(v.authorization.value))
    if (!pre.ok) {
      nonces.release(reqs.asset, v.authorization)
      return rejected(reqs, pre.reason, v.payer, pre.detail)
    }
    settlement = await fac.settle(v.authorization, v.signature)
  } catch (e: any) {
    nonces.release(reqs.asset, v.authorization)
    return rejected(reqs, "settlement_failed", v.payer, String(e?.message ?? e).slice(0, 200))
  }
  if (!settlement.ok) {
    nonces.release(reqs.asset, v.authorization)
    return rejected(reqs, settlement.reason, v.payer, settlement.detail, settlement.transaction)
  }
  nonces.commit(reqs.asset, v.authorization)
  console.log(
    `[attestor] settled ${settlement.amount} ${ASSET_SYMBOL} ${settlement.payer} → ${settlement.recipient}  ${d.explorer}/tx/${settlement.transaction}`
  )

  const a = await attest(
    WALLETS,
    THRESHOLD,
    d.chainId,
    verifyingContract,
    fixture.id,
    fixture.homeGoals!,
    fixture.awayGoals!,
    fixture.tsMs
  )

  // The tokens are already in the recipient's balance at this point — the
  // header carries the hash that moved them.
  const settlementHeader = encodeSettlementResponse({
    success: true,
    transaction: settlement.transaction,
    network: NETWORK,
    payer: settlement.payer,
    asset: reqs.asset,
    amount: settlement.amount,
    payTo: settlement.recipient,
  })

  return json(
    {
      ...a,
      match: { home: fixture.home, away: fixture.away, round: fixture.round, kickoffMs: fixture.kickoffMs },
      outcome: a.homeGoals > a.awayGoals ? 1 : a.homeGoals === a.awayGoals ? 2 : 3,
      outcomeNote: "informational only — Kickpact.sol derives the outcome from the goals on-chain",
      eip712: { primaryType: "Result", types: RESULT_TYPES, domain: resultDomain(d.chainId, verifyingContract) },
      settle: {
        signature: "settle(uint256 poolId,uint8 homeGoals,uint8 awayGoals,uint64 ts,bytes[] signatures)",
        contract: verifyingContract,
        note: "permissionless — any address may submit this for every open pool on the fixture",
      },
      payment: {
        settled: true,
        transaction: settlement.transaction,
        explorer: `${d.explorer}/tx/${settlement.transaction}`,
        payer: settlement.payer,
        recipient: settlement.recipient,
        amount: settlement.amount,
        asset: reqs.asset,
        assetSymbol: ASSET_SYMBOL,
        assetDecimals: 6,
        network: NETWORK,
        chainId: d.chainId,
        scheme: "exact via EIP-3009 transferWithAuthorization",
        settledBy: fac.relayer,
        nonce: v.authorization.nonce,
        balances: {
          payerBefore: settlement.payerBalanceBefore,
          payerAfter: settlement.payerBalanceAfter,
          recipientBefore: settlement.recipientBalanceBefore,
          recipientAfter: settlement.recipientBalanceAfter,
        },
        authorizationState: {
          before: settlement.authorizationStateBefore,
          after: settlement.authorizationStateAfter,
          note: "read from the token contract — the nonce is spent, so this X-PAYMENT header cannot be replayed",
        },
        verified:
          "offline (signature, recipient, amount, window, nonce) + on-chain (balance, authorizationState, confirmed transfer)",
      },
    },
    { headers: { "x-payment-response": settlementHeader } }
  )
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method !== "GET") return json({ error: "method not allowed" }, { status: 405 })

    if (url.pathname === "/") return json(index(url.origin))

    if (url.pathname === "/fixtures") {
      const fixtures = await attestableFixtures().catch(() => [])
      return json({
        network: NETWORK,
        dataSource: usingLiveApi() ? "api-football (live)" : "bundled snapshot (keeper/fixtures.snapshot.json)",
        price: { maxAmountRequired: PRICE, asset: ASSET, payTo: PAY_TO },
        count: fixtures.length,
        fixtures: fixtures.map((f) => ({ ...fixtureView(f), attest: `/attest/${f.id}` })),
      })
    }

    const m = url.pathname.match(/^\/attest\/([^/]+)$/)
    if (m) return handleAttest(url, req, m[1])

    return json({ error: "not found", try: ["/", "/fixtures", "/attest/{fixtureId}"] }, { status: 404 })
  },
})

console.log(`[attestor] http://localhost:${server.port}`)
console.log(`[attestor] price ${PRICE} atomic (${(Number(PRICE) / 1e6).toFixed(6)} ${ASSET_SYMBOL}) of ${ASSET} → ${PAY_TO}`)
console.log(`[attestor] oracle ${THRESHOLD}-of-${SIGNERS.length}, ${WALLETS.length} key(s) loaded → escrow ${DEFAULT_ESCROW}`)
console.log(`[attestor] settling on-chain via EIP-3009 from relayer ${fac.relayer} on ${d.network} (${d.rpc})`)
