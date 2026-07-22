# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# This app is on SOLANA (solana branch)

The EVM + WDK + Pears product lives on the `evm` branch. On `solana`:

- **Wallet** — `@wallet-ui/react-native-web3js` (`MobileWalletProvider` + `useMobileWallet`) is the primary connect path; a keychain-stored ed25519 burner (`expo-secure-store`) is the fallback. See `src/wallet.tsx`. Both native-only for MWA; web falls back to burner.
- **Data** — TxLINE devnet feeds (`src/txline.ts`) replace ESPN: fixtures, live scores, StablePrice odds, and the Merkle proofs that settle pools.
- **On-chain** — the `kickpact` Anchor program (`apps/solana`) escrows kUSD pools and settles them by CPI into TxLINE's `validate_stat_v2`. Client in `src/solana.ts`.

# Peer-to-peer is Bluetooth now (NOT Hyperswarm)

Hyperswarm/Bare/`react-native-bare-kit` are **gone** — deleted with the P2P
watch-party when we left EVM. Proximity P2P is now **Google Nearby Connections**
via [`expo-nearby-connections`](https://github.com/puguhsudarma/expo-nearby-connections)
(`src/nearby.ts`), strategy `P2P_CLUSTER` (many friends). It needs the New
Architecture (on) + `react-native-nitro-modules`, a custom dev build, and
Bluetooth / location / nearby-wifi runtime permissions. It does **not** run on
web or in Expo Go, and a real handshake needs two physical devices — emulators
lack Bluetooth radios.

# Emulator gotcha (API 35)

After every `adb install`, if the app aborts on boot with a `PlatformConstants`
TurboModule error, copy `libnativehelper.so` from the ART APEX into the app's
native lib dir. (No longer strictly required once bare-kit was removed, but keep
in mind for native-crash triage.)

# Native modules require a rebuild

MWA, `react-native-quick-crypto`, and `expo-nearby-connections` are native — any
change to them needs `expo prebuild` + a fresh APK, not just a JS reload.
