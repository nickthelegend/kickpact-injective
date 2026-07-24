# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# This app is on INJECTIVE EVM

Kickpact is a self-custodial World Cup prediction app on **Injective EVM** (chainId 1439). The chain is EVM, so the client talks to it with **ethers v6** — there is no Solana/web3.js and no Anchor here. This repo is the Injective port; the earlier Solana/TxLINE build is documented only in the root `MIGRATION.md`.

- **Wallet** — self-custodial, two ways in (`src/wallet.tsx`):
  - **Privy (primary)** — `@privy-io/expo`'s `useEmbeddedEthereumWallet` (`src/privy.tsx`): email/social login provisions an embedded **Ethereum** wallet, no seed phrase. `getSigner()` wraps its EIP-1193 provider in an `ethers.BrowserProvider`. Native-only, lazily required behind `Platform.OS`; needs Injective testnet (1439) configured on the Privy app + `EXPO_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_CLIENT_ID`, and degrades to a stub without them.
  - **Burner (fallback, default without Privy)** — an `ethers.Wallet.createRandom()` secp256k1 key in the OS keychain (`expo-secure-store`). Works everywhere, including the web preview.
- **Data** — API-Football feeds (`src/feed.ts`): World Cup fixtures, live scores, 1X2 odds. Set `EXPO_PUBLIC_APISPORTS_KEY` for live data; without it, a bundled snapshot (`feed-fixtures.json`) is used, with kickoffs anchored to load time so there's always something to bet on and settle. The screens render the same `Game`/`OddsLine`/`LiveScore` shapes as before.
- **On-chain** — the `Kickpact` escrow + `KUSD` on Injective testnet, via `src/injective.ts` (ethers v6). Reads use a pinned `JsonRpcProvider(rpc, 1439, { staticNetwork: true })`; writes take a `Signer` from the wallet context. Pools settle when someone submits the oracle's EIP-712-signed final score and the contract derives the outcome on-chain; `verifySettlement()` re-recovers that signature on the phone. `createPool`/`joinPool` `approve` kUSD before staking. Deployed addresses live in `src/deployment.json` (synced by the contract deploy script).

# Peer-to-peer is Bluetooth now (NOT Hyperswarm)

Hyperswarm/Bare/`react-native-bare-kit` are **gone** — deleted with the P2P
watch-party when we left EVM. Proximity P2P is now **Google Nearby Connections**
via [`expo-nearby-connections`](https://github.com/puguhsudarma/expo-nearby-connections)
(`src/nearby.ts`), strategy `P2P_CLUSTER` (many friends). It needs the New
Architecture (on) + `react-native-nitro-modules`, a custom dev build, and
Bluetooth / location / nearby-wifi runtime permissions. It does **not** run on
web or in Expo Go, and a real handshake needs two physical devices — emulators
lack Bluetooth radios. Nearby only ever carries the social layer (chat) and the
duel invite — the pot is always an on-chain pool; P2P never touches the money.

# Polyfills are for ethers now

`polyfill.js` must load before ethers or any wallet code. It installs
`react-native-get-random-values` so ethers v6 has `crypto.getRandomValues` for
key-gen and signing on Hermes (it used to polyfill for `@solana/web3.js`), plus
`Buffer`/`process` for deps that reference them at module top level. There is
**no `react-native-quick-crypto`** — its native OpenSSL (`libcrypto.so`) isn't
packaged and crashes at startup; the pure-JS `get-random-values` path is what
ships.

# Native modules require a rebuild

Privy (`@privy-io/expo`) and `expo-nearby-connections` are native modules — any
change to them (or to native config) needs `expo prebuild` + a fresh APK, not
just a JS reload. `expo-nearby-connections@1.1.0` ships a broken
`android/build.gradle`, patched idempotently by `scripts/patch-nearby.mjs` on
postinstall.
