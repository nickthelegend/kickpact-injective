# Contributing to Kickpact

Developer setup, local commands, and conventions. For the product overview and
what Kickpact *is*, see [`README.md`](README.md).

Kickpact is a World Cup prediction app on **Solana**, settled by **TxLINE**'s
cryptographically-anchored match data: friends stake equal kUSD into an on-chain
pool and pick an outcome, and the pot can only pay out what a TxLINE Merkle proof
supports — checked by a CPI into `validate_stat_v2`.

> This is the `solana` branch — the product. The pre-pivot Tether Developers Cup
> app (EVM + WDK wallet + Pears/Hyperswarm) is preserved on the
> [`evm` branch](https://github.com/nickthelegend/kickpact/tree/evm) and is not
> part of this codebase.

## Layout

```
apps/
├── mobile     # Expo / React Native (New Arch) — the app
├── solana     # Anchor program `kickpact` + keeper bot + tests
├── dashboard  # Next.js market viewer (Vercel)
└── landing    # marketing site (Vercel)
```

## Prerequisites

[Bun](https://bun.sh) ≥ 1.3, Rust + [Anchor](https://www.anchor-lang.com) 0.32.1,
the [Solana CLI](https://solana.com/docs/intro/installation), and — for the app —
Android Studio / SDK.

```bash
bun install     # all workspaces; also runs the expo-nearby-connections patch
```

## The program

```bash
cd apps/solana
anchor build
anchor test     # spins a local validator that CLONES the devnet TxLINE oracle and
                # the daily-roots PDA, so settlement is exercised against a REAL
                # World Cup proof — offline and deterministic.
```

## The app

```bash
cd apps/mobile
bun run web                                 # fast UI loop (burner wallet only)
npx expo prebuild -p android
cd android && ./gradlew assembleRelease     # APK
```

MWA and Bluetooth are **native-only** — the web target runs the burner path and
stubs Nearby, so the preview never crashes. A real Bluetooth handshake needs two
physical devices; emulators have no radio.

## Live data

```bash
cd apps/solana/keeper
bun run src/discover.ts keys/keeper.json   # activate TxLINE + pull live WC data
bun run src/keeper.ts                      # SSE watcher → auto-settle pools
```

## House rules

- **Never add a way to settle a pool that isn't a proof.** The program derives the
  winning predicate on-chain from the caller's *claimed* outcome and asks the
  oracle. No admin override, no trusted result setter — that property **is** the
  product.
- **One pool primitive.** Bluetooth duels, online duels, and match pools are all the
  same `Pool` account. Don't fork the money flow per surface.
- **Self-custodial.** MWA first, keychain burner as fallback. Nothing custodies funds.
- **P2P never touches money.** Nearby carries chat and the duel invite, nothing else.
- **Derive `epochDay` from the proof's own timestamp**, never `Date.now()`, or the
  roots PDA won't match.

## Gotchas worth knowing

- **Hermes**: `Buffer#subarray/#slice` lose the Buffer prototype (no `Symbol.species`),
  which breaks Anchor's borsh decoder; and `BN#toBuffer` doesn't exist because
  `Buffer` wasn't global when bn.js loaded. `apps/mobile/polyfill.js` fixes the
  first — use `toArrayLike(Buffer, …)` for the second.
- **No `react-native-quick-crypto`** — it needs OpenSSL (`libcrypto.so`) that isn't
  packaged, and crashes at startup. We don't need it.
- `expo-nearby-connections@1.1.0` ships a broken `android/build.gradle`; patched
  idempotently by `apps/mobile/scripts/patch-nearby.mjs` on postinstall.
- `.view()` on the oracle needs a full `AnchorProvider` (a funded dummy wallet is
  enough) — it simulates a transaction.

More in [`CLAUDE.md`](CLAUDE.md), [`docs/TECHNICAL.md`](docs/TECHNICAL.md), and
[`docs/FEEDBACK.md`](docs/FEEDBACK.md).

## Style

Bun workspaces + Turborepo. Prettier: no semicolons, double quotes, 2-space,
trailing comma `es5`. TypeScript `strict`. Rust via Anchor/Cargo. Prefer `bun`
over npm/pnpm/yarn.
