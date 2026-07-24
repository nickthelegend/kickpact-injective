/** Load apps/injective/.env regardless of the process cwd. */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

export function loadEnv() {
  const envPath = path.join(here, "..", "..", ".env")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

export function deployments() {
  return JSON.parse(fs.readFileSync(path.join(here, "..", "..", "deployments.json"), "utf8"))
}

export function kickpactAbi() {
  return JSON.parse(fs.readFileSync(path.join(here, "..", "..", "abi", "Kickpact.json"), "utf8"))
}
