# Kickpact — technical documentation (Injective EVM)

## Core idea

Group prediction pools on **Injective EVM** whose settlement can only ever be the outcome an **oracle-signed final score** implies. Friends escrow equal kUSD stakes on a World Cup fixture and pick home/draw/away; after full time **anyone** submits the fixture's final goals together with the oracle's EIP-712 signature over them, and the `Kickpact` contract verifies the signature, confirms finality, and **derives the outcome from the goals on-chain**. Winners split the pot self-serve. No custodian, no admin key over funds — the keeper is a *courier + notary*, not an *authority*.

There is no on-chain sports-score feed on Injective (Pyth/Band there are price oracles), so unlike the original Solana build there is no Merkle-proof oracle to CPI into. The trust root is instead a single known signer that attests *facts* (the score); the contract alone turns facts into winners. This is an honest weakening — see [Trust model](#trust-model-and-its-honest-limits).

## Architecture

```
┌──────────────┐   REST         ┌──────────────────────────┐
│ API-Football │ ──────────────▶│ mobile app (Expo RN)     │─┐
│  fixtures    │  (or bundled   │ dashboard (Next.js)      │ │ txs: createPool / join / claim
│  scores      │   snapshot)    │ keeper (bun)             │ │
│  odds        │                └──────────────────────────┘ ▼
└──────┬───────┘                        │ settle(poolId, home, away, ts, sig)
       │                                ▼
       │ final goals            ┌──────────────────────────┐
       └───────────────────────▶│ Injective EVM testnet    │
         (oracle signs, EIP-712)│  1439 · Blockscout       │
                                 │  Kickpact.sol  KUSD.sol  │
                                 └──────────────────────────┘
```

The keeper reads the same match data the app does, so `fixtureId`s always agree (the pool you open and the score that settles it must reference the same fixture).

## On-chain — `apps/injective/contracts`

Solidity **0.8.28**, Hardhat, OpenZeppelin 5.x, compiled with `evmVersion: "paris"` so the bytecode carries no PUSH0 / `mcopy` / transient-storage opcodes and runs on Injective's EVM regardless of its hardfork level.

### `KUSD.sol`

A demo stablecoin — the kUSD pools are staked in. ERC-20, **6 decimals** (matching the old Solana kUSD SPL mint). Open faucet, testnet only:

- `faucet(amount)` — mints up to `FAUCET_CAP` (1,000 kUSD) to the caller, no auth; reverts `FaucetCap` outside `(0, 1000]`.

### `Kickpact.sol`

The escrow. `EIP712("Kickpact", "1")` + `ReentrancyGuard`, holding every pool in one contract. Outcome encoding is shared with every Kickpact build: **1 = home, 2 = draw, 3 = away**.

```solidity
struct Pool {
  uint256 id; uint64 fixtureId; address creator; uint256 stake;
  uint64 deadlineMs;   // join cutoff
  uint64 kickoffMs;    // anchors settlement finality
  uint32[3] pickCounts; // [home, draw, away]
  uint32 memberCount; bool settled; uint8 result; uint32 winners;
}
struct Member { uint8 pick; bool joined; bool claimed; }
```

- `createPool(fixtureId, stake, deadlineMs, kickoffMs, pick)` — opens a pool and records the creator's pick. Reverts on zero stake, `pick ∉ {1,2,3}`, or a deadline already past. Pulls the stake via `safeTransferFrom`, so the caller must `approve` kUSD first. Returns the new `poolId` and emits `PoolCreated`.
- `joinPool(poolId, pick)` — equal stake, before `deadlineMs`, one membership per address. Pulls the same stake in.
- `settle(poolId, homeGoals, awayGoals, ts, signature)` — **permissionless**. In order: require the pool exists and is unsettled; require finality (`ts ≥ kickoffMs + FULL_TIME_MS`, `FULL_TIME_MS = 105 min`); recover the EIP-712 signature over the goals and require it equals `oracleSigner`; **derive** `outcome = homeGoals > awayGoals ? 1 : (homeGoals == awayGoals ? 2 : 3)`; store the result and `winners = pickCounts[outcome-1]`; emit `PoolSettled(poolId, fixtureId, result, winners, homeGoals, awayGoals)`.
- `claim(poolId)` — after settlement: if `winners == 0` (nobody backed the actual outcome) every member refunds their stake; otherwise only winners, each taking `stake × memberCount / winners`. One claim per member.
- `refundExpired(poolId)` — if no valid signature settled the pool within `REFUND_GRACE_MS` (48h) after kickoff, members reclaim their stakes permissionlessly.

The oracle attestation type is:

```
Result(uint64 fixtureId,uint8 homeGoals,uint8 awayGoals,uint64 ts)
```

signed under domain `{ name: "Kickpact", version: "1", chainId: 1439, verifyingContract }`. The keeper, the mobile receipt verifier, and the demo script all reproduce this domain + type **exactly** — any drift and `ECDSA.recover` returns the wrong address and settlement reverts `BadSignature`.

> **Units.** `deadlineMs` / `kickoffMs` / `ts` are epoch **milliseconds**, while `block.timestamp` is seconds — the contract bridges them with `_nowMs() = block.timestamp * 1000`. Sign the `ts` in ms.

### Tests — `apps/injective/test/kickpact.test.ts`

`bunx hardhat test` runs the full lifecycle on the local Hardhat network (chainId 31337) against a fresh random oracle wallet. It asserts the properties that matter:

- **outcome is derived, not dictated** — a 2–1 signed score yields result `1` (home), 1–1 yields `2` (draw), 0–2 yields `3` (away); the signer only ever provides goals.
- **a forged signer is rejected** (`BadSignature`) and **a non-final `ts` is rejected** (`NotFinal`) — and finality is checked *before* the signature, so an early submission can't even probe the signer.
- **one signature settles every pool on the same fixture.**
- **payouts + refunds** — winners split the whole pot, losers and double-claims revert, an outcome nobody picked refunds everyone, and `refundExpired` opens only after the 48h grace and only while unsettled.

### Deploy + verify — `apps/injective/scripts`

- `deploy.ts` (`bun run deploy`) — deploys `KUSD` then `Kickpact(kusd, ORACLE_SIGNER_ADDRESS)`, writes `deployments.json`, exports the ABIs, and **syncs `deployment.json` + `abi/` into `apps/mobile/src` and `apps/dashboard/src`** so one deploy updates the whole monorepo. Refuses to run if the deployer has 0 INJ.
- `settle-demo.ts` (`bun run settle:demo`) — end-to-end on testnet: faucet kUSD → open a pool whose kickoff is already in the past (final) but whose join deadline is a few minutes out → sign the score with the oracle key → `settle` → `claim`.
- `verify.ts` (`bun run verify`) — Blockscout source verification (see [gotchas](#injective-specific-gotchas)).

All on-chain writes pin a legacy `gasPrice` of `160_000_000` wei (160 gwei) — Injective testnet's EVM expects an explicit price rather than EIP-1559 estimation.

## Clients

`apps/mobile` is an Expo / React Native app (New Architecture) that also targets web, so one wallet context, one `feed.ts` data layer, and one `injective.ts` chain client back every surface.

| Surface | How it's built | Wallet | Duels |
| --- | --- | --- | --- |
| **Android** ([`apps/mobile`](../apps/mobile)) | `expo prebuild -p android` → `gradlew assembleRelease` → APK | Privy embedded EVM (primary) + keychain burner | Bluetooth **and** code |
| **Web preview** | `bun run web` | burner | code only |
| **Desktop** ([`apps/desktop`](../apps/desktop)) | legacy Electron wrapper | burner | code only |

### Chain client — `apps/mobile/src/injective.ts`

Wallet-agnostic ethers v6 module. Reads go through a `JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true })`; writes take an `ethers.Signer` resolved by the wallet context, so the module doesn't care whether that signer is Privy or a burner. It exposes:

- pool reads (`getPool`, `allPools`, `poolsForFixture`, `myPick`) that flatten the Solidity structs into a `PoolState`, and `getKusdBalance`;
- writes (`faucet`, `createPool`, `joinPool`, `claim`) that `ensureApproval` (approve `MaxUint256` once) before any stake transfer and parse the `PoolCreated` log for the new id;
- `verifySettlement(poolId)` — the "verify this receipt yourself" primitive: pull the `PoolSettled` event, fetch the `settle` tx, decode `(ts, signature)` from its calldata, and `ethers.verifyTypedData(domain, Result, { fixtureId, homeGoals, awayGoals, ts }, sig)` to recover the signer and confirm it is the contract's `oracleSigner` — entirely on the phone;
- duel-window helpers: `duelDeadlineMs(kickoff) = max(now + 1min, kickoff + 75min)` and `duelJoinable(...)`.

### Wallet — `apps/mobile/src/wallet.tsx` + `privy.tsx`

Self-custodial, two ways in:

- **Privy (primary)** — `@privy-io/expo`'s `useEmbeddedEthereumWallet`: email or a social login provisions an embedded **Ethereum** wallet (Injective is EVM), so a first-time user is betting in seconds with no seed phrase. `getSigner()` wraps the wallet's EIP-1193 provider in an `ethers.BrowserProvider`. **Native-only**, and everything is lazily `require`d behind a `Platform.OS` check so the web bundle never imports the native module. It needs Injective testnet (1439) configured on the Privy app plus `EXPO_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_CLIENT_ID`; when those are absent the whole path degrades to a stub.
- **Burner (fallback, and the default without Privy)** — an `ethers.Wallet.createRandom()` secp256k1 key sealed in the OS keychain (`expo-secure-store`), connected to the JSON-RPC provider. Works everywhere including the web preview.

`getSigner()` returns whichever is active; the screens above it never branch on wallet type.

### Data layer — `apps/mobile/src/feed.ts`

A drop-in replacement for the old TxLINE feed that keeps the same `Game` / `OddsLine` / `LiveScore` shapes the screens render, so the UI is unchanged. Source is [API-Football](https://v3.football.api-sports.io) (`x-apisports-key` header, league `1` = FIFA World Cup, season `2026`) when `EXPO_PUBLIC_APISPORTS_KEY` is set, else a **bundled snapshot** (`feed-fixtures.json`) whose kickoffs are assigned relative to load time. `fetchGames` maps API status codes to pre/in/post, `fetchScore` reads the fixture's goals, and `fetchOdds` pulls 1X2 prices and computes demargined implied probabilities client-side. Scores poll every ~6s on the match screen.

The keeper's `sports.ts` mirrors this exactly against the *same* snapshot file (`fixtures.snapshot.json`), so a pool opened from the app and settled by the keeper always share a `fixtureId`.

### Polyfills — `apps/mobile/polyfill.js`

Must load before ethers. ethers v6 needs a CSPRNG (`crypto.getRandomValues`) for key generation and signing — provided by `react-native-get-random-values` on Hermes and web. `Buffer`/`process` are also shimmed for deps that reference them at module top level. No native OpenSSL is required.

## The keeper — `apps/injective/keeper`

The settlement daemon, split into **attest** and **relay** so the two keys have different risk:

- `oracle.ts` — `signResult(...)` produces the EIP-712 signature over `(fixtureId, homeGoals, awayGoals, ts)`. The **oracle key only ever signs**; it never touches a pool and never needs gas.
- `sports.ts` — the final score, from API-Football (`finalScore` returns null until a fixture is `post`) or the bundled snapshot / a manual `--home/--away`.
- `keeper.ts` — groups open, past-full-time, unsettled pools by fixture, fetches each fixture's final score, signs it once, and relays `settle` for every pool with the **relayer key** (`RELAYER_PRIVATE_KEY`, falling back to `PRIVATE_KEY`) which pays gas. One sweep by default, `--watch` re-sweeps every 30s, `--fixture <id> --home <h> --away <a>` settles manually. It warns loudly if the oracle key doesn't match the deployed `oracleSigner` (signatures would be rejected).

## Configuration

Secrets live in `apps/injective/.env` (see `.env.example`):

| Var | Used by | Purpose |
| --- | --- | --- |
| `PRIVATE_KEY` | deploy, keeper relay | deployer / gas-paying relayer (fund with testnet INJ) |
| `ORACLE_SIGNER_PRIVATE_KEY` | keeper, settle:demo | signs match results |
| `ORACLE_SIGNER_ADDRESS` | deploy | wired into the contract as `oracleSigner` |
| `RELAYER_PRIVATE_KEY` | keeper | optional; separates the gas payer from the deployer |
| `APISPORTS_KEY` / `EXPO_PUBLIC_APISPORTS_KEY` | keeper / mobile | live API-Football data (optional — snapshot fallback otherwise) |

Chain constants (chainId 1439, RPC, Blockscout, deployed addresses, oracleSigner) live in `deployments.json` and the synced `deployment.json` copies.

## Trust model and its honest limits

1. **The outcome is never taken from the caller.** `settle` accepts only raw goals + a signature; the winning side is computed inside the contract. This closes the "prove something true but irrelevant" hole — the settlement can only ever answer the exact 1X2 question the pool asked.
2. **The single signer is the honest weak point.** Unlike the Solana build's Merkle-proof oracle, one `oracleSigner` is trusted to report the score truthfully. It is *not* trusted to pick winners, *not* trusted with funds, and *not* required to submit (anyone relays). The tightest mitigation is `refundExpired`: if the signer disappears or misbehaves, funds return to members after 48h with no one's permission.
3. **Finality without trusting a feed's clock.** Settlement requires `ts ≥ kickoff + 105 min`, so a score signed too early can't settle a live match.
4. **Upgrade path.** `oracleSigner` → an N-of-M signer set (threshold signature) restores most of the lost trustlessness without touching the pool/claim logic; a future on-chain sports feed on Injective would restore all of it.

## Injective-specific gotchas

Full write-up in [`docs/FEEDBACK.md`](FEEDBACK.md). The load-bearing ones:

- **Compile for `paris`.** OpenZeppelin 5.x targets Cancun (`mcopy`, transient storage); the default solc target can emit opcodes Injective's EVM won't run. `evmVersion: "paris"` in `hardhat.config.ts` keeps the bytecode portable.
- **Pin the gas price.** Every write sets `gasPrice: 160_000_000n`; auto-estimation / EIP-1559 doesn't behave on the testnet.
- **Pin the network in ethers.** `new JsonRpcProvider(rpc, 1439, { staticNetwork: true })` — otherwise ethers re-probes `eth_chainId` on a non-standard chain.
- **Blockscout, not Etherscan.** `hardhat.config.ts` points the toolbox's `etherscan` at Blockscout's API with a dummy `apiKey: "nil"` and `customChains`, and disables sourcify.

## Known trade-offs

- **kUSD is a demo ERC-20** (faucet), standing in for USDC — swap the token address to go real.
- **Single trusted signer for the score** — the deliberate Injective trade-off above; the mitigations, not a Merkle proof, are what bound it.
- **1X2 goals only** — the `Result` type carries just the two final goal counts. Prop pools (corners, cards, per-half) would extend the signed struct and the on-chain predicate.
- **Bluetooth duels need two physical Android devices.** Emulators have no Bluetooth radio, so the Nearby peer handshake can't run in CI or on a simulator — everything up to the radio is verified on-device.
- **Desktop is legacy.** The Electron wrapper is kept but is not part of the core product; it is burner-only and code-duels-only.
