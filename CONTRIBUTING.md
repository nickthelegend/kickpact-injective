# Contributing to Kickpact

Developer setup, local commands, and conventions. For the product overview and
what Kickpact *is*, see [`README.md`](README.md).

Kickpact is a World Cup prediction app on **Injective EVM**: friends stake equal
kUSD into an on-chain pool and pick an outcome, and the pot can only pay out what
an **oracle-signed final score** implies — the `Kickpact` escrow verifies the
EIP-712 signature and **derives the winner from the goals on-chain**.

> This repo is the **Injective port** of Kickpact (originally a Solana/TxLINE
> build). The Solana→Injective migration is recorded in
> [`MIGRATION.md`](MIGRATION.md); nothing in the current codebase runs on Solana.

## Layout

```
apps/
├── mobile     # Expo / React Native (New Arch) — the app
├── injective  # Hardhat — Kickpact.sol + KUSD.sol, tests, keeper, deploy scripts
├── dashboard  # Next.js market viewer (Vercel)
├── landing    # marketing site (Vercel)
└── desktop    # legacy Electron wrapper (kept, not core)
```

## Prerequisites

[Bun](https://bun.sh) ≥ 1.3, Node, and — for the app — Android Studio / SDK.
Contracts use [Hardhat](https://hardhat.org) + [ethers](https://docs.ethers.org)
v6 (installed via `bun install`). To deploy, fund an Injective testnet wallet
from the [faucet](https://testnet.faucet.injective.network).

```bash
bun install     # all workspaces; also runs the expo-nearby-connections patch
```

## The contracts

```bash
cd apps/injective && bun install
bunx hardhat compile
bunx hardhat test        # signed-settlement lifecycle: forged signer + non-final ts
                         # rejected, outcome derived from goals, payouts + refunds
bun run deploy           # → Injective testnet (1439), syncs addresses + ABIs to the apps
bun run settle:demo      # faucet → open pool → sign → settle → claim, end-to-end on testnet
```

Contract secrets go in `apps/injective/.env` (copy `.env.example`): `PRIVATE_KEY`
(deployer/relayer), `ORACLE_SIGNER_PRIVATE_KEY` / `ORACLE_SIGNER_ADDRESS`, optional
`RELAYER_PRIVATE_KEY` and `APISPORTS_KEY`.

## The app

```bash
cd apps/mobile
bun run web                                 # fast UI loop (burner wallet only)
npx expo prebuild -p android
cd android && ./gradlew assembleRelease     # APK
```

Privy and Bluetooth are **native-only** — the web target runs the burner path and
stubs both, so the preview never crashes. A real Bluetooth handshake needs two
physical devices; emulators have no radio.

## Live data + auto-settlement

```bash
cd apps/injective/keeper
bun run src/fixtures.ts          # list World Cup fixtures (live API-Football or snapshot)
bun run src/keeper.ts            # sign final scores → relay settle for open pools (add --watch)
```

## House rules

- **Never add a way to settle a pool that isn't the signed score.** `settle`
  derives the winning side from the raw goals on-chain and only accepts a
  signature that recovers to `oracleSigner`. No admin override, no result setter,
  no letting the signer pass an outcome directly — that property **is** the product.
- **Be honest about the trust model.** The single `oracleSigner` is a deliberate
  weakening vs. an on-chain proof; keep the mitigations (permissionless submit,
  on-chain derivation, 48h `refundExpired`) and the upgrade path to N-of-M intact,
  and say so plainly. Never add an admin key over funds.
- **One pool primitive.** Bluetooth duels, online duels, and match pools are all the
  same `Pool`. Don't fork the money flow per surface.
- **Self-custodial.** Privy embedded EVM wallet first, keychain burner as fallback.
  Nothing custodies funds.
- **P2P never touches money.** Nearby carries chat and the duel invite, nothing else.
- **The EIP-712 domain + `Result` type must match across contract, keeper, and app.**
  Sign the `ts` in epoch **milliseconds** (`block.timestamp * 1000` on-chain), or the
  signature/finality check fails silently.

## Gotchas worth knowing

- **Compile for `paris`** (`hardhat.config.ts`) — OpenZeppelin 5.x targets Cancun
  (`mcopy`/transient storage), whose bytecode may not run on Injective's EVM.
- **Pin the gas price** — every write sets `gasPrice: 160_000_000n`; auto-estimation
  doesn't behave on the testnet.
- **Pin the ethers network** — `new JsonRpcProvider(rpc, 1439, { staticNetwork: true })`,
  else ethers re-probes `eth_chainId` on the non-standard chain.
- **Blockscout, not Etherscan** — the toolbox's `etherscan` config uses a dummy
  `apiKey: "nil"` + `customChains`, with sourcify disabled. `bun run verify`.
- **No `react-native-quick-crypto`** — its OpenSSL isn't packaged and crashes at
  startup; `polyfill.js` gives ethers `crypto.getRandomValues` via
  `react-native-get-random-values` instead.
- `expo-nearby-connections@1.1.0` ships a broken `android/build.gradle`; patched
  idempotently by `apps/mobile/scripts/patch-nearby.mjs` on postinstall.

More in [`CLAUDE.md`](CLAUDE.md), [`docs/TECHNICAL.md`](docs/TECHNICAL.md), and
[`docs/FEEDBACK.md`](docs/FEEDBACK.md).

## Style

Bun workspaces + Turborepo. Prettier: no semicolons, double quotes, 2-space,
trailing comma `es5`. TypeScript `strict`. Solidity via Hardhat. Prefer `bun`
over npm/pnpm/yarn.
