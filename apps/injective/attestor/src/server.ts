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
 * PAYMENT VERIFICATION IS PARTIAL BY DESIGN — see the scope banner in
 * src/x402.ts and the README. The X-PAYMENT authorization is validated
 * structurally and cryptographically (EIP-712 recovery, recipient, amount,
 * time window, single-use nonce), but it is NEVER submitted on-chain: no
 * facilitator, no transferWithAuthorization, no balance check. No USDC moves.
 */
import { ethers } from "ethers"
import { deployedSigners, deployments, escrows, loadEnv } from "./config.ts"
import { attest, oracleWallets, RESULT_TYPES, resultDomain, thresholdOf } from "./attest.ts"
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
/** Atomic units of a 6-decimal token. 10000 = 0.01 USDC. */
const PRICE = process.env.ATTESTOR_PRICE || "10000"
const MAX_TIMEOUT_SECONDS = Number(process.env.ATTESTOR_MAX_TIMEOUT || 300)
/** The token payments are denominated in — native USDC on Injective EVM. */
const ASSET = process.env.USDC_ADDRESS || d.usdc || ""
/** EIP-3009 domain of that token; advertised in `extra` so payers sign what we check. */
const ASSET_NAME = process.env.USDC_EIP712_NAME || "USDC"
const ASSET_VERSION = process.env.USDC_EIP712_VERSION || "2"

const SIGNERS = deployedSigners(d)
const THRESHOLD = thresholdOf(d)
const WALLETS = oracleWallets(d)
/** Fees go to the oracle. Never a private key — an address, from the deployed set. */
const PAY_TO = process.env.ATTESTOR_PAY_TO || SIGNERS[0] || ""
const ESCROWS = escrows(d)
const DEFAULT_ESCROW = d.kickpact

const nonces = new NonceStore()

if (!ASSET) throw new Error("no payment asset — set USDC_ADDRESS in apps/injective/.env")
if (!PAY_TO) throw new Error("no payTo address — set ATTESTOR_PAY_TO or deploy with oracleSigners")
if (!DEFAULT_ESCROW) throw new Error("deployments.json has no kickpact address — deploy first")
if (WALLETS.length < THRESHOLD) {
  throw new Error(
    `need ${THRESHOLD} of the deployed oracle keys in .env (ORACLE_SIGNER_PRIVATE_KEY, ORACLE_SIGNER_2_PRIVATE_KEY, …); ${WALLETS.length} usable`
  )
}

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
      humanReadable: `${(Number(PRICE) / 1e6).toFixed(6)} USDC per attestation`,
      asset: ASSET,
      assetDecimals: 6,
      network: NETWORK,
      payTo: PAY_TO,
      scheme: "exact",
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
        "single-use nonce (in-memory, resets on restart)",
      ],
      notImplemented: [
        "on-chain settlement — transferWithAuthorization is never submitted, no USDC moves",
        "facilitator /verify or /settle",
        "balanceOf(from) / authorizationState(from, nonce) / transaction simulation",
      ],
      note: "A structurally valid authorization from an empty wallet is accepted. Demo service — treat the attestation as free.",
    },
    example: `curl -i ${origin}/attest/${900303}`,
  }
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
  if (!v.isValid) {
    return json(
      { ...paymentRequiredBody(`payment rejected: ${v.invalidReason}`, [reqs]), invalidReason: v.invalidReason },
      {
        status: 402,
        headers: {
          "x-payment-response": encodeSettlementResponse({
            success: false,
            errorReason: v.invalidReason,
            transaction: "",
            network: NETWORK,
            payer: v.payer ?? "",
          }),
        },
      }
    )
  }
  nonces.remember(reqs.asset, v.authorization)

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

  // The authorization was verified offline but never submitted, so settlement
  // did NOT happen: report that truthfully rather than claiming success.
  const settlement = encodeSettlementResponse({
    success: false,
    errorReason: "settlement_not_implemented",
    transaction: "",
    network: NETWORK,
    payer: v.payer,
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
        payer: v.payer,
        amount: v.authorization.value,
        asset: reqs.asset,
        network: NETWORK,
        verified: "offline: signature, recipient, amount, time window, nonce",
        settled: false,
        settlementNote: "transferWithAuthorization was NOT submitted — no on-chain settlement is implemented",
      },
    },
    { headers: { "x-payment-response": settlement } }
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
console.log(`[attestor] price ${PRICE} atomic (${(Number(PRICE) / 1e6).toFixed(6)}) of ${ASSET} → ${PAY_TO}`)
console.log(`[attestor] oracle ${THRESHOLD}-of-${SIGNERS.length}, ${WALLETS.length} key(s) loaded → escrow ${DEFAULT_ESCROW}`)
console.log(`[attestor] payments are validated OFFLINE only — no on-chain settlement`)
