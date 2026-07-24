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
| **Kickpact (kUSD)** — escrow + 2-of-3 signed-score settlement | `0x4D142990D1114a86b04F56B36D43c38496FE0809` | [verified code ↗](https://testnet.blockscout.injective.network/address/0x4D142990D1114a86b04F56B36D43c38496FE0809?tab=contract) |
| **Kickpact (native USDC)** — same escrow, USDC stakes (deployed; no pool staked yet) | `0xe7692F9971683944468B3282e98e64Ca5601585a` | [verified code ↗](https://testnet.blockscout.injective.network/address/0xe7692F9971683944468B3282e98e64Ca5601585a?tab=contract) |
| **KUSD** — demo ERC-20 (6 dp, open faucet, **EIP-3009**) | `0x52dd70b78993470e05Fc395D2a81F3b9A8B36094` | [verified code ↗](https://testnet.blockscout.injective.network/address/0x52dd70b78993470e05Fc395D2a81F3b9A8B36094?tab=contract) |
| **Native USDC** — Injective testnet USDC (6 dp) | `0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d` | [token ↗](https://testnet.blockscout.injective.network/address/0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d) |
| **Oracle signer set** — 2 of these 3 must co-sign a score | `0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a`<br>`0xc9160042dF36d60cF2d9ABed7A6491b18D263e03`<br>`0x9c1DFD70EF2f0bE2575db9d112276aD396f9ee35` | [1 ↗](https://testnet.blockscout.injective.network/address/0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a) · [2 ↗](https://testnet.blockscout.injective.network/address/0xc9160042dF36d60cF2d9ABed7A6491b18D263e03) · [3 ↗](https://testnet.blockscout.injective.network/address/0x9c1DFD70EF2f0bE2575db9d112276aD396f9ee35) |
| **Deployer** | `0xFedb9938BDeFdD91Ae52a4a93746Fc32B77E690a` | [account ↗](https://testnet.blockscout.injective.network/address/0xFedb9938BDeFdD91Ae52a4a93746Fc32B77E690a) |

Need testnet INJ for gas? [testnet.faucet.injective.network](https://testnet.faucet.injective.network/). All addresses are also machine-readable in [`apps/injective/deployments.json`](apps/injective/deployments.json).

**Settlement is 2-of-3 and we prove it on-chain.** `bun run settle:demo` opens a pool, then *first* submits a single signature and shows it rejected, before settling with a real quorum:

```
oracle quorum: 2-of-3 → 0x02bA…fc9a, 0xc916…3e03
settle…
  ✓ 1 signature rejected (threshold is 2)
  settled with 2 signatures  tx 0xb522419e…
  result=1 (1=home 2=draw 3=away)  winners=1
```

---

## Why this exists

Betting with friends is either custodial (a bookie holds your money) or pure trust ("you never paid me"). And even trustless escrow has an oracle problem: *who says who won?*

Kickpact's answer is an escrow that **can't invent a result and can't be argued with**. It only settles to the outcome that a signed final score implies — and it computes that outcome *itself*, from the raw goals, so no one — not the keeper, not the signer, not us — ever gets to name a winner.

```
   friends stake kUSD             match ends              anyone submits the signed score
  ┌─────────────────────┐   ┌────────────────────┐   ┌───────────────────────────────────────┐
  │ createPool / join   │ → │ 2-of-3 oracle keys │ → │ settle(poolId, home, away, ts, sigs[])│
  │ (escrow in Kickpact)│   │ sign the goals(712)│   │  → 2 distinct signers recovered  ✓     │
  └─────────────────────┘   └────────────────────┘   │  → outcome derived on-chain from goals │
                                                      │  → winners claim, else self-serve      │
                                                      └───────────────────────────────────────┘
```

The settle caller is **untrusted by design**: they can't forge the oracle's signature, and even the oracle can only attest a *score* — the contract turns goals into home/draw/away with `homeGoals > awayGoals ? home : (== ? draw : away)`. A lying keeper simply fails. We [prove the whole lifecycle in the tests](apps/injective/test/kickpact.test.ts): a forged signer is rejected, a non-final timestamp is rejected, and the true score settles every pool on the fixture at once.

### The honest part of the trust model

On Solana, Kickpact settled via a CPI into TxLINE's Merkle-proof oracle — the match data was itself anchored on-chain, so *nobody* was trusted. **Injective has no on-chain sports-score feed** (Pyth and Band there are price oracles, not scoreboards). So the "the data decides, not an admin" property is rebuilt from a different root: a **fixed set of oracle keys** signs the raw final goals, and the contract derives the outcome.

This is still weaker than a Merkle proof — you are trusting a quorum of known keys rather than published data — so here is exactly how far the guarantee goes:

1. **Signers report facts, not winners.** They sign `(fixtureId, homeGoals, awayGoals, ts)`. The winning side is computed on-chain. No signature can settle a pool to a result the score doesn't support.
2. **No single key can settle.** Settlement is **2-of-3**: two distinct members of the signer set must sign the *same* score. One leaked or malicious key is not enough, and duplicates/outsiders are rejected. Raising this to a larger, independently-operated set is a constructor argument, not a redesign.
3. **Submission is permissionless.** Any wallet can relay a valid signature set. Signers never touch the pot and never need gas.
4. **No funds are ever stranded or admin-controlled.** If the settled outcome had no backers, everyone refunds. If no valid quorum ever arrives, a **48-hour grace** opens self-serve `refundExpired`. There is no admin key over funds.

**What we are NOT claiming:** the signers are not independent third parties here — for the hackathon build all three keys are ours, so this demonstrates the *mechanism*, not a decentralised signer committee. The security argument only becomes real when the keys are held by separate operators; the contract is already written for that day.

## What's here

| Piece | Where | Notes |
| --- | --- | --- |
| **`Kickpact.sol`** — the escrow: pools, equal-stake join, EIP-712 signed settlement, claim, `refundExpired` | [`apps/injective/contracts/Kickpact.sol`](apps/injective/contracts/Kickpact.sol) | Solidity 0.8.28, OZ, compiled for **paris** so the bytecode runs on Injective's EVM |
| **`KUSD.sol`** — the demo dollar pools stake in: ERC-20, 6 decimals, open faucet (≤1,000/call), **EIP-3009 gasless transfers** | [`apps/injective/contracts/KUSD.sol`](apps/injective/contracts/KUSD.sol) | testnet stand-in for USDC; EIP-3009 is what the x402 attestor settles payments with |
| **Mobile app** — Expo RN: Privy embedded EVM wallet + keychain burner, API-Football fixtures/scores/odds, pools, **Bluetooth + online duels**, re-verifiable receipts | [`apps/mobile`](apps/mobile) | build → `app-release.apk` (`io.kickpact.app`) |
| **Settle-keeper** — signs a fixture's final goals with the oracle key, relays `settle` for every open pool with a separate relayer key | [`apps/injective/keeper`](apps/injective/keeper/src/keeper.ts) | attest ≠ relay; watch mode sweeps every 30s |
| **Market-viewer dashboard** — odds board, on-chain pool volumes, receipts explorer with **browser-side signature re-verification** | [`apps/dashboard`](apps/dashboard) | Next.js (Vercel) |
| **End-to-end proof on testnet** — faucet → open pool → sign → settle → claim, in one script | [`apps/injective/scripts/settle-demo.ts`](apps/injective/scripts/settle-demo.ts) | `bun run settle:demo` |

Deployed addresses are written to [`apps/injective/deployments.json`](apps/injective/deployments.json) by the deploy script and synced into the app + dashboard. Chain: **Injective EVM testnet**, chainId **1439**, RPC `https://k8s.testnet.json-rpc.injective.network/`, explorer **[Blockscout](https://testnet.blockscout.injective.network)**. The oracle signer is `0x02bA8DF40A30E25E72B1100244b38C21F74Afc9a`.

## The trust model (what makes it interesting)

1. **The contract can't be sweet-talked.** `settle(poolId, homeGoals, awayGoals, ts, signatures[])` requires the result to be final (`ts ≥ kickoff + 105 min`), recovers **every** EIP-712 signature, requires `threshold` *distinct* members of the oracle set (recovered addresses must strictly increase, so a duplicate can't pad the count), then **builds the outcome from the goals on-chain**. Nothing about the caller is trusted.
2. **No single key is load-bearing.** Settlement is **2-of-3**: one compromised or dishonest oracle key cannot settle a pool, because the other two simply never co-sign a false score. The tests prove a lone signature, a duplicated signature, an unsorted set, and an outsider co-signer are all rejected — and that *any* 2 of the 3 keys work, so no individual key is special.
3. **One quorum, every pool.** The attestation is bound to the *fixture*, not the pool — one signed score settles every pool on that match, and anyone can relay it.
4. **No winner? Everyone refunds.** And if no signature ever arrives, a 48-hour grace unlocks self-serve refunds. Funds are never stranded, never admin-controlled.
5. **Receipts re-verify anywhere.** The app and dashboard pull the `PoolSettled` event and the `settle` calldata, then re-run `verifyTypedData` in the client — you watch each signature recover to a member of the oracle set live, on your own device.

## Injective integration & the new Injective technologies

**Is Injective integrated? Yes — it is the whole settlement layer.** Kickpact is not a chain-agnostic app with a chain bolted on: the escrow, the stake token, the settlement and every payout are Solidity contracts deployed and verified on **Injective EVM testnet (chainId 1439)**, and the app, keeper and dashboard all read and write through Injective's EVM JSON-RPC with `ethers` v6. The addresses are in the table at the top of this README, live on Blockscout.

Here is an honest account of the four highlighted technologies — what we used, and what we did not:

| Technology | Used? | Detail |
| --- | --- | --- |
| **Agent Skills** | ✅ **Yes** | The 20 Injective agent-skills are vendored in [`.claude/skills/`](.claude/skills) and pinned in [`skills-lock.json`](skills-lock.json) (restore with `npx skills experimental_install`). They were the working spec for this port: **`injective-evm-developer`** gave the Hardhat testnet config we ship — chainId `1439`, RPC `k8s.testnet.json-rpc.injective.network`, the Blockscout custom-chain verify block, and the `paris` EVM target that keeps bytecode free of `PUSH0` so it runs regardless of hardfork level. **`injective-faucet`** drove the deployer bootstrap; **`injective-frontend-wallet`** informed the EVM wallet path; **`injective-usdc-integration`** is the reference for the mainnet USDC swap described below. |
| **MCP Server** | ❌ No | We built against the vendored skills and the EVM JSON-RPC directly, so the Injective MCP server was never connected. `injective-mcp-servers` is vendored for the skills that need it, but nothing in `apps/` calls it. |
| **Native USDC** | ⚠️ **Partly** | A second escrow, [`0xe769…585a`](https://testnet.blockscout.injective.network/address/0xe7692F9971683944468B3282e98e64Ca5601585a?tab=contract), is deployed and verified **denominated in native USDC on Injective testnet** (`0x0C38…4C5d`) — same code, same oracle set, stake token swapped via the constructor. That token is Circle's canonical **FiatToken** (calling `mint` returns `"FiatToken: caller is not a minter"`), so it is the real CCTP-issued USDC, not a mock. **Two honest limits:** (1) we have **not** staked a live USDC pool, because testnet USDC has to be acquired from Circle rather than minted, and (2) we did **not** build a **CCTP bridge** — no burn → attestation → mint flow. The escrow accepts USDC; the cross-chain funding path is not implemented. |
| **x402** | ✅ **Yes** | [`apps/injective/attestor`](apps/injective/attestor) serves the oracle's signed score attestations behind **HTTP 402**: `GET /attest/:fixtureId` returns a 402 with x402 payment requirements (price in native USDC), and on a valid `X-PAYMENT` header returns the EIP-712 signatures that `settle()` accepts. An oracle feed is a natural metered resource — you pay per attestation. See that directory's README for exactly which parts of payment verification are implemented and which are not. |

**Why this matters for the trust model:** the one thing we genuinely need from a chain is a cheap, permissionless `settle()` that anyone can call — a keeper, a pool member, or a stranger. Injective's EVM gives us that with sub-cent gas, which is what makes "anyone can settle, and a 48-hour self-serve refund if nobody does" a real guarantee rather than a slogan.

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
