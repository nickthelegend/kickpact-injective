/**
 * Privy — the primary sign-in. Email or a social account creates a
 * self-custodial embedded Solana wallet, so a first-time user is betting in
 * seconds without ever seeing a seed phrase.
 *
 * Native-only, exactly like MWA and Nearby: the web/desktop bundle must never
 * import the native module, so everything here is resolved lazily behind a
 * `Platform.OS` check and degrades to a stub. The burner path keeps working
 * untouched when Privy isn't available.
 *
 * Providers below are the ones ACTUALLY enabled on this Privy app (checked
 * against auth.privy.io/api/v1/apps/<id>) — apple and discord are disabled, so
 * listing them would render buttons that fail.
 */
import * as React from "react"
import { Platform } from "react-native"
import type { Connection, Transaction } from "@solana/web3.js"

export const PRIVY_LOGIN_METHODS = ["email", "google", "twitter", "github", "linkedin"] as const

const isNative = Platform.OS !== "web"
const APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID
const CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID

/** Privy is only usable when the native module AND the credentials are present. */
export const privyAvailable = (): boolean => isNative && !!APP_ID && !!CLIENT_ID

// ── lazy native imports (never evaluated on web) ────────────────────────────
type Mod = typeof import("@privy-io/expo")
let mod: Mod | null = null
function privy(): Mod | null {
  if (!privyAvailable()) return null
  if (!mod) {
    try {
      mod = require("@privy-io/expo")
    } catch {
      mod = null
    }
  }
  return mod
}

/**
 * Wraps the app in PrivyProvider + PrivyElements (Privy's own login modal).
 * On web, or without credentials, renders children untouched.
 */
export function PrivyHost({ children }: { children: React.ReactNode }) {
  if (!privyAvailable()) return <>{children}</>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrivyProvider } = require("@privy-io/expo")
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrivyElements } = require("@privy-io/expo/ui")
  return (
    <PrivyProvider appId={APP_ID!} clientId={CLIENT_ID!}>
      {children}
      <PrivyElements config={{ appearance: { colorScheme: "dark", accentColor: "#627eea" } }} />
    </PrivyProvider>
  )
}

export interface PrivyWallet {
  available: boolean
  address: string | null
  ready: boolean
  login(): Promise<void>
  logout(): Promise<void>
  /** Sign + send a web3.js Transaction through the embedded wallet. */
  signAndSend(tx: Transaction, connection: Connection): Promise<string>
}

const STUB: PrivyWallet = {
  available: false,
  address: null,
  ready: false,
  async login() {
    throw new Error("Privy unavailable on this platform")
  },
  async logout() {},
  async signAndSend() {
    throw new Error("Privy unavailable on this platform")
  },
}

// Platform.OS is constant for the process, so this conditional hook selection is
// stable across renders (same rule the MWA hook follows).
const useNative = privyAvailable()

export function usePrivyWallet(): PrivyWallet {
  if (!useNative) return STUB
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useRealPrivyWallet()
}

function useRealPrivyWallet(): PrivyWallet {
  const m = privy()!
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useLogin } = require("@privy-io/expo/ui")
  const { login } = useLogin()
  const { user, logout } = m.usePrivy()
  const solana = m.useEmbeddedSolanaWallet()

  const wallet = solana?.wallets?.[0] ?? null
  const address = wallet?.address ?? null

  // Once logged in, make sure an embedded Solana wallet exists (or is recovered).
  React.useEffect(() => {
    if (!user) return
    if (solana?.wallets?.length) return
    const needsRecovery = solana?.status === "needs-recovery" && !!solana.recover
    ;(async () => {
      try {
        if (needsRecovery) await solana.recover!()
        else if (solana?.create) await solana.create!()
      } catch (e) {
        console.warn("privy wallet provisioning failed", e)
      }
    })()
  }, [user, solana])

  return {
    available: true,
    address,
    ready: !!address,
    login: async () => {
      await login({ loginMethods: [...PRIVY_LOGIN_METHODS] as never })
    },
    logout: async () => {
      await logout()
    },
    signAndSend: async (tx: Transaction, connection: Connection) => {
      if (!wallet) throw new Error("no Privy wallet yet")
      const provider = await wallet.getProvider()
      const res = await provider.request({
        method: "signAndSendTransaction",
        params: { transaction: tx, connection },
      })
      return typeof res === "string" ? res : ((res as { signature: string }).signature ?? String(res))
    },
  }
}
