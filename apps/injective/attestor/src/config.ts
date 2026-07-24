/**
 * Shared config for the attestor: apps/injective/.env + deployments.json.
 *
 * Mirrors keeper/src/env.ts so the two processes read the same secrets and the
 * same deployed addresses. Private keys are only ever turned into wallets —
 * never logged, never echoed in a response.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

/** apps/injective — the package root, two levels above src/. */
export const INJECTIVE_ROOT = path.join(here, "..", "..")

export function loadEnv() {
  const envPath = path.join(INJECTIVE_ROOT, ".env")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

export interface Deployments {
  network: string
  chainId: number
  rpc: string
  explorer: string
  kusd: string
  kickpact: string
  usdc?: string | null
  kickpactUsdc?: string | null
  /** M-of-N oracle key set configured on the escrow. */
  oracleSigners?: string[]
  /** Older single-signer deployments. */
  oracleSigner?: string
  threshold?: number
}

export function deployments(): Deployments {
  return JSON.parse(fs.readFileSync(path.join(INJECTIVE_ROOT, "deployments.json"), "utf8"))
}

/** The escrow addresses an attestation can be bound to, by short name. */
export function escrows(d: Deployments): Record<string, string> {
  const out: Record<string, string> = {}
  if (d.kickpact) out.kusd = d.kickpact
  if (d.kickpactUsdc) out.usdc = d.kickpactUsdc
  return out
}

/** The deployed oracle key set (array form, tolerating the legacy single key). */
export function deployedSigners(d: Deployments): string[] {
  if (d.oracleSigners?.length) return d.oracleSigners
  return d.oracleSigner ? [d.oracleSigner] : []
}
