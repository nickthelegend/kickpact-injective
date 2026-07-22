/**
 * TxLINE devnet client — guest JWT, free-tier on-chain activation, REST + proofs.
 *
 * The free World Cup tier still requires an on-chain `subscribe` (SOL fees only,
 * no TxL payment) from the wallet that will own the API token; the backend then
 * verifies a detached ed25519 signature of `${txSig}:${leagues}:${jwt}` before
 * minting the long-lived X-Api-Token.
 */
import * as anchor from "@coral-xyz/anchor"
import { PublicKey, Keypair, Connection, Transaction, SystemProgram } from "@solana/web3.js"
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token"
import nacl from "tweetnacl"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const API = "https://txline-dev.txodds.com/api"
export const JWT_URL = "https://txline-dev.txodds.com/auth/guest/start"
export const RPC = "https://api.devnet.solana.com"
export const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG")
export const WORLD_CUP_COMPETITION_ID = 72

const here = path.dirname(fileURLToPath(import.meta.url))
export const OUT = path.join(here, "..", "out")
const AUTH_FILE = path.join(OUT, "auth.json")

export interface Auth {
  jwt: string
  apiToken: string
  wallet: string
}

/** TxLINE serves zstd which Bun's fetch mishandles — ask for deflate. */
const ENC = { "Accept-Encoding": "deflate" }

export async function guestJwt(): Promise<string> {
  const r = await fetch(JWT_URL, { method: "POST", headers: { ...ENC } })
  if (!r.ok) throw new Error(`guest/start ${r.status}`)
  return (await r.json()).token
}

export function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))))
}

export function oracleProgram(connection: Connection, payer: Keypair) {
  const idl = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "oracle", "txoracle.json"), "utf8"))
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
  })
  return { program: new anchor.Program(idl, provider), provider }
}

/** Full free-tier activation. Reuses out/auth.json when it still works. */
export async function activate(keypairPath: string): Promise<Auth> {
  const user = loadKeypair(keypairPath)

  if (fs.existsSync(AUTH_FILE)) {
    const cached: Auth = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"))
    if (cached.wallet === user.publicKey.toBase58() && cached.apiToken) {
      // JWTs expire; the api token is long-lived. Refresh the JWT and probe.
      cached.jwt = await guestJwt()
      const probe = await fetch(`${API}/fixtures/snapshot?competitionId=${WORLD_CUP_COMPETITION_ID}`, {
        headers: { ...ENC, Authorization: `Bearer ${cached.jwt}`, "X-Api-Token": cached.apiToken },
      })
      if (probe.ok) {
        fs.writeFileSync(AUTH_FILE, JSON.stringify(cached, null, 2))
        console.log("[auth] reusing cached API token")
        return cached
      }
      console.log(`[auth] cached token rejected (${probe.status}); re-activating`)
    }
  }

  const connection = new Connection(RPC, "confirmed")
  const { program } = oracleProgram(connection, user)
  console.log("[auth] oracle program:", program.programId.toBase58())

  const jwt = await guestJwt()

  // pricing matrix — display so the demo shows the free tier really is free
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], program.programId)
  const matrix: any = await (program.account as any).pricingMatrix.fetch(pricingMatrixPda)
  for (const row of matrix.rows)
    console.log(
      `[pricing] level ${row.rowId}: ${row.pricePerWeekToken} TxL/wk, sampling ${row.samplingIntervalSec}s, leagues ${row.leagueBundleId}, markets ${row.marketBundleId}`,
    )

  // Token-2022 ATA for the TxL mint must exist (subscribe references it)
  const ata = getAssociatedTokenAddressSync(TXL_MINT, user.publicKey, false, TOKEN_2022_PROGRAM_ID)
  if (!(await connection.getAccountInfo(ata))) {
    console.log("[auth] creating TxL Token-2022 ATA…")
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        user.publicKey, ata, user.publicKey, TXL_MINT, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    )
    await anchor.web3.sendAndConfirmTransaction(connection, tx, [user], { commitment: "confirmed" })
  }

  const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], program.programId)
  const treasuryVault = getAssociatedTokenAddressSync(TXL_MINT, treasuryPda, true, TOKEN_2022_PROGRAM_ID)

  // A confirmed subscribe whose activation failed can be replayed — the
  // signature binds txSig to the CURRENT jwt, so we just re-sign.
  const PENDING = path.join(OUT, "pending-subscribe.json")
  let txSig: string
  if (fs.existsSync(PENDING)) {
    txSig = JSON.parse(fs.readFileSync(PENDING, "utf8")).txSig
    console.log("[auth] reusing pending subscribe tx:", txSig)
  } else {
    const SERVICE_LEVEL = 1
    const WEEKS = 4
    console.log(`[auth] subscribing on-chain: level ${SERVICE_LEVEL}, ${WEEKS} weeks…`)
    const tx = await (program.methods as any)
      .subscribe(SERVICE_LEVEL, WEEKS)
      .accounts({
        user: user.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: TXL_MINT,
        userTokenAccount: ata,
        tokenTreasuryVault: treasuryVault,
        tokenTreasuryPda: treasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction()
    const bh = await connection.getLatestBlockhash("confirmed")
    tx.recentBlockhash = bh.blockhash
    tx.feePayer = user.publicKey
    tx.sign(user)
    txSig = await connection.sendRawTransaction(tx.serialize())
    await connection.confirmTransaction({ signature: txSig, ...bh }, "confirmed")
    console.log("[auth] subscribe tx:", txSig)
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(PENDING, JSON.stringify({ txSig }))
  }

  // detached signature over `${txSig}:${leagues}:${jwt}` — leagues empty = standard bundle
  const message = new TextEncoder().encode(`${txSig}:${""}:${jwt}`)
  const walletSignature = Buffer.from(nacl.sign.detached(message, user.secretKey)).toString("base64")

  const act = await fetch(`${API}/token/activate`, {
    method: "POST",
    headers: { ...ENC, "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature, leagues: [] }),
  })
  if (!act.ok) throw new Error(`token/activate ${act.status}: ${await act.text()}`)
  const raw = await act.text()
  let apiToken: string
  try {
    const body = JSON.parse(raw)
    apiToken = typeof body === "string" ? body : (body?.token ?? raw)
  } catch {
    apiToken = raw
  }
  const auth: Auth = { jwt, apiToken, wallet: user.publicKey.toBase58() }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2))
  fs.rmSync(PENDING, { force: true })
  console.log("[auth] API token acquired ✅")
  return auth
}

/** Authed GET with automatic guest-JWT renewal on 401. */
export async function get(auth: Auth, pathname: string): Promise<any> {
  const doFetch = () =>
    fetch(`${API}${pathname}`, {
      headers: { ...ENC, Authorization: `Bearer ${auth.jwt}`, "X-Api-Token": auth.apiToken },
    })
  let r = await doFetch()
  if (r.status === 401) {
    auth.jwt = await guestJwt()
    fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2))
    r = await doFetch()
  }
  if (!r.ok) throw new Error(`GET ${pathname} → ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return r.json()
}

/**
 * The replay endpoints (/scores/updates, /scores/historical) answer in
 * SSE framing even over plain GET — `data:`/`event:`/`id:` lines. Parse
 * every `data:` line into its JSON payload.
 */
export function parseSse(text: string): any[] {
  const out: any[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue
    const body = line.slice(5).trim()
    if (!body) continue
    try {
      out.push(JSON.parse(body))
    } catch {}
  }
  return out
}

/** Authed GET returning SSE-framed records as an array. */
export async function getSse(auth: Auth, pathname: string): Promise<any[]> {
  const doFetch = () =>
    fetch(`${API}${pathname}`, {
      headers: { ...ENC, Authorization: `Bearer ${auth.jwt}`, "X-Api-Token": auth.apiToken },
    })
  let r = await doFetch()
  if (r.status === 401) {
    auth.jwt = await guestJwt()
    fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2))
    r = await doFetch()
  }
  if (!r.ok) throw new Error(`GET ${pathname} → ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return parseSse(await r.text())
}
