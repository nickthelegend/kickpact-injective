/**
 * Wallet context — Solana, self-custodial, two ways in:
 *
 *   • CONNECT (primary) — Mobile Wallet Adapter via @wallet-ui/react-native-web3js.
 *     A real wallet app (Phantom / Solflare / fakewallet) holds the keys and
 *     signs; we only ever see the public key. The connection persists across
 *     launches (the library stores the auth token), so it reconnects silently.
 *   • BURNER (fallback) — an ed25519 keypair generated on-device and sealed in
 *     the OS keychain, for when there's no wallet app installed or on web.
 *
 * MWA is native-only. On web the hook is a stub and only the burner path runs,
 * so the web preview never crashes.
 */
import * as React from "react"
import { Platform } from "react-native"
import { Keypair, PublicKey, Transaction, Connection } from "@solana/web3.js"
import bs58 from "bs58"

import { RPC_URL } from "./solana"
import { usePrivyWallet, privyAvailable } from "./privy"
import { loadSecret, saveSecret, clearSecret } from "./storage"

// Native-only MWA hook; a stable stub on web (Platform.OS is constant per run,
// so this conditional require keeps the hook call order stable).
let useMobileWallet: () => any = () => ({ account: null })
if (Platform.OS !== "web") {
  try {
    useMobileWallet = require("@wallet-ui/react-native-web3js").useMobileWallet
  } catch {
    /* keep stub */
  }
}

const SECRET_KEY = "kickpact.solana.secret"

type Status = "INITIALIZING" | "NO_WALLET" | "BACKUP_PENDING" | "READY"
type Mode = "privy" | "mwa" | "burner"

export interface WalletContextValue {
  status: Status
  mode: Mode | null
  address: string | null
  publicKey: PublicKey | null
  connection: Connection
  sol: number
  kusd: number
  mwaAvailable: boolean
  privyAvailable: boolean
  privyReady: boolean
  loginPrivy(): Promise<void>
  connect(): Promise<void>
  createBurner(): Promise<string>
  confirmBackup(): void
  importBurner(secretBase58: string): Promise<void>
  signAndSend(tx: Transaction): Promise<string>
  logout(): Promise<void>
  refresh(): Promise<void>
  getSecret(): Promise<string | null>
}

const WalletContext = React.createContext<WalletContextValue | null>(null)

const mwaAccountPk = (account: any): PublicKey | null => {
  if (!account) return null
  try {
    if (account.publicKey) return new PublicKey(account.publicKey)
    if (account.address) return new PublicKey(account.address)
  } catch {}
  return null
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const connectionRef = React.useRef<Connection | null>(null)
  if (!connectionRef.current) connectionRef.current = new Connection(RPC_URL, { commitment: "confirmed" })

  const mwa = useMobileWallet()
  const mwaAvailable = Platform.OS !== "web"
  const mwaPk = mwaAccountPk(mwa?.account)

  // Privy — the primary path. An embedded Solana wallet from an email/social
  // login; falls through to MWA then burner when it isn't connected.
  const privy = usePrivyWallet()
  const privyPk = React.useMemo(() => {
    if (!privy.address) return null
    try {
      return new PublicKey(privy.address)
    } catch {
      return null
    }
  }, [privy.address])

  const [booted, setBooted] = React.useState(false)
  const [backupPending, setBackupPending] = React.useState(false)
  const [burner, setBurner] = React.useState<Keypair | null>(null)
  const [sol, setSol] = React.useState(0)
  const [kusd, setKusd] = React.useState(0)

  // effective identity — MWA wins when connected, else the burner
  const mode: Mode | null = privyPk ? "privy" : mwaPk ? "mwa" : burner ? "burner" : null
  const publicKey = privyPk ?? mwaPk ?? burner?.publicKey ?? null

  // Status is derived, never a racing state machine.
  const status: Status = backupPending
    ? "BACKUP_PENDING"
    : publicKey
      ? "READY"
      : booted
        ? "NO_WALLET"
        : "INITIALIZING"

  const refresh = React.useCallback(async () => {
    if (!publicKey) return
    try {
      const conn = connectionRef.current!
      const { getKusdBalance } = await import("./solana")
      const [lamports, k] = await Promise.all([conn.getBalance(publicKey), getKusdBalance(conn, publicKey)])
      setSol(lamports / 1e9)
      setKusd(k)
    } catch (err) {
      console.warn("balance refresh failed", err)
    }
  }, [publicKey])

  // Restore a stored burner on mount (MWA restores itself via the library).
  React.useEffect(() => {
    let cancelled = false
    loadSecret(SECRET_KEY)
      .then((secret) => {
        if (!cancelled && secret) setBurner(Keypair.fromSecretKey(bs58.decode(secret)))
      })
      .catch(() => {})
      .finally(() => !cancelled && setBooted(true))
    return () => {
      cancelled = true
    }
  }, [])

  // Poll balances while signed in.
  React.useEffect(() => {
    if (status !== "READY") return
    refresh()
    const id = setInterval(refresh, 8000)
    return () => clearInterval(id)
  }, [status, refresh])

  const connect = React.useCallback(async () => {
    if (!mwa?.connect) throw new Error("wallet connect unavailable")
    await mwa.connect()
  }, [mwa])

  const createBurner = React.useCallback(async () => {
    const kp = Keypair.generate()
    const secret = bs58.encode(kp.secretKey)
    await saveSecret(SECRET_KEY, secret)
    setBurner(kp)
    setBackupPending(true)
    return secret
  }, [])

  const confirmBackup = React.useCallback(() => setBackupPending(false), [])

  const importBurner = React.useCallback(async (secretBase58: string) => {
    const cleaned = secretBase58.trim()
    const kp = Keypair.fromSecretKey(bs58.decode(cleaned)) // throws if invalid
    await saveSecret(SECRET_KEY, cleaned)
    setBurner(kp)
    setBackupPending(false)
  }, [])

  const signAndSend = React.useCallback(
    async (tx: Transaction): Promise<string> => {
      const conn = connectionRef.current!
      const bh = await conn.getLatestBlockhash("confirmed")
      if (mode === "privy") {
        tx.recentBlockhash = bh.blockhash
        tx.feePayer = privyPk!
        const sig = await privy.signAndSend(tx, conn)
        await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed")
        return sig
      }
      if (mode === "mwa") {
        tx.recentBlockhash = bh.blockhash
        tx.feePayer = mwaPk!
        const sig = await mwa.signAndSendTransaction(tx)
        const signature = typeof sig === "string" ? sig : bs58.encode(sig)
        await conn.confirmTransaction({ signature, ...bh }, "confirmed")
        return signature
      }
      if (!burner) throw new Error("no wallet")
      tx.recentBlockhash = bh.blockhash
      tx.feePayer = burner.publicKey
      tx.sign(burner)
      const sig = await conn.sendRawTransaction(tx.serialize())
      await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed")
      return sig
    },
    [mode, mwa, mwaPk, burner, privy, privyPk],
  )

  const logout = React.useCallback(async () => {
    if (mode === "privy") await privy.logout().catch(() => {})
    if (mode === "mwa" && mwa?.disconnect) await mwa.disconnect().catch(() => {})
    await clearSecret(SECRET_KEY)
    setBurner(null)
    setSol(0)
    setKusd(0)
    setBackupPending(false)
  }, [mode, mwa, privy])

  const getSecret = React.useCallback(() => loadSecret(SECRET_KEY), [])

  const value = React.useMemo<WalletContextValue>(
    () => ({
      status,
      mode,
      address: publicKey?.toBase58() ?? null,
      publicKey,
      connection: connectionRef.current!,
      sol,
      kusd,
      mwaAvailable,
      privyAvailable: privy.available,
      privyReady: privy.ready,
      loginPrivy: privy.login,
      connect,
      createBurner,
      confirmBackup,
      importBurner,
      signAndSend,
      logout,
      refresh,
      getSecret,
    }),
    [status, mode, publicKey, sol, kusd, mwaAvailable, privy, connect, createBurner, confirmBackup, importBurner, signAndSend, logout, refresh, getSecret],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within WalletProvider")
  return ctx
}
