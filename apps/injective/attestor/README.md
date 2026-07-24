# Kickpact attestor — an x402-priced oracle feed

An HTTP service that **sells oracle-signed football scores**, priced per request with
[x402](https://github.com/coinbase/x402) (HTTP `402 Payment Required`). Payment is real: the
service is its own facilitator and **settles the buyer's EIP-3009 authorization on Injective
EVM** before it hands over the signatures.

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
`ORACLE_SIGNER_3_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY` or `PRIVATE_KEY`, optional
`APISPORTS_KEY`) and `apps/injective/deployments.json` (token + escrow addresses,
`oracleSigners`, `threshold`). Keys are turned into wallets and never logged.

`RELAYER_PRIVATE_KEY`/`PRIVATE_KEY` is the one key that needs INJ: it pays the gas to submit
each payment. **Buyers need no INJ at all** — that is the point of EIP-3009.

| env                 | default                        | what                                              |
| ------------------- | ------------------------------ | ------------------------------------------------- |
| `PORT`              | `4021`                         | listen port                                       |
| `ATTESTOR_PRICE`    | `10000`                        | price in atomic units (6dp) → 0.01 kUSD           |
| `ATTESTOR_PAY_TO`   | `deployments.oracleSigners[0]` | payment recipient                                 |
| `ATTESTOR_ASSET`    | `deployments.kusd`             | the EIP-3009 token payments are denominated in    |
| `ATTESTOR_NETWORK`  | `injective-testnet`            | x402 network id                                   |
| `RELAYER_PRIVATE_KEY` | `PRIVATE_KEY`                | gas payer for settlement                          |
| `BUYER_PRIVATE_KEY` | —                              | `src/client.ts` only — the demo buyer's wallet     |
| `APISPORTS_KEY`     | —                              | live API-Football; without it the bundled snapshot |

### Why kUSD and not USDC

The price is quoted in **kUSD** (`KUSD.sol`, 6 decimals, EIP-3009 + an open `faucet()`), not
native USDC. Native USDC is deployed on Injective testnet but cannot be minted and there is
no CCTP route to bridge any in, so quoting in USDC would mean either nobody can ever pay or
the service pretends they did. kUSD implements the identical `transferWithAuthorization`
surface, so the settlement path is byte-for-byte the one real USDC would take — point
`ATTESTOR_ASSET` at a USDC the buyer actually holds and nothing else changes.

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
      "asset": "0x52dd70b78993470e05Fc395D2a81F3b9A8B36094",
      "payTo": "0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a",
      "resource": "http://localhost:4021/attest/900303",
      "description": "Oracle-signed final score for World Cup fixture 900303 (Brazil vs Croatia) — 2-of-3 EIP-712 attestation accepted by Kickpact.settle()",
      "mimeType": "application/json",
      "outputSchema": null,
      "maxTimeoutSeconds": 300,
      "extra": { "name": "Kickpact USD", "version": "1" }
    }
  ]
}
```

`extra` is the token's EIP-712 domain — sign against `{ name: "Kickpact USD", version: "1",
chainId: 1439, verifyingContract: asset }` or the server (and the token) will reject you.

**2. Sign an EIP-3009 authorization, retry with `X-PAYMENT` → the service settles it, then 200**

```bash
HDR=$(BUYER_PRIVATE_KEY=0x… bun run src/client.ts 900303 --header-only)
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
  "verifyingContract": "0x4D142990D1114a86b04F56B36D43c38496FE0809",
  "settle": { "signature": "settle(uint256 poolId,uint8 homeGoals,uint8 awayGoals,uint64 ts,bytes[] signatures)" },
  "payment": {
    "settled": true,
    "transaction": "0xab86303c9d990ed660339fc423d9418d00a55aeceb7c8401cdae99599276df17",
    "payer": "0xFedb…690a",
    "recipient": "0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a",
    "amount": "10000",
    "asset": "0x52dd70b78993470e05Fc395D2a81F3b9A8B36094",
    "balances": { "payerBefore": "100000000", "payerAfter": "99990000",
                  "recipientBefore": "0", "recipientAfter": "10000" },
    "authorizationState": { "before": false, "after": true }
  }
}
```

with `X-PAYMENT-RESPONSE: base64({"success":true,"transaction":"0xab8630…","network":"injective-testnet", …})`.

`signatures` are ordered by **recovered signer address ascending** — `settle()` requires
strictly increasing addresses so a duplicate signature is impossible.

**3. Verify before you trust it**

```bash
BUYER_PRIVATE_KEY=0x… bun run src/client.ts 900303
```

The demo buyer runs the whole loop for real: it faucets itself kUSD if it's short, signs the
authorization, gets settled, then reads the chain back.

```
402 → pay 10000 of 0x52dd…6094 to 0x02bA…fc9a (injective-testnet/exact)
before  payer 100.0 (100000000 atomic)   recipient 0.0 (0 atomic)
retry with X-PAYMENT → 200
after   payer 99.99 (99990000 atomic)    recipient 0.01 (10000 atomic)
moved   payer -10000   recipient +10000   tx 0xab86303c…
authorizationState(0xFedb…690a, 0xed0dc75a…) = true
replay same X-PAYMENT → 402 invalid_exact_evm_payload_authorization_nonce_used
  sig[0] → 0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a  inDeployedSet=true  ascending=true
  sig[1] → 0x9c1DFD70EF2f0bE2575db9d112276aD396f9ee35  inDeployedSet=true  ascending=true
OK — payment settled on-chain and settle() would accept this signature set
```

Without `BUYER_PRIVATE_KEY` the client generates a wallet and tells you to fund it — the
faucet call is the one step that costs the buyer gas.

## What's implemented, and what isn't

Payment is **real and on-chain**. Nothing in the paid path is simulated: if you get a 200,
tokens moved, and the response carries the hash that moved them.

**Implemented — offline, before any RPC:**

- `X-PAYMENT` base64 → JSON decode (x402 v1 `PaymentPayload`).
- `x402Version`, `scheme` and `network` must match what the 402 advertised.
- `authorization.to == payTo`, and `value >= maxAmountRequired`.
- Time window: `validAfter <= now < validBefore`.
- **EIP-712 signature recovery** of the EIP-3009 `TransferWithAuthorization` struct against
  the token's domain (`{ name, version }` from `extra`, `chainId`, `verifyingContract: asset`);
  the recovered address must equal `authorization.from`. A tampered signature is rejected
  with `invalid_exact_evm_payload_signature`.
- A nonce is *claimed* for the duration of a request, so two copies of the same header can't
  race each other into settlement.
- Availability is checked *before* the 402, so you're never quoted a price for a fixture
  that has no final score (`409` instead).

**Implemented — on-chain, in `src/facilitator.ts`:**

- **Pre-flight against chain state**, so a doomed payment fails fast instead of burning gas:
  `balanceOf(from) >= value` (→ `402 insufficient_funds`),
  `authorizationState(from, nonce) == false` (→ `402 …nonce_used`), and the *block timestamp*
  inside `(validAfter, validBefore)` — the contract's window is strict at both ends.
- **Settlement.** The service submits `transferWithAuthorization(from, to, value, validAfter,
  validBefore, nonce, signature)` on Injective EVM from its own gas-paying key. It is acting
  as its own x402 facilitator; the buyer spends no gas and never `approve`s anything.
- **Confirmation by state, not by receipt.** Injective's k8s JSON-RPC answers
  `eth_getTransactionReceipt` / `…ByHash` unreliably, so `tx.wait()` is not trusted. The
  service polls the relayer's nonce until it passes the tx's nonce (the `waitMined` pattern
  from `keeper/src/keeper.ts`), then re-reads state: `authorizationState(from, nonce)` must
  be `true` **and** the recipient's `balanceOf` must have risen by `value`. A mined-but-
  reverted tx advances the nonce too, so the state read is what actually decides.
- **The goods are released only after that.** The 200, the signatures and the
  `X-PAYMENT-RESPONSE: {"success":true,"transaction":"0x…"}` all come after confirmation.
  Anything else is a `402` naming the real reason (`insufficient_funds`,
  `settlement_reverted`, `settlement_not_mined`, `settlement_rpc_unavailable`, …).
- Gas is legacy (`gasPrice: 160000000`, explicit `gasLimit`) — Injective EVM rejects ethers'
  EIP-1559 fee fields.

**Honest limits — what this still isn't:**

- **Testnet only, and the asset is kUSD, not USDC** (see *Why kUSD and not USDC* above). The
  faucet is open, so anyone can obtain the money that pays for an attestation — which is what
  makes the demo runnable, and also means the price is not economically meaningful here.
- **No external facilitator.** The service settles for itself rather than POSTing the payload
  to a facilitator's `/verify` + `/settle`. That's the same trust position as running your
  own: the seller pays the gas and is trusted to actually submit.
- **The in-memory nonce set is process-local** and resets on restart. It is only a fast path
  and a concurrency guard — the durable replay guard is the token's own
  `authorizationState`, which the pre-flight reads, so a replayed header is still rejected
  after a restart or from a second instance.
- **No refund path.** If the transfer confirms but generating the attestation then fails, the
  buyer has paid; in practice attestability is checked before the 402 and signing is local,
  so there is no known way to hit that, but there is no compensating transaction either.
- **No price negotiation, no `X-PAYMENT` for the free routes**, and no x402 v2 (`amount` /
  CAIP-2 `network` / `PAYMENT-SIGNATURE` header) — this implements v1 wire shapes, which is
  what current x402 middleware and clients speak.
- Fee accounting is whatever the chain says: there is no ledger, no invoice, no receipt store
  beyond the transaction itself.

## Layout

| file                 | what                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| `src/server.ts`      | `Bun.serve` — routes, 402 quoting, settle-then-release                    |
| `src/x402.ts`        | x402 v1 types, `PaymentRequirements`, offline `verifyPayment`, nonce store |
| `src/facilitator.ts` | pre-flight + on-chain `transferWithAuthorization` + state confirmation    |
| `src/chain.ts`       | provider, legacy gas, receipt-free `waitMined`, revert-reason unwrapping  |
| `src/attest.ts`      | the EIP-712 `Result` domain/types + M-of-N signing, sorted ascending      |
| `src/fixtures.ts`    | API-Football or the keeper's bundled snapshot                             |
| `src/config.ts`      | `.env` + `deployments.json` + ABI loading                                 |
| `src/client.ts`      | demo buyer: faucet → sign EIP-3009 → pay → verify balances, nonce, sigs   |
