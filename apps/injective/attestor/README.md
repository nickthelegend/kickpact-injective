# Kickpact attestor — an x402-priced oracle feed

An HTTP service that **sells oracle-signed football scores**, priced per request with
[x402](https://github.com/coinbase/x402) (HTTP `402 Payment Required`).

What you buy is not a number in a JSON blob — it's the **M-of-N EIP-712 signature set that
`Kickpact.settle()` accepts**. Hand it to the escrow and every open pool on that fixture
settles. The contract re-derives the outcome from the goals itself, so the attestation is
worth exactly what the chain says it's worth and nothing more.

```
GET /                    free   index + price
GET /fixtures            free   which fixtures have a final score right now
GET /attest/{fixtureId}  PAID   402 without X-PAYMENT · 200 + signatures with it
```

## Why an oracle feed is the natural x402 use case

Injective has no on-chain sports-score feed, so Kickpact's escrow trusts a known signer set
to attest raw goals (see the root `CLAUDE.md` — the contract derives home/draw/away itself,
so the signers report facts, not winners). That leaves one open question every oracle has:
**who pays the signers?**

An attestation has the three properties x402 wants:

- **Per-request value.** One signature set settles every pool on one fixture. It's a
  discrete, priceable artifact — not a subscription, not a seat, not an API key.
- **Verifiable delivery.** The buyer can check the goods before trusting the seller:
  `ethers.verifyTypedData` recovers each signature to an address in the escrow's own
  `oracleSigners()`. There's nothing to dispute.
- **Machine buyers.** The natural customer is a bot — a keeper, a settlement relayer, an
  agent watching pools — that has a wallet and no way to sign up for a SaaS plan. Its whole
  interaction is: hit the URL, get a price, pay, settle. That's the x402 loop.

And because `settle()` is permissionless, a paid feed doesn't centralize anything: the
attestor sells signatures, but anybody may submit them, and the 48h `refundExpired` escape
hatch survives the attestor going offline entirely.

## Run it

```bash
cd apps/injective/attestor
bun install
bun run start            # → http://localhost:4021
```

Reads `apps/injective/.env` (`ORACLE_SIGNER_PRIVATE_KEY`, `ORACLE_SIGNER_2_PRIVATE_KEY`,
`ORACLE_SIGNER_3_PRIVATE_KEY`, `USDC_ADDRESS`, optional `APISPORTS_KEY`) and
`apps/injective/deployments.json` (escrow addresses, `oracleSigners`, `threshold`).
Keys are turned into wallets and never logged.

| env                | default                     | what                                                |
| ------------------ | --------------------------- | --------------------------------------------------- |
| `PORT`             | `4021`                      | listen port                                          |
| `ATTESTOR_PRICE`   | `10000`                     | price in atomic units (6dp) → 0.01 USDC              |
| `ATTESTOR_PAY_TO`  | `deployments.oracleSigners[0]` | payment recipient                                 |
| `USDC_ADDRESS`     | `deployments.usdc`          | the ERC-20 payments are denominated in               |
| `ATTESTOR_NETWORK` | `injective-testnet`         | x402 network id                                      |
| `APISPORTS_KEY`    | —                           | live API-Football; without it the bundled snapshot   |

Without an API-Football key the service reads `../keeper/fixtures.snapshot.json` — the very
file the keeper and the mobile app read — so the `fixtureId` you buy an attestation for is
always the `fixtureId` pools were opened on. In the snapshot the quarter-finals are finished
(attestable: `900303`, `900304`, `900305`) and the semis are not.

The signatures bind to an escrow through the EIP-712 `verifyingContract`. Default is the
kUSD escrow; add `?contract=usdc` (or any address) for the USDC one.

## The flow

**1. No payment → 402 with the requirements**

```console
$ curl -si http://localhost:4021/attest/900303
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "injective-testnet",
      "maxAmountRequired": "10000",
      "asset": "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d",
      "payTo": "0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a",
      "resource": "http://localhost:4021/attest/900303",
      "description": "Oracle-signed final score for World Cup fixture 900303 (Brazil vs Croatia) — 2-of-3 EIP-712 attestation accepted by Kickpact.settle()",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 300,
      "extra": { "name": "USDC", "version": "2" }
    }
  ]
}
```

**2. Sign an EIP-3009 authorization, retry with `X-PAYMENT` → 200 + the goods**

```bash
HDR=$(bun run src/client.ts 900303 --header-only)
curl -s -H "X-PAYMENT: $HDR" http://localhost:4021/attest/900303
```

```jsonc
{
  "fixtureId": 900303,
  "homeGoals": 2,
  "awayGoals": 1,
  "ts": 1784923358025,
  "signatures": ["0x03d6ca9b…1c", "0xf60ef38e…1c"],
  "signers": [
    "0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a",
    "0x9c1DFD70EF2f0bE2575db9d112276aD396f9ee35"
  ],
  "threshold": 2,
  "chainId": 1439,
  "verifyingContract": "0x3D288F2eDAa3D47d46DCFd9C6dEe565DdbFb1590",
  "settle": { "signature": "settle(uint256 poolId,uint8 homeGoals,uint8 awayGoals,uint64 ts,bytes[] signatures)" },
  "payment": { "settled": false, "settlementNote": "transferWithAuthorization was NOT submitted — no on-chain settlement is implemented" }
}
```

`signatures` are ordered by **recovered signer address ascending** — `settle()` requires
strictly increasing addresses so a duplicate signature is impossible.

**3. Verify before you trust it**

```bash
bun run src/client.ts 900303      # 402 → sign → 200 → verifyTypedData each signature
```

```
  sig[0] → 0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a  inDeployedSet=true  ascending=true
  sig[1] → 0x9c1DFD70EF2f0bE2575db9d112276aD396f9ee35  inDeployedSet=true  ascending=true
OK — settle() would accept this set
```

## What's implemented, and what isn't

This service prices requests with x402 and honestly verifies a payment **authorization**.
It does **not** move money. Read this section before you point anything real at it.

**Implemented — offline, deterministic, no network:**

- `X-PAYMENT` base64 → JSON decode (x402 v1 `PaymentPayload`).
- `x402Version`, `scheme` and `network` must match what the 402 advertised.
- `authorization.to == payTo`, and `value >= maxAmountRequired`.
- Time window: `validAfter <= now < validBefore`.
- **EIP-712 signature recovery** of the EIP-3009 `TransferWithAuthorization` struct against
  the token's domain (`{ name, version }` from `extra`, `chainId`, `verifyingContract: asset`);
  the recovered address must equal `authorization.from`. A tampered signature is rejected
  with `invalid_exact_evm_payload_signature`.
- **Single-use nonce**: an authorization can be redeemed once (in-process replay set, keyed
  `asset:from:nonce`, pruned at `validBefore`).
- Availability is checked *before* the 402, so you're never quoted a price for a fixture
  that has no final score (`409` instead).

**NOT implemented — do not read this service as proof of payment:**

- **No on-chain settlement.** `transferWithAuthorization` is never submitted. No USDC moves,
  ever. The response's `X-PAYMENT-RESPONSE` says so rather than lying:
  `{"success":false,"errorReason":"settlement_not_implemented","transaction":"", …}`.
- **No facilitator.** There is no call to an x402 facilitator's `/verify` or `/settle`.
- **No chain reads.** No `balanceOf(from)`, no `authorizationState(from, nonce)`, no
  transaction simulation — so a structurally valid, correctly signed authorization from a
  **completely empty wallet is accepted**. In practice the attestation is free to anyone who
  can sign a message.
- **Replay protection is process-memory only.** Restarting the server forgets used nonces;
  a horizontally scaled deployment would not share them.
- No x402 v2 (`amount` / CAIP-2 `network` / `PAYMENT-SIGNATURE` header) — this implements
  v1 wire shapes, which is what current x402 middleware and clients speak.

To make payment real, the missing piece is settlement: submit the signed authorization via
`transferWithAuthorization` from a gas-paying relayer (or hand the payload to a facilitator),
wait for the USDC `Transfer` receipt, and only then release the signatures — plus a
persistent nonce store. The verification code is factored so that step slots into
`verifyPayment`'s caller in `src/server.ts` without changing the wire protocol.

## Layout

| file              | what                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| `src/server.ts`   | `Bun.serve` — routes, 402 quoting, paid attestation                          |
| `src/x402.ts`     | x402 v1 types, `PaymentRequirements` builder, `verifyPayment`, nonce store   |
| `src/attest.ts`   | the EIP-712 `Result` domain/types + M-of-N signing, sorted ascending         |
| `src/fixtures.ts` | API-Football or the keeper's bundled snapshot                                |
| `src/config.ts`   | `.env` + `deployments.json` loading                                          |
| `src/client.ts`   | demo buyer: 402 → sign EIP-3009 → 200 → verify the signatures recover        |
