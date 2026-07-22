# Kickpact — bets that settle themselves, proven by TxLINE on Solana

> A self-custodial **World Cup prediction app**. Friends stake the same **kUSD** into an on-chain pool and pick an outcome — then nobody argues about the result: the pool **settles itself** the moment TxLINE's cryptographically-anchored match data proves it, via a CPI into `validate_stat_v2` on Solana. Winners split the pot. Every settlement leaves a **Merkle-proof receipt you can re-verify from your phone or browser**.

<p>
  <img alt="TxLINE hackathon" src="https://img.shields.io/badge/TxLINE_Hackathon-World_Cup_data-627EEA?style=flat-square" />
  <img alt="Solana devnet" src="https://img.shields.io/badge/programs-Solana_devnet-3ba34b?style=flat-square" />
  <img alt="Data" src="https://img.shields.io/badge/data-TxLINE_·_SSE_+_Merkle_proofs-e8b84b?style=flat-square" />
  <img alt="Expo RN" src="https://img.shields.io/badge/app-Expo_·_React_Native-8aa0f5?style=flat-square" />
</p>

> 🌿 **Branches**: this `solana` branch is the TxLINE-hackathon product. The previous Tether Developers Cup submission (EVM + WDK + Pears) is preserved intact on the [`evm` branch](https://github.com/nickthelegend/kickpact/tree/evm).

---

## Why this exists

Betting with friends is either custodial (a bookie holds your money) or pure trust ("you never paid me"). And even trustless escrow has an oracle problem: *who says who won?*

**TxLINE solves the oracle problem** — TxODDS anchors every score update into Merkle roots stored on Solana, and exposes `validate_stat_v2`, an instruction any program can CPI into to check a stat claim against those roots. Kickpact builds the missing product on top: **group pools whose only settlement authority is the proof itself.**

```
   friends stake kUSD          match ends            anyone submits the proof
  ┌────────────────────┐   ┌──────────────────┐   ┌───────────────────────────────┐
  │ create_pool / join │ → │ TxLINE SSE stream │ → │ settle(outcome, merkle_proof) │
  │  (escrow in vault) │   │  keeper watching  │   │  → CPI validate_stat_v2 ✓     │
  └────────────────────┘   └──────────────────┘   │  → winners claim, self-serve  │
                                                  └───────────────────────────────┘
```

The settle caller is **untrusted by design**: the program rebuilds the 1X2 predicate on-chain from the claimed outcome and lets the oracle confirm or refute it. A lying keeper simply fails — we [prove this in the tests](apps/solana/tests/kickpact.test.ts) with the real England 1–2 Argentina semifinal proof.

## What shipped (all live)

| Piece | Where | Status |
| --- | --- | --- |
| **`kickpact` Anchor program** — pools escrow + CPI settlement + faucet | [`apps/solana/programs/kickpact`](apps/solana/programs/kickpact/src/lib.rs) | ✅ devnet [`4tAPD5…gWDa`](https://explorer.solana.com/address/4tAPD5tVaWt9TBSMGKfUnguppbg8KLcc2jXbBPufgWDa?cluster=devnet) |
| **Mobile app** — Expo RN, burner wallet + Mobile Wallet Adapter, live TxLINE fixtures/scores/odds, pools, **Bluetooth + online duels**, proof receipts | [`apps/mobile`](apps/mobile) | ✅ [APK](https://github.com/nickthelegend/kickpact/releases/download/v2.1.0-solana/kickpact-android-arm64.apk) |
| **Desktop app** — the same client packaged with Electron (wallet, odds, pools, duel codes, receipts) | [`apps/desktop`](apps/desktop) | ✅ [macOS](https://github.com/nickthelegend/kickpact/releases/download/v2.0.0-solana/Kickpact-2.0.0-mac-arm64.dmg) · [Windows](https://github.com/nickthelegend/kickpact/releases/download/v2.0.0-solana/Kickpact-2.0.0-win-x64.exe) · [Linux](https://github.com/nickthelegend/kickpact/releases/download/v2.0.0-solana/Kickpact-2.0.0-linux-x86_64.AppImage) |
| **Market-viewer dashboard** — odds board (StablePrice 1X2 + implied %), receipts explorer with **browser-side on-chain re-verification** | [`apps/dashboard`](apps/dashboard) | ✅ [kickpact-solana.vercel.app](https://kickpact-solana.vercel.app) |
| **Settle-keeper** — watches the TxLINE SSE scores stream, auto-settles pools at full time with the fetched proof | [`apps/solana/keeper`](apps/solana/keeper/src/keeper.ts) | ✅ running |
| **A real settlement** — England 1–2 Argentina (semifinal), settled on devnet by CPI with TxLINE's proof | [settle tx](https://explorer.solana.com/tx/21CFfLsx6Mqy7XmZUeTiPZ6PAMwGqBpwFgi4GkZvqUPbUJ9oXxV8QA6kDuqX6qWaM8vDdKWTihugkXa528uh6voS?cluster=devnet) | ✅ on-chain |

## The trust model (what makes it interesting)

1. **The program can't be sweet-talked.** `settle(outcome, payload)` verifies: the proof is for the pool's fixture · it carries exactly the two full-game goal stats (statKeys 1 & 2) · it's final (phase `Ended`, or stamped ≥ kickoff + 105 min) · the daily-roots account is the oracle's PDA for the proof's own epoch day — then builds the predicate for `outcome` **on-chain** and requires the oracle's `true`.
2. **Settlement is permissionless.** Any wallet — keeper bot, pool member, a stranger — can deliver the proof. Nobody can deliver a false one.
3. **No winner? Everyone refunds.** And if no proof ever arrives, a 48-hour grace unlocks self-serve refunds. Funds are never stranded, never admin-controlled.
4. **Receipts are re-verifiable forever.** The app and dashboard re-run `validate_stat_v2` as a read-only `.view()` — you watch the oracle confirm your settlement live.

## Run it

```bash
# tests — the local validator CLONES the devnet txoracle program + roots PDA,
# so the CPI settlement path runs offline against REAL World Cup data
cd apps/solana && anchor test

# mobile (Expo web preview or Android)
cd apps/mobile && bun install && bunx expo start --web   # or: bunx expo run:android

# desktop (exports the app to web, then runs it in Electron)
cd apps/desktop && bun install && npm start              # npm run dist → dmg/exe/AppImage

# dashboard
cd apps/dashboard && bun install && bun run dev          # http://localhost:3070

# keeper (auto-settlement daemon)
cd apps/solana/keeper && bun install && bun run src/keeper.ts
```

TxLINE free-tier access ships in the repo (guest JWT + the API token minted by our own on-chain `subscribe`) so everything works out of the box — see [`docs/TECHNICAL.md`](docs/TECHNICAL.md) for the exact endpoints used and how activation works.

## Monorepo map (solana branch)

```
apps/
├── mobile      # ⭐ Expo RN app — wallet (burner + MWA), TxLINE data, pools,
│               #   Bluetooth + online duels, receipts. Also targets web.
├── solana      # ⭐ Anchor workspace — kickpact program, tests vs cloned oracle, keeper
├── dashboard   # ⭐ Next.js market viewer + verifiable receipts (Vercel)
├── desktop     #   Electron shell around mobile's web export → mac/win/linux
└── landing     #   marketing site (Vercel)
```

Every app here is Solana. The pre-pivot Tether Cup product (EVM + WDK wallet, Pears/Hyperswarm watch party, Telegram Mini App) lives on the [`evm` branch](https://github.com/nickthelegend/kickpact/tree/evm) — nothing on it is part of this one.

## The stack

- **Data**: TxLINE devnet — `fixtures/snapshot`, `scores/snapshot`, `odds/snapshot` + windows, `scores/stream` (SSE, Last-Event-ID resume), `scores/stat-validation` (Merkle proofs)
- **Chain**: Solana devnet — Anchor 0.32, `declare_program!` CPI into txoracle [`6pW64g…yP2J`](https://explorer.solana.com/address/6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J?cluster=devnet)
- **App**: Expo / React Native (Android), `@solana/web3.js`, Mobile Wallet Adapter, keychain-stored burner; proximity duels over Google Nearby Connections (`expo-nearby-connections`)
- **Desktop**: Electron around the app's own `expo export --platform web` output — one client, three OSes, no second codebase
- **kUSD**: a 6-dp SPL demo-dollar with an in-program faucet (testnet stand-in for USDC)

---

*Built for the TxLINE hackathon (Superteam Earn) — July 2026.*
