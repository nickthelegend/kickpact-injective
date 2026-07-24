# Injective EVM — builder feedback

*From the Kickpact team, after porting a self-custodial betting escrow (Solidity contract + EIP-712 settlement + ethers keeper + Expo/ethers mobile client) onto Injective EVM testnet (chainId 1439). Concrete notes, grounded in what's actually in this repo.*

## What worked well

1. **It really is just EVM.** The escrow moved from an Anchor program to a standard Solidity 0.8.28 contract using stock OpenZeppelin (`EIP712`, `ECDSA`, `SafeERC20`, `ReentrancyGuard`), Hardhat, and ethers v6 — no Injective-specific SDK in the contract or the clients. The whole non-chain half of the product (Bluetooth duels, the screens, the data layer) came across untouched because it never depended on the chain.
2. **Standard EIP-712 tooling end to end.** The same domain + `Result` type is produced by the keeper (`oracle.signTypedData`), verified in the contract (`ECDSA.recover`), and re-verified on the phone (`ethers.verifyTypedData`) — three environments, one primitive, zero glue. That gave us re-verifiable receipts on-device for free.
3. **Blockscout is a real explorer + verifier.** Tx links, contract pages, and source verification all worked against `testnet.blockscout.injective.network` once configured (see the gotcha below), so the demo has clickable, verifiable artifacts.
4. **The embedded-wallet path is smooth.** A Privy embedded **Ethereum** wallet works directly because Injective is EVM — email/social login → an EVM key → ethers signer, no bespoke wallet integration.

## Friction we hit (with repro details)

1. **OpenZeppelin 5.x compiles to Cancun; Injective wanted paris.** OZ 5.x emits `mcopy` / transient-storage / `PUSH0` under a modern solc target, and that bytecode didn't run cleanly on the testnet EVM. Fix (in `hardhat.config.ts`): `settings.evmVersion = "paris"`. Worth a prominent line in the EVM docs — "if your contract deploys but reverts on first call, check your `evmVersion`" would save people an afternoon.

2. **Gas estimation / EIP-1559 doesn't just work — pin a legacy gas price.** Left to auto-estimate, transactions would hang or under-price. Every write in this repo carries an explicit `{ gasPrice: 160_000_000n }` (160 gwei) — the deploy script, `settle-demo`, the keeper, and both mobile writes. A documented "recommended testnet gas price" (and whether EIP-1559 `maxFeePerGas` is supported) would remove guesswork.

3. **ethers v6 re-probes a non-standard chain unless you pin it.** On chainId 1439 we had to construct providers as `new JsonRpcProvider(rpc, 1439, { staticNetwork: true })`; without `staticNetwork` ethers issues extra `eth_chainId` round-trips and occasionally mis-detects the network. Minor, but a copy-paste snippet in the "connect with ethers" docs would help.

4. **Blockscout verification needs the Hardhat toolbox pointed at it, with a dummy key.** `@nomicfoundation/hardhat-toolbox`'s `etherscan` config assumes an Etherscan-style API key. For Blockscout we set `apiKey: { inj_testnet: "nil" }`, added a `customChains` entry with the Blockscout `apiURL`/`browserURL`, and set `sourcify.enabled = false`. It works, but it's non-obvious — a ready-made `customChains` block in the docs would be the single highest-leverage snippet you could publish.

5. **The faucet is the bottleneck for automated flows.** Funding the deployer/relayer means going through the web faucet (`testnet.faucet.injective.network`), which is rate-limited / anti-abuse-protected — you can't script it, and repeat requests get throttled. Our `deploy.ts` hard-fails with "deployer has 0 INJ — fund it from the faucet first" precisely because we hit this. A small programmatic testnet drip (captcha-gated per address, but callable) would make CI and multi-key setups (separate deployer + oracle + relayer) much less fiddly.

6. **No on-chain sports oracle — this reshaped the whole product.** The Solana build settled trustlessly by CPI-ing into a Merkle-proof score oracle. Injective's oracles (Pyth, Band, the native oracle module) are **price** feeds — there's no on-chain scoreboard to verify a football result against. We had to fall back to a signed-score design (`oracleSigner` signs the goals, the contract derives the outcome), which is honestly *weaker* — one trusted signer for the fact of the score. We bound it (permissionless submission, on-chain outcome derivation, a 48h `refundExpired` escape hatch, an upgrade path to N-of-M), but the trustlessness we had on Solana is gone. **This is the one thing that would most change what's buildable on Injective**: a general attestation/registry primitive, or Band sports feeds, would let escrows like ours settle against data instead of a signer.

7. **ms vs s is a footgun across the JS ↔ Solidity boundary.** We key pool deadlines / kickoff / the signed `ts` in epoch **milliseconds** (what JS gives you), but `block.timestamp` is **seconds** — the contract bridges with `block.timestamp * 1000`. Signing a `ts` in seconds silently fails the `ts ≥ kickoff + 105min` finality check. Not Injective's fault, but a classic EVM-from-JS trap worth flagging.

8. **React Native needs a CSPRNG polyfill before ethers.** ethers v6 key-gen/signing calls `crypto.getRandomValues`, absent on Hermes — `polyfill.js` imports `react-native-get-random-values` first. (We could *not* use `react-native-quick-crypto`, whose native OpenSSL isn't packaged and crashes at startup, so the pure-JS path is the one that ships.)

## What we'd use next

- **A decentralized sports/data oracle on Injective** — even an on-chain attestation registry we could verify a signature set against — to restore the "the data decides, not a signer" property and retire the single `oracleSigner`.
- **An N-of-M / threshold signer set** as the interim step: the contract already separates *attesting the score* from *deciding the outcome*, so swapping one recovered address for a quorum is a contained change.
- **A local Injective-EVM dev node / fork** for CI. Our unit tests run on the generic Hardhat network (chainId 31337); we can't exercise Injective's actual EVM quirks (the `paris`/gas issues above) without deploying to the live testnet.
- **Native-asset staking via the `bank` precompile** — issuing kUSD as a bank denom and settling pools in a native Injective asset (reachable from Solidity per the EVM docs) is a natural next step once the money model is real.
