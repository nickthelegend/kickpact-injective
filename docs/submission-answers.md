# Superteam Earn — submission answers (TxLINE track)

## One-liner

> **Kickpact — bets that settle themselves.** Self-custodial World Cup prediction pools on Solana: friends escrow kUSD, and the pool can only settle to the outcome TxLINE's Merkle proof confirms — via CPI into `validate_stat_v2`. Winners split the pot; every settlement leaves a receipt you can re-verify on-chain from your phone or browser.

## Links

| | |
| --- | --- |
| Public repo (solana branch) | https://github.com/nickthelegend/kickpact/tree/solana |
| Application access — dashboard (live) | https://kickpact-solana.vercel.app |
| Devnet program (IDL on-chain) | `4tAPD5tVaWt9TBSMGKfUnguppbg8KLcc2jXbBPufgWDa` |
| Real settlement tx (England 1–2 Argentina, CPI validateStatV2) | https://explorer.solana.com/tx/21CFfLsx6Mqy7XmZUeTiPZ6PAMwGqBpwFgi4GkZvqUPbUJ9oXxV8QA6kDuqX6qWaM8vDdKWTihugkXa528uh6voS?cluster=devnet |
| Android APK | GitHub release on the solana branch |
| Demo video (3:01) | [kickpact-demo.mp4](https://github.com/nickthelegend/kickpact/releases/download/v2.0.0-solana/kickpact-demo.mp4) — upload to YouTube *unlisted* and paste the link here |
| Technical documentation | [docs/TECHNICAL.md](TECHNICAL.md) |
| TxLINE API feedback | [docs/FEEDBACK.md](FEEDBACK.md) |

## How TxLINE powers the backend (short)

- **Fixtures/scores/odds**: the app and dashboard read `fixtures/snapshot` (competitionId 72), `scores/snapshot` (live scores + `Seq`), and StablePrice `1X2_PARTICIPANT_RESULT` odds with TxLINE's demargined implied probabilities.
- **SSE**: the settle-keeper holds `/api/scores/stream` open (Last-Event-ID resume) and reacts to full-time events.
- **Proofs**: settlement consumes `scores/stat-validation` (statKeys 1,2) and the program CPIs into `validate_stat_v2` on devnet — the claimed outcome's predicate is rebuilt on-chain, so a false settlement is refuted by the oracle itself.
- **Activation**: our data token was minted by the project's own on-chain `subscribe` (free tier, level 1) + signed activation — the same flow ships in `apps/solana/keeper`.

## Team

nickthelegend (+ Claude as AI pair). Prize-eligible individual submission via Superteam Earn.

## Demo video (3:01) — recorded, in the v2.0.0-solana release

Every beat below is a real capture: the APK on-device against devnet, the real `anchor test` CPI logs, and the live dashboard. Nothing is mocked.

### Beats

1. **Cold open (15s)** — "Group bets die arguing about results. Kickpact pools can only settle to what TxLINE proves."
2. **Wallet + data (45s)** — create burner (or MWA connect), fixtures/odds board straight from TxLINE, mint kUSD faucet.
3. **Pool flow (60s)** — open a pool on the final, second phone/wallet joins, vault shown on explorer.
4. **The oracle moment (90s)** — keeper spots full time on the SSE stream → fetches the Merkle proof → settle tx lands → show the CPI logs refuting a wrong outcome in the test, confirming the true one on devnet.
5. **Receipts (45s)** — receipt screen: stats proven, roots, epoch-day PDA → press **VERIFY ON-CHAIN NOW** → "ORACLE CONFIRMS ✓" live in the browser and on the phone.
6. **Close (15s)** — dashboard totals, repo, "goal-line technology for your bets."
