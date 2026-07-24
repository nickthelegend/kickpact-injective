/**
 * Wallet context — Injective EVM, self-custodial, two ways in:
 *
 *   • PRIVY (primary) — email or a social login provisions an embedded
 *     Ethereum wallet (Privy holds the key, the user never sees a seed phrase).
 *     Native-only; to broadcast, the Privy app must have Injective testnet
 *     (chainId 1439) configured.
 *   • BURNER (fallback) — a secp256k1 key generated on-device and sealed in the
 *     OS keychain, connected to our own JSON-RPC provider. Works everywhere,
 *     including the web preview.
 *
 * Reads go through `connection` (an ethers Provider); writes resolve a Signer
 * via `getSigner()` and hand it to the functions in `injective.ts`.
 */
import * as React from "react"
import { ethers } from "ethers"

import { RPC_URL, CHAIN_ID } from "./injective"
import { usePrivyWallet } from "./privy"
import { loadSecret, saveSecret, clearSecret } from "./storage"

const SECRET_KEY = "kickpact.injective.secret"

type Status = "INITIALIZING" | "NO_WALLET" | "BACKUP_PENDING" | "READY"
type Mode = "privy" | "burner"

export interface WalletContextValue {
  status: Status
  mode: Mode | null
  address: string | null
  connection: ethers.JsonRpcProvider
  inj: number
  kusd: number
  privyAvailable: boolean
  privyReady: boolean
  loginPrivy(): Promise<void>
  createBurner(): Promise<string>
  confirmBackup(): void
  importBurner(secretHex: string): Promise<void>
  /** Resolve an ethers Signer for the active wallet (privy or burner). */
  getSigner(): Promise<ethers.Signer>
  logout(): Promise<void>
  refresh(): Promise<void>
  getSecret(): Promise<string | null>
}

const WalletContext = React.createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const providerRef = React.useRef<ethers.JsonRpcProvider | null>(null)
  if (!providerRef.current) providerRef.current = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true })

  // Privy — the primary path; falls through to the keychain burner.
  const privy = usePrivyWallet()

  const [booted, setBooted] = React.useState(false)
  const [backupPending, setBackupPending] = React.useState(false)
  const [burner, setBurner] = React.useState<ethers.Wallet | null>(null)
  const [inj, setInj] = React.useState(0)
  const [kusd, setKusd] = React.useState(0)

  const mode: Mode | null = privy.address ? "privy" : burner ? "burner" : null
  const address = privy.address ?? burner?.address ?? null

  const status: Status = backupPending
    ? "BACKUP_PENDING"
    : address
      ? "READY"
      : booted
        ? "NO_WALLET"
        : "INITIALIZING"

  const refresh = React.useCallback(async () => {
    if (!address) return
    try {
      const p = providerRef.current!
      const { getKusdBalance } = await import("./injective")
      const [wei, k] = await Promise.all([p.getBalance(address), getKusdBalance(p, address)])
      setInj(Number(ethers.formatEther(wei)))
      setKusd(k)
    } catch (err) {
      console.warn("balance refresh failed", err)
    }
  }, [address])

  // Restore a stored burner on mount.
  React.useEffect(() => {
    let cancelled = false
    loadSecret(SECRET_KEY)
      .then((secret) => {
        if (!cancelled && secret) setBurner(new ethers.Wallet(secret, providerRef.current!))
      })
      .catch(() => {})
      .finally(() => !cancelled && setBooted(true))
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (status !== "READY") return
    refresh()
    const id = setInterval(refresh, 8000)
    return () => clearInterval(id)
  }, [status, refresh])

  const createBurner = React.useCallback(async () => {
    const kp = ethers.Wallet.createRandom()
    await saveSecret(SECRET_KEY, kp.privateKey)
    setBurner(new ethers.Wallet(kp.privateKey, providerRef.current!))
    setBackupPending(true)
    return kp.privateKey
  }, [])

  const confirmBackup = React.useCallback(() => setBackupPending(false), [])

  const importBurner = React.useCallback(async (secretHex: string) => {
    const cleaned = secretHex.trim()
    const kp = new ethers.Wallet(cleaned) // throws if invalid
    await saveSecret(SECRET_KEY, kp.privateKey)
    setBurner(new ethers.Wallet(kp.privateKey, providerRef.current!))
    setBackupPending(false)
  }, [])

  const getSigner = React.useCallback(async (): Promise<ethers.Signer> => {
    if (mode === "privy") {
      const s = await privy.getSigner()
      if (!s) throw new Error("Privy wallet not ready")
      return s
    }
    if (!burner) throw new Error("no wallet")
    return burner
  }, [mode, privy, burner])

  const logout = React.useCallback(async () => {
    if (mode === "privy") await privy.logout().catch(() => {})
    await clearSecret(SECRET_KEY)
    setBurner(null)
    setInj(0)
    setKusd(0)
    setBackupPending(false)
  }, [mode, privy])

  const getSecret = React.useCallback(() => loadSecret(SECRET_KEY), [])

  const value = React.useMemo<WalletContextValue>(
    () => ({
      status,
      mode,
      address,
      connection: providerRef.current!,
      inj,
      kusd,
      privyAvailable: privy.available,
      privyReady: privy.ready,
      loginPrivy: privy.login,
      createBurner,
      confirmBackup,
      importBurner,
      getSigner,
      logout,
      refresh,
      getSecret,
    }),
    [status, mode, address, inj, kusd, privy, createBurner, confirmBackup, importBurner, getSigner, logout, refresh, getSecret],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within WalletProvider")
  return ctx
}
