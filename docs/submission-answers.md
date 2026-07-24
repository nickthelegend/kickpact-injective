# Submission answers — Injective

## One-liner

> **Kickpact — bets that settle themselves.** Self-custodial World Cup prediction pools on Injective EVM: friends escrow kUSD and pick an outcome, and the pool can only settle to the result an oracle-signed final score implies — the contract verifies the signature and **derives the winner from the goals on-chain**, so the signer reports facts, never winners. Winners split the pot; every settlement leaves a receipt you can re-verify from your phone or browser.

## What it is

A mobile-first, self-custodial group-betting app. Friends lock the **same** kUSD stake on a World Cup fixture, each pick home/draw/away, and the pot is held by one on-chain escrow (`Kickpact.sol`). Friends gather two ways — **Bluetooth duels** (Google Nearby Connections, in person) and **online duels** (share a pool-id code) — but both fund the identical on-chain pool; the peer-to-peer layer never touches the money. After full time, anyone submits the final goals plus the oracle's signature, the contract settles, and winners claim self-serve.

## What's novel

- **The escrow decides the winner, not a resolver.** `settle` takes only raw goals + an EIP-712 signature; the outcome is computed inside the contract (`home > away ? home : (== ? draw : away)`). No admin can name a result, and the signed attestation is bound to the *fixture*, so one signature settles every pool on that match at once.
- **Verify-your-own-receipt.** The app and dashboard pull the settlement event + `settle` calldata and re-run `verifyTypedData` locally, recovering the signer on-device — you watch the oracle's signature check out yourself.
- **One pool primitive across three surfaces.** In-person Bluetooth duels, remote code duels, and plain match pools are all the same `Pool`; the money flow isn't forked per surface.

## The trust model, and its honest limits

Injective has **no on-chain sports-score feed** (Pyth/Band are price oracles), so — unlike the original Solana build, which settled trustlessly by verifying a TxLINE Merkle proof on-chain — there is no scoreboard to prove a result against. Kickpact instead trusts a known **`oracleSigner`** to sign the raw final goals, and the contract derives the outcome from them.

This is a deliberate, clearly-stated **weakening**: one trusted signer for the *fact* of the score. We bound it: the signer reports facts (not winners), it holds no funds and needs no gas, settlement submission is permissionless, an outcome nobody backed refunds everyone, and a 48-hour `refundExpired` grace returns funds if the signer ever goes silent. It upgrades cleanly to an N-of-M signer set — the contract already separates attesting the score from deciding the outcome. We say this plainly rather than dress a single signer up as trustless.

## Tech stack

- **Contracts**: Solidity 0.8.28, Hardhat, OpenZeppelin (`EIP712`/`ECDSA`/`SafeERC20`/`ReentrancyGuard`), compiled for **paris**; `Kickpact` escrow + `KUSD` (ERC-20, 6dp, open faucet).
- **Chain**: Injective EVM testnet — chainId **1439**, RPC `https://k8s.testnet.json-rpc.injective.network/`, explorer [Blockscout](https://testnet.blockscout.injective.network).
- **Settlement**: EIP-712 `Result(uint64 fixtureId,uint8 homeGoals,uint8 awayGoals,uint64 ts)`; keeper split into an offline **oracle** signer and a gas-paying **relayer**.
- **Data**: API-Football (World Cup fixtures/scores/1X2 odds) with a bundled snapshot fallback so the demo is always populated.
- **App**: Expo / React Native (New Architecture), **ethers v6**, Privy embedded EVM wallet + keychain burner; Bluetooth duels over `expo-nearby-connections`.
- **Dashboard**: Next.js market viewer (odds board, pool volumes, verifiable receipts) on Vercel.

## Links

| | |
| --- | --- |
| Public repo | *(this repository)* |
| Contracts (Injective testnet 1439) | addresses written to [`apps/injective/deployments.json`](../apps/injective/deployments.json) by `bun run deploy`; oracle signer `0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a` |
| End-to-end settlement on testnet | `bun run settle:demo` — faucet → open pool → sign → settle → claim; the settle tx is a [Blockscout](https://testnet.blockscout.injective.network) link |
| Dashboard (odds + verifiable receipts) | Next.js in [`apps/dashboard`](../apps/dashboard) (Vercel) |
| Android APK | build via `expo prebuild -p android` → `app-release.apk` (`io.kickpact.app`), attached to the GitHub release |
| Technical documentation | [docs/TECHNICAL.md](TECHNICAL.md) |
| Injective builder feedback | [docs/FEEDBACK.md](FEEDBACK.md) |
| Demo video | *record + upload unlisted, paste link here* |

## Team

nickthelegend (+ Claude as AI pair). Individual submission.

## Demo video — beats

Every beat is a real capture: the APK on-device against Injective testnet, the `hardhat test` output, and the live dashboard.

1. **Cold open (15s)** — "Group bets die arguing about results. A Kickpact pool can only pay out what the final score says."
2. **Wallet + data (45s)** — sign in with Privy (or create a burner), the fixtures/odds board from API-Football, mint kUSD from the faucet.
3. **Pool flow (60s)** — open a pool on a fixture, a second wallet joins, the escrow balance shown on Blockscout.
4. **The settle moment (90s)** — keeper spots full time → signs the final goals with the oracle key → relays `settle` → show the contract deriving the outcome on-chain, and `hardhat test` rejecting a forged signer and a non-final timestamp.
5. **Receipts (45s)** — the receipt screen: goals, signer, tx → press **VERIFY** → the signature recovers to the oracle live, on the phone and in the browser.
6. **Close (15s)** — dashboard totals, repo, "goal-line technology for your bets" — plus the honest one-liner on the single-signer trade-off and the 48h refund safety valve.
