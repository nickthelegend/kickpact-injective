/**
 * Server-side proxy to TxLINE devnet — attaches the free-tier X-Api-Token
 * (minted by this project's on-chain subscribe) and a self-renewing guest
 * JWT, and smooths over the SSE-framed replay endpoints so the browser
 * always receives plain JSON.
 */
import { NextRequest, NextResponse } from "next/server"

const API = "https://txline-dev.txodds.com/api"
const JWT_URL = "https://txline-dev.txodds.com/auth/guest/start"
const API_TOKEN = process.env.TXLINE_API_TOKEN ?? "txoracle_api_c1cb81768c01479c887c5c5dda0e6b87"

let jwt: string | null = null
async function guestJwt(): Promise<string> {
  const r = await fetch(JWT_URL, { method: "POST" })
  jwt = (await r.json()).token
  return jwt!
}

function parseSse(text: string): unknown[] {
  const out: unknown[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue
    try {
      out.push(JSON.parse(line.slice(5).trim()))
    } catch {}
  }
  return out
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const qs = req.nextUrl.search
  const target = `${API}/${path.join("/")}${qs}`

  if (!jwt) await guestJwt()
  const doFetch = () =>
    fetch(target, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": API_TOKEN, "Accept-Encoding": "deflate" },
      cache: "no-store",
    })
  let r = await doFetch()
  if (r.status === 401) {
    await guestJwt()
    r = await doFetch()
  }
  if (!r.ok) return NextResponse.json({ error: r.status }, { status: r.status })

  const text = await r.text()
  try {
    return NextResponse.json(JSON.parse(text))
  } catch {
    return NextResponse.json(parseSse(text)) // SSE-framed replay endpoints
  }
}
