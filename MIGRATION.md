# Kickpact → Injective — migration plan

This repo is a **snapshot of the Solana/TxLINE Kickpact** (see `README.md`,
`CLAUDE.md`, `docs/TECHNICAL.md` — all still describe the Solana build). It is
the *starting point* for porting Kickpact to **Injective**, nothing here has
been migrated yet. Git history was reset; this is commit one.

The 21 Injective agent-skills are vendored under `.claude/skills/` and pinned in
`skills-lock.json` (`npx skills experimental_install` restores them).

## What Injective actually is (from `injective-evm-developer`)

Injective is one Layer 1 that is **simultaneously EVM and Cosmos**. That means:

- We can ship the escrow as a **Solidity contract on Injective EVM** (Hardhat or
  Foundry — the skill builds on the standard solidity-* skills).
- Native Injective modules are reachable from Solidity via **EVM precompiles**
  (`bank`, `exchange`).
- Testnet funds: <https://testnet.faucet.injective.network/> (paste the `0x`
  address) or the Google Cloud faucet (paste the `inj…` bech32 address).

## What ports cleanly (most of the product)

| Piece | Solana today | Injective |
|---|---|---|
| **Bluetooth duels** | `expo-nearby-connections`, carries chat + invite only | **unchanged** — it never touched the chain. The whole USP moves for free. |
| **Escrow / Pool** | Anchor `Pool` account, kUSD SPL mint | Solidity `Pool` contract, stake in an ERC-20 (mock kUSD or test USDC) |
| **Wallet in the app** | MWA / Privy / keychain burner | MetaMask / WalletConnect to Injective EVM, or an embedded EVM key (`injective-frontend-wallet`) |
| **Dashboard + landing** | reads pools from devnet RPC | point at Injective EVM RPC + the new contract address |
| **Client layer** | `apps/mobile/src/solana.ts` (web3.js) | swap to `ethers`/`viem`; the screens above it barely change |

## The one hard decision: settlement / the oracle

On Solana, settlement is trustless because **TxLINE ships a native oracle
program** we CPI into — the program rebuilds the winning predicate on-chain and
TxLINE's Merkle proof confirms it. **TxLINE is a Solana/TxODDS thing; it is
almost certainly not on Injective.** So the "no admin key, the data decides"
property has to be rebuilt from a different source. Options, roughly in order of
trustlessness:

1. **Band Protocol** — Cosmos-native, integrated with Injective. Need to verify
   it carries *football/sports* feeds, not just crypto/FX prices. If it does,
   this is the closest analogue to the TxLINE story.
2. **Chainlink on Injective EVM** — check feed availability for sports.
3. **Injective's native oracle module** (via the `exchange`/oracle precompile) —
   built for price feeds; likely no sports data.
4. **Signed-result keeper** — a keeper posts the final score signed by a known
   key; the contract verifies the signature. Simplest, works today, but
   reintroduces a trusted signer (weaker than the Solana version — say so
   honestly in the pitch).

**Do this decision first.** Everything downstream (the `settle()` signature, the
receipt UI, the whole trust pitch) depends on it. Don't scaffold the contract
until the settlement source is chosen.

## Suggested order

1. **Pick the settlement source** (above). Verify feed availability before committing.
2. `apps/injective/` — Hardhat or Foundry project. Port `Pool` +
   create/join/settle/claim/refund from `apps/solana/programs/kickpact/src/lib.rs`
   to Solidity. Start with a mock-oracle `settle()` so the money flow is testable
   before the real feed is wired.
3. Faucet an Injective testnet wallet, deploy, get one pool settling end-to-end
   against the mock oracle.
4. Swap `apps/mobile/src/solana.ts` for an Injective EVM client; wire the wallet
   (`injective-frontend-wallet`). Screens and the Bluetooth layer stay.
5. Point `apps/dashboard` + `apps/landing` at the Injective contract.
6. Replace the real oracle mock with the chosen feed; re-verify a settlement.
7. Rewrite `README.md` / `CLAUDE.md` / `docs/` for Injective (they still say
   Solana). Do this last, once the shape is proven.

## Relevant skills for each step

- Contracts: `injective-evm-developer`
- Funds: `injective-faucet`, `injective-funding`, `injective-cli`
- App wallet: `injective-frontend-wallet`, `injective-wallet-ops`
- Money: `injective-usdc-integration`, `injective-trading-tokens`
- Infra: `injective-mcp-servers` (connect the Injective MCP server first — several
  skills need it)
