# CLAUDE.md

Guidance for Claude Code / agents working in this repository.

## Project

**Kickpact** is a self‑custodial, mobile‑first **World Cup prediction app on Injective EVM**. Friends lock the same **kUSD** stake on a match and pick an outcome; the pot is held by an on‑chain **escrow contract** that pays out only what an **oracle‑signed final score proves** — and the contract derives the winning outcome from that score *itself*, so the signer reports facts, not winners. No custodian, no admin key over funds.

Friends gather two ways: **Bluetooth duels** (Google Nearby Connections — discover people around you, chat, pot up in person) and **online duels** (share a duel code; everyone joins the same on‑chain pot from anywhere). The P2P layer never touches the money.

`README.md` + `docs/TECHNICAL.md` are the authoritative product descriptions. `MIGRATION.md` records the Solana→Injective port this repo came from.

## Monorepo layout — every app here is Injective

```
apps/
├── mobile     # ⭐ the app — Expo / React Native (New Arch). Privy embedded EVM
│              #   wallet + keychain burner, API-Football feeds, pools,
│              #   Bluetooth + online duels, oracle-signed receipts.
├── injective  # ⭐ Hardhat: Kickpact.sol + KUSD.sol + keeper bot + tests.
├── dashboard  # ⭐ Next.js market viewer — odds board, pools, receipts explorer,
│              #   browser-side signature verification. (Vercel)
├── landing    # marketing site + download page. (Vercel)
└── desktop    # legacy Electron wrapper (kept, not part of the core product)
```

## The on-chain contracts (`apps/injective/contracts`)

Solidity **0.8.28**, Hardhat, OpenZeppelin, compiled for the **paris** EVM (so the bytecode runs on Injective's EVM regardless of its hardfork level). Deployed to **Injective EVM testnet** (chainId **1439**, RPC `https://k8s.testnet.json-rpc.injective.network/`, Blockscout at `testnet.blockscout.injective.network`). Deployed addresses live in `apps/injective/deployments.json` and are synced into `apps/mobile/src/deployment.json` + `apps/dashboard/src/deployment.json` by the deploy script.

- **`KUSD.sol`** — demo stablecoin, ERC‑20, 6 decimals. Open `faucet(amount)` mints ≤1,000 kUSD/call (testnet).
- **`Kickpact.sol`** — the escrow:
  - `createPool(fixtureId, stake, deadlineMs, kickoffMs, pick)` / `joinPool(poolId, pick)` — equal‑stake escrow; pick is `1=home, 2=draw, 3=away`. `deadlineMs` is the join cutoff; `kickoffMs` anchors settlement finality. Both pull kUSD via `transferFrom`, so the client `approve`s first.
  - `settle(poolId, homeGoals, awayGoals, ts, signature)` — **permissionless**. The caller supplies the fixture's final goals + the oracle's **EIP‑712 signature** over them. The contract verifies `ECDSA.recover(...) == oracleSigner`, checks the result is final (`ts ≥ kickoff + 105m`), then **derives the outcome from the goals on‑chain** (home>away→home, ==→draw, else away). The signature is bound to the *fixture*, so one attestation settles every pool on that match. A lying caller can't forge the signature; the signer can't pick a winner.
  - `claim(poolId)` — winners split the pot; if the settled outcome had no backers, everyone refunds. `refundExpired(poolId)` — self‑serve after a 48h grace if no valid signature ever settled it.

## The oracle / settlement (the trust model)

Injective has **no on‑chain sports‑score feed** (Pyth/Band are price feeds), so the Solana build's CPI into TxLINE's Merkle‑proof oracle has no analogue. Instead a known **`oracleSigner`** attests to the raw final goals via an EIP‑712 signature and the contract derives the outcome. This is an honest weakening vs. a Merkle proof — one trusted signer — mitigated by: (1) it's only trusted to report *facts* (the score), the contract decides the outcome; (2) settlement is permissionless to *submit*; (3) the 48h `refundExpired` escape hatch; (4) it upgrades cleanly to an N‑of‑M signer set. **Say this trade‑off plainly in the pitch. Never add an admin override of funds.**

The EIP‑712 domain is `{ name: "Kickpact", version: "1", chainId: 1439, verifyingContract }` and the type is `Result(uint64 fixtureId,uint8 homeGoals,uint8 awayGoals,uint64 ts)`. The keeper (`apps/injective/keeper`) and the mobile receipt verifier must use these exactly.

## Data layer (API-Football)

Fixtures, live scores and 1X2 odds come from **API‑Football** (`https://v3.football.api-sports.io`, league `1` = FIFA World Cup, season `2026`, header `x-apisports-key`). Set `APISPORTS_KEY` (keeper) / `EXPO_PUBLIC_APISPORTS_KEY` (mobile). **Without a key**, both the app and the keeper fall back to a bundled snapshot (`fixtures.snapshot.json` / `feed-fixtures.json`) whose kickoffs are assigned relative to load time — so there's always something to bet on and something to settle, and **the app and keeper read the same fixtures so `fixtureId`s always agree** (the pool you open and the score that settles it must match).

## Commands

```bash
bun install                                   # root (prettier/turbo/ts only)

cd apps/injective && bun install
cd apps/injective && bunx hardhat compile     # compile the contracts
cd apps/injective && bunx hardhat test        # signed-settlement unit tests (localnet)
cd apps/injective && bun run deploy           # deploy to Injective testnet + sync addresses/ABIs
cd apps/injective && bun run settle:demo      # one pool settling end-to-end on testnet
cd apps/injective/keeper && bun run src/fixtures.ts     # list fixtures
cd apps/injective/keeper && bun run src/keeper.ts       # settle open pools from signed scores
cd apps/injective/keeper && bun run src/keeper.ts --fixture <id> --home <h> --away <a>  # manual

cd apps/mobile && bun run web                 # fast UI loop (burner path)
cd apps/mobile && npx expo prebuild -p android && cd android && ./gradlew assembleRelease
```

Prebuilt APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (`io.kickpact.app`).

Secrets live in `apps/injective/.env` (gitignored): `PRIVATE_KEY` (deployer), `ORACLE_SIGNER_PRIVATE_KEY`/`ORACLE_SIGNER_ADDRESS`, optional `RELAYER_PRIVATE_KEY`, `APISPORTS_KEY`.

## Load-bearing design decisions

- **The contract derives the outcome, not the signer.** `settle` verifies a signature over the raw goals and computes home/draw/away on‑chain. The signer attests facts; the only outcome that can settle a pool is the one the score implies. Never let the signer pass an outcome directly, and never add an admin override.
- **Self‑custodial, always.** Privy embedded EVM wallet (`@privy-io/expo`, `useEmbeddedEthereumWallet`) is the primary path; a keychain burner (`ethers.Wallet` in `expo-secure-store`) is the fallback and the default when Privy isn't configured. The web preview runs on the burner path.
- **P2P is Bluetooth, and it never touches the money.** `expo-nearby-connections` (P2P_CLUSTER mesh) carries chat + the duel invite; the pot is always an on‑chain pool.
- **One pool primitive.** Bluetooth duels, online duels, and match pools are all the same `Pool` — don't fork the money flow per surface.
- **Duel join windows run late.** `duelDeadlineMs` = kickoff+75m so friends can pot up around the match; finality still keys off kickoff.

## Native build gotchas (apps/mobile)

- **New Architecture is on** and required (nitro modules; Nearby needs `react-native-nitro-modules`).
- **ethers v6** is the chain client. It needs `crypto.getRandomValues` — provided by `react-native-get-random-values` in `polyfill.js` (must be the first import). No native OpenSSL needed.
- `expo-nearby-connections@1.1.0` ships a broken `android/build.gradle`; `scripts/patch-nearby.mjs` fixes it, wired as `postinstall`.
- Privy + Nearby are **native‑only**: guarded so the web preview still runs on the burner path. A real Bluetooth handshake needs **two physical devices** — emulators have no BT radio. To use Privy, its dashboard must have **Injective testnet (1439)** configured and the build's package id / scheme allowlisted; set `EXPO_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_CLIENT_ID`.

## Code style

Bun workspaces + Turborepo. Prettier: no semicolons, double quotes, 2‑space, trailing comma `es5`. TypeScript `strict`. Solidity via Hardhat. Prefer `bun` over npm/pnpm/yarn.
