# Kickpact — bets that settle themselves, on Injective

> A self-custodial **World Cup prediction app**. Friends stake the same **kUSD** into an on-chain pool and pick an outcome — then nobody argues about the result: the pool **settles itself** the moment an oracle-signed final score is submitted. The escrow **verifies the signature and derives the winner from the goals on-chain** — the signer reports facts, the contract decides. Winners split the pot. Every settlement leaves a **receipt you can re-verify from your phone or browser**.

<p>
  <img alt="Injective EVM" src="https://img.shields.io/badge/chain-Injective_EVM_testnet_·_1439-0ee7b7?style=flat-square" />
  <img alt="Contracts" src="https://img.shields.io/badge/contracts-Solidity_·_Hardhat_·_OpenZeppelin-627EEA?style=flat-square" />
  <img alt="Data" src="https://img.shields.io/badge/data-API--Football_·_snapshot_fallback-e8b84b?style=flat-square" />
  <img alt="Expo RN" src="https://img.shields.io/badge/app-Expo_·_React_Native-8aa0f5?style=flat-square" />
</p>

> 🛠️ This repo is the **Injective EVM port** of Kickpact (originally a Solana/TxLINE build). [`MIGRATION.md`](MIGRATION.md) records where it came from and why the settlement design changed.

---

## Deployed on Injective EVM testnet

Live and **verified on Blockscout** — click a contract to read its source on-chain. Network: **Injective EVM testnet** · chainId **1439** · RPC `https://k8s.testnet.json-rpc.injective.network/` · explorer [Blockscout](https://testnet.blockscout.injective.network).

| What | Address | Explorer |
| --- | --- | --- |
| **Kickpact** — escrow + signed-score settlement | `0x528c3314FbE745e7111a797B6e104408C1d62DB5` | [verified code ↗](https://testnet.blockscout.injective.network/address/0x528c3314FbE745e7111a797B6e104408C1d62DB5?tab=contract) |
| **KUSD** — kUSD ERC-20 (6 dp, open faucet) | `0x5761A411F5B07160328a71263F71c0EB3Ad17557` | [verified code ↗](https://testnet.blockscout.injective.network/address/0x5761A411F5B07160328a71263F71c0EB3Ad17557?tab=contract) |
| **Oracle signer** — attests final scores (EIP-712) | `0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a` | [account ↗](https://testnet.blockscout.injective.network/address/0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a) |
| **Deployer** | `0xFedb9938BDeFdD91Ae52a4a93746Fc32B77E690a` | [account ↗](https://testnet.blockscout.injective.network/address/0xFedb9938BDeFdD91Ae52a4a93746Fc32B77E690a) |

Need testnet INJ for gas? [testnet.faucet.injective.network](https://testnet.faucet.injective.network/). All addresses are also machine-readable in [`apps/injective/deployments.json`](apps/injective/deployments.json).

---

## Why this exists

Betting with friends is either custodial (a bookie holds your money) or pure trust ("you never paid me"). And even trustless escrow has an oracle problem: *who says who won?*

Kickpact's answer is an escrow that **can't invent a result and can't be argued with**. It only settles to the outcome that a signed final score implies — and it computes that outcome *itself*, from the raw goals, so no one — not the keeper, not the signer, not us — ever gets to name a winner.

```
   friends stake kUSD             match ends              anyone submits the signed score
  ┌─────────────────────┐   ┌────────────────────┐   ┌───────────────────────────────────────┐
  │ createPool / join   │ → │ oracle signs the   │ → │ settle(poolId, home, away, ts, sig)   │
  │ (escrow in Kickpact)│   │ final goals (712)  │   │  → recover(sig) == oracleSigner  ✓     │
  └─────────────────────┘   └────────────────────┘   │  → outcome derived on-chain from goals │
                                                      │  → winners claim, else self-serve      │
                                                      └───────────────────────────────────────┘
```

The settle caller is **untrusted by design**: they can't forge the oracle's signature, and even the oracle can only attest a *score* — the contract turns goals into home/draw/away with `homeGoals > awayGoals ? home : (== ? draw : away)`. A lying keeper simply fails. We [prove the whole lifecycle in the tests](apps/injective/test/kickpact.test.ts): a forged signer is rejected, a non-final timestamp is rejected, and the true score settles every pool on the fixture at once.

### The honest part of the trust model

On Solana, Kickpact settled via a CPI into TxLINE's Merkle-proof oracle — the match data was itself anchored on-chain, so *nobody* was trusted. **Injective has no on-chain sports-score feed** (Pyth and Band there are price oracles, not scoreboards). So the "the data decides, not an admin" property is rebuilt from a different root: a known **`oracleSigner`** signs the raw final goals, and the contract derives the outcome.

This is a deliberate, clearly-stated **weakening** vs. the Merkle proof — it reintroduces one trusted signer. We think it's the right pragmatic trade-off, and we bound it tightly:

1. **The signer reports facts, not winners.** It signs `(fixtureId, homeGoals, awayGoals, ts)`. The winning side is computed on-chain. It cannot settle a pool to a result the score doesn't support.
2. **Submission is permissionless.** Any wallet can relay the signed score. The signer never touches the pot and never needs gas.
3. **No funds are ever stranded or admin-controlled.** If the settled outcome had no backers, everyone refunds. If no valid signature ever arrives, a **48-hour grace** opens self-serve `refundExpired`. There is no admin key over funds.
4. **It upgrades cleanly.** The single `oracleSigner` becomes an N-of-M signer set (or a future on-chain feed) without changing the money flow — `settle` already separates *attesting the score* from *deciding the outcome*.

## What's here

| Piece | Where | Notes |
| --- | --- | --- |
| **`Kickpact.sol`** — the escrow: pools, equal-stake join, EIP-712 signed settlement, claim, `refundExpired` | [`apps/injective/contracts/Kickpact.sol`](apps/injective/contracts/Kickpact.sol) | Solidity 0.8.28, OZ, compiled for **paris** so the bytecode runs on Injective's EVM |
| **`KUSD.sol`** — the demo dollar pools stake in: ERC-20, 6 decimals, open faucet (≤1,000/call) | [`apps/injective/contracts/KUSD.sol`](apps/injective/contracts/KUSD.sol) | testnet stand-in for USDC |
| **Mobile app** — Expo RN: Privy embedded EVM wallet + keychain burner, API-Football fixtures/scores/odds, pools, **Bluetooth + online duels**, re-verifiable receipts | [`apps/mobile`](apps/mobile) | build → `app-release.apk` (`io.kickpact.app`) |
| **Settle-keeper** — signs a fixture's final goals with the oracle key, relays `settle` for every open pool with a separate relayer key | [`apps/injective/keeper`](apps/injective/keeper/src/keeper.ts) | attest ≠ relay; watch mode sweeps every 30s |
| **Market-viewer dashboard** — odds board, on-chain pool volumes, receipts explorer with **browser-side signature re-verification** | [`apps/dashboard`](apps/dashboard) | Next.js (Vercel) |
| **End-to-end proof on testnet** — faucet → open pool → sign → settle → claim, in one script | [`apps/injective/scripts/settle-demo.ts`](apps/injective/scripts/settle-demo.ts) | `bun run settle:demo` |

Deployed addresses are written to [`apps/injective/deployments.json`](apps/injective/deployments.json) by the deploy script and synced into the app + dashboard. Chain: **Injective EVM testnet**, chainId **1439**, RPC `https://k8s.testnet.json-rpc.injective.network/`, explorer **[Blockscout](https://testnet.blockscout.injective.network)**. The oracle signer is `0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a`.

## The trust model (what makes it interesting)

1. **The contract can't be sweet-talked.** `settle(poolId, homeGoals, awayGoals, ts, signature)` requires the result to be final (`ts ≥ kickoff + 105 min`), recovers the EIP-712 signature and checks it equals `oracleSigner`, then **builds the outcome from the goals on-chain**. Nothing about the caller is trusted.
2. **One signature, every pool.** The attestation is bound to the *fixture*, not the pool — one signed score settles every pool on that match, and anyone can relay it.
3. **No winner? Everyone refunds.** And if no signature ever arrives, a 48-hour grace unlocks self-serve refunds. Funds are never stranded, never admin-controlled.
4. **Receipts re-verify anywhere.** The app and dashboard pull the `PoolSettled` event and the `settle` calldata, then re-run `verifyTypedData` in the client — you watch the signature recover to the oracle live, on your own device.

## Run it

```bash
bun install                                   # workspaces (Bun ≥ 1.3)

# contracts — compile, unit-test the signed-settlement lifecycle, deploy, prove end-to-end
cd apps/injective && bun install
bunx hardhat compile
bunx hardhat test                             # forged signer / non-final ts / outcome-from-goals / refunds
bun run deploy                                # → Injective testnet, syncs addresses + ABIs to the apps
bun run settle:demo                           # one pool settling end-to-end on testnet

# keeper (auto-settlement)
cd apps/injective/keeper && bun run src/fixtures.ts     # list fixtures
bun run src/keeper.ts                                   # settle open pools from signed scores (add --watch)

# mobile (Expo web preview or Android)
cd apps/mobile && bun install && bun run web            # fast UI loop (burner path)
npx expo prebuild -p android && cd android && ./gradlew assembleRelease

# dashboard
cd apps/dashboard && bun install && bun run dev         # http://localhost:3070
```

Set `APISPORTS_KEY` (keeper) / `EXPO_PUBLIC_APISPORTS_KEY` (mobile) for live [API-Football](https://dashboard.api-football.com/register) data. **Without a key, everything still works** — the app and keeper both fall back to a bundled World Cup snapshot whose kickoffs are anchored to load time, so there's always something to bet on and something to settle. Contract secrets live in `apps/injective/.env` — see [`docs/TECHNICAL.md`](docs/TECHNICAL.md).

## Monorepo map

```
apps/
├── mobile      # ⭐ Expo RN app — wallet (Privy + burner), API-Football data, pools,
│               #   Bluetooth + online duels, receipts. Also targets web.
├── injective   # ⭐ Hardhat — Kickpact.sol + KUSD.sol, tests, keeper, deploy/settle scripts
├── dashboard   # ⭐ Next.js market viewer + verifiable receipts (Vercel)
├── landing     #   marketing site (Vercel)
└── desktop     #   legacy Electron wrapper — kept, not part of the core product
```

Every app here targets Injective EVM. This repo is a fresh port; the pre-port Solana/TxLINE build is documented only in [`MIGRATION.md`](MIGRATION.md).

## The stack

- **Data**: [API-Football](https://v3.football.api-sports.io) — World Cup fixtures, live scores, 1X2 odds (league `1`, season `2026`); bundled snapshot fallback so the demo is always populated
- **Chain**: Injective EVM testnet (chainId 1439) — `Kickpact` escrow + `KUSD`, read/written with **ethers v6**
- **Settlement**: an off-chain `oracleSigner` signs `Result(fixtureId, homeGoals, awayGoals, ts)` (EIP-712); the contract verifies and derives the outcome on-chain
- **App**: Expo / React Native (New Architecture) — **Privy** embedded EVM wallet + keychain burner; proximity duels over Google Nearby Connections (`expo-nearby-connections`), which never touch the money
- **kUSD**: a 6-dp ERC-20 demo-dollar with an open faucet (testnet stand-in for USDC)

---

*A self-custodial group-betting app on Injective EVM — goal-line technology for your bets.*
