/**
 * Privy — the primary sign-in. Email or a social account creates a
 * self-custodial embedded **Ethereum** wallet (Injective is EVM), so a
 * first-time user is betting in seconds without ever seeing a seed phrase.
 *
 * Native-only, exactly like Nearby: the web bundle must never import the native
 * module, so everything here is resolved lazily behind a `Platform.OS` check
 * and degrades to a stub. The keychain burner path keeps working untouched when
 * Privy isn't available.
 *
 * Providers below are the ones ACTUALLY enabled on this Privy app — apple and
 * discord are disabled, so listing them would render buttons that fail.
 */
import * as React from "react"
import { Platform } from "react-native"
import { ethers } from "ethers"

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
  /** An ethers Signer backed by the embedded EVM wallet, or null if not ready. */
  getSigner(): Promise<ethers.Signer | null>
}

const STUB: PrivyWallet = {
  available: false,
  address: null,
  ready: false,
  async login() {
    throw new Error("Privy unavailable on this platform")
  },
  async logout() {},
  async getSigner() {
    return null
  },
}

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
  const eth = m.useEmbeddedEthereumWallet()

  const wallet = eth?.wallets?.[0] ?? null
  const address = wallet?.address ?? null

  // Once logged in, make sure an embedded Ethereum wallet exists.
  React.useEffect(() => {
    if (!user) return
    if (eth?.wallets?.length) return
    ;(async () => {
      try {
        if (eth?.create) await eth.create()
      } catch (e) {
        console.warn("privy wallet provisioning failed", e)
      }
    })()
  }, [user, eth])

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
    getSigner: async () => {
      if (!wallet) return null
      const eip1193 = await wallet.getProvider()
      const browser = new ethers.BrowserProvider(eip1193 as any)
      return browser.getSigner()
    },
  }
}
