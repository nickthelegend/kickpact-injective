# CLAUDE.md

Guidance for Claude Code / agents working in this repository.

## Project

**Kickpact** is a self‑custodial, mobile‑first **World Cup prediction app on Solana**, built for the **TxLINE (TxODDS) hackathon**. Friends lock the same **kUSD** stake on a match and pick an outcome; the pot is held by an on‑chain escrow that can only pay out what **TxLINE's cryptographically‑anchored match data proves**. Settlement is a **CPI into TxLINE's `validate_stat_v2`** — no trusted oracle, no admin key over funds.

Friends gather two ways: **Bluetooth duels** (Google Nearby Connections — discover people around you, chat, pot up in person) and **online duels** (share a duel code; everyone joins the same on‑chain pot from anywhere).

`README.md` + `docs/TECHNICAL.md` are the authoritative product descriptions.

> **Branches.** `solana` (this one) is the product. `evm` preserves the pre‑pivot Tether Developers Cup app (WDK wallet, USD₮ on Sepolia, Pears/Hyperswarm watch party, Telegram Mini App, Electron desktop, legacy Sui scaffold). Nothing on `evm` is part of this product — don't port from it without reason.

## Monorepo layout — every app here is Solana

```
apps/
├── mobile     # ⭐ the app — Expo / React Native (New Arch). MWA wallet, TxLINE feeds,
│              #   pools, Bluetooth + online duels, proof receipts.
├── solana     # ⭐ Anchor program `kickpact` + keeper bot + tests (real TxLINE proofs).
├── dashboard  # ⭐ Next.js market viewer — odds board, implied probabilities,
│              #   receipts explorer, browser-side oracle verification. (Vercel)
└── landing    # marketing site + download page. (Vercel)
```

## The on-chain program (`apps/solana/programs/kickpact`)

Anchor 0.32.1, deployed to **devnet**: `4tAPD5tVaWt9TBSMGKfUnguppbg8KLcc2jXbBPufgWDa`.

- `initialize` — creates the demo **kUSD** mint (6dp) + pool registry. `faucet(amount)` — open, ≤1,000 kUSD/call (testnet).
- `create_pool(fixture_id, stake, deadline_ms, kickoff_ms, pick)` / `join_pool(pick)` — equal‑stake escrow; pick is `1=home, 2=draw, 3=away`. `deadline_ms` is the join cutoff; `kickoff_ms` anchors proof finality.
- `settle(outcome, payload)` — **permissionless**. The caller *claims* an outcome and supplies TxLINE's Merkle proof of both final goal counts; the program **builds the winning predicate on‑chain from that claim** and CPIs into `txoracle::validate_stat_v2`. A lying caller simply fails — there is nothing to trust about them. Also checks the proof is for this fixture, carries exactly statKeys 1+2, is final (phase Ended or ts ≥ kickoff+105m), and that the roots account is the oracle's real PDA for the proof's own epoch day.
- `claim` — winners split the pot; if nobody called it, everyone refunds. `refund_expired` — self‑serve after a 48h grace if no valid proof ever settled it.

`declare_program!(txoracle)` generates the CPI client from `apps/solana/idls/txoracle.json` (the **devnet** IDL — the tarball's default IDL carries the mainnet address).

## TxLINE integration (the data layer)

Free World Cup tier, **devnet**. Flow: guest JWT → on‑chain `subscribe` (SOL fees only) → sign `${txSig}:${leagues}:${jwt}` → `POST /api/token/activate` → long‑lived `X-Api-Token`.

- Headers on every call: `Authorization: Bearer <jwt>` + `X-Api-Token: <token>`. Renew the JWT on 401.
- `GET /api/fixtures/snapshot?competitionId=72&startEpochDay=` — **72 is the World Cup**.
- `GET /api/scores/snapshot/{fixtureId}` (JSON) · `GET /api/odds/snapshot/{fixtureId}` · SSE `GET /api/scores/stream` + `/api/odds/stream` (resume with `Last-Event-ID`).
- `GET /api/scores/stat-validation?fixtureId=&seq=&statKeys=1,2` → the Merkle proof that settles a pool.
- statKeys: `1`/`2` = participant‑1/2 goals, `3`/`4` yellows, `5`/`6` reds, `7`/`8` corners; prefix `1000`=1st half, `3000`=2nd, etc. Game phase `5` = Ended.
- Oracle programs: devnet `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`, mainnet `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`. Roots PDA: `["daily_scores_roots", epochDay u16 LE]` — derive epochDay from **the proof's own ts**, never `Date.now()`.
- `validate_stat_v2` needs ~1.4M CU; `.view()` needs a full `AnchorProvider` (a funded dummy wallet is enough).

Gotchas we hit are written up in `docs/FEEDBACK.md` (that file is also the hackathon's feedback deliverable).

## Commands

```bash
bun install                                  # all workspaces (Bun ≥ 1.3)

cd apps/solana && anchor build               # compile the program
cd apps/solana && anchor test                # CPI test vs a REAL TxLINE proof
                                             #   (clones the devnet oracle + roots PDA into localnet)
cd apps/solana/keeper && bun run src/discover.ts keys/keeper.json   # activate + pull live WC data
cd apps/solana/keeper && bun run src/keeper.ts                      # SSE watcher → auto-settle

cd apps/mobile && bun run web                # fast UI loop (burner wallet only)
cd apps/mobile && npx expo prebuild -p android && cd android && ./gradlew assembleRelease
```

Prebuilt APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (`io.kickpact.app`).

## Load-bearing design decisions

- **The oracle decides, not us.** `settle` derives the predicate from the claimed outcome *inside the program*, so the only outcome that can ever settle a pool is the one TxLINE's proof supports. Never add an admin override.
- **Self-custodial, always.** MWA (`@wallet-ui/react-native-web3js`) is the primary path — a real wallet app holds the keys. The keychain burner is a fallback, not the default.
- **P2P is Bluetooth, and it never touches the money.** `expo-nearby-connections` (P2P_CLUSTER mesh) carries chat + the duel invite; the pot is always an on-chain pool. Hyperswarm/Bare are gone.
- **One pool primitive.** Bluetooth duels, online duels, and match pools are all the same `Pool` account — don't fork the money flow per surface.
- **Duel join windows run late.** `duelDeadlineMs` = kickoff+75m so friends can pot up around the match; finality still keys off kickoff.

## Native build gotchas (apps/mobile)

- **New Architecture is on** and required (nitro modules).
- **No `react-native-quick-crypto`** — its `libQuickCrypto.so` needs OpenSSL (`libcrypto.so`), which isn't packaged, and it crashes at startup. We don't need it: `react-native-get-random-values` + tweetnacl's bundled ed25519/sha512 cover the burner and MWA paths. `react-native-nitro-modules` stays (Nearby needs it).
- `expo-nearby-connections@1.1.0` ships a broken `android/build.gradle` (references a `fix-prefab.gradle` it doesn't include, plus a `components.release` publish block newer Gradle rejects). `scripts/patch-nearby.mjs` fixes both, wired as `postinstall` — patch-package can't read `bun.lock`.
- MWA + Nearby are **native-only**: guarded so the web preview still runs on the burner path. A real Bluetooth handshake needs **two physical devices** — emulators have no BT radio.

## Code style

Bun workspaces + Turborepo. Prettier: no semicolons, double quotes, 2‑space, trailing comma `es5`. TypeScript `strict`. Rust via Anchor/Cargo. Prefer `bun` over npm/pnpm/yarn.
