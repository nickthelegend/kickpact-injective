/**
 * Dashboard data layer — TxLINE via the local proxy + Kickpact pools straight
 * from devnet (browser-side web3.js).
 */
import { Program } from "@coral-xyz/anchor"
import { Connection, PublicKey } from "@solana/web3.js"
import kickpactIdl from "../idl/kickpact.json"
import snapshot from "./txline-fixtures.cache.json"

export const WORLD_CUP = 72
export const KICKPACT_ID = (kickpactIdl as { address: string }).address
export const TXORACLE_ID = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
export const RPC = "https://api.devnet.solana.com"
export const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`
export const EXPLORER_ACCT = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`

const tx = (p: string) => fetch(`/api/txline/${p}`).then((r) => r.json())

export interface Fixture {
  FixtureId: number
  StartTime: number
  Participant1: string
  Participant2: string
}

/**
 * Feed status — the board reads this to say whether it's live.
 *
 * TxODDS waived World Cup data fees only through 19 Jul 2026 23:59 UTC, but
 * judging runs to 29 Jul. When the token starts 403'ing we fall back to a real
 * snapshot captured from the live feed and label it CACHED. It is never shown
 * as live. The pools/receipts half of this dashboard reads Solana directly and
 * is unaffected.
 */
export const feed: { live: boolean; capturedAt: string | null } = { live: true, capturedAt: null }

export async function fixtures(): Promise<Fixture[]> {
  const startEpochDay = Math.floor(Date.now() / 86_400_000) - 25
  let raw: Fixture[]
  try {
    raw = await tx(`fixtures/snapshot?competitionId=${WORLD_CUP}&startEpochDay=${startEpochDay}`)
    if (!Array.isArray(raw)) throw new Error("feed returned no fixture array")
    feed.live = true
    feed.capturedAt = null
  } catch {
    const snap = snapshot as { capturedAt: string; fixtures: Fixture[] }
    raw = snap.fixtures
    feed.live = false
    feed.capturedAt = snap.capturedAt
  }
  const byId = new Map<number, Fixture>()
  for (const f of raw) byId.set(f.FixtureId, f)
  return [...byId.values()].sort((a, b) => a.StartTime - b.StartTime)
}

export interface Score {
  home: number | null
  away: number | null
  phase: number
  seq: number
  clockSec: number | null
}

export async function score(fixtureId: number): Promise<Score | null> {
  const snap = await tx(`scores/snapshot/${fixtureId}`)
  const rec = Array.isArray(snap) && snap.length ? snap[snap.length - 1] : null
  if (!rec) return null
  const total = (side: string) => rec.Score?.[side]?.Total?.Goals ?? (rec.StatusId >= 2 ? 0 : null)
  return {
    home: total("Participant1"),
    away: total("Participant2"),
    phase: rec.StatusId ?? 0,
    seq: rec.Seq ?? 0,
    clockSec: rec.Clock?.Seconds ?? null,
  }
}

export interface Odds {
  home: number | null
  draw: number | null
  away: number | null
  pct: [number, number, number] | null
  ts: number
}

export async function odds(fixtureId: number): Promise<Odds | null> {
  const pick = (arr: unknown[]): Odds | null => {
    const rows = (arr as Record<string, unknown>[]).filter((o) => o.SuperOddsType === "1X2_PARTICIPANT_RESULT")
    if (!rows.length) return null
    const o = rows[rows.length - 1] as { Prices?: number[]; Pct?: string[]; Ts?: number }
    const [h, d, a] = o.Prices ?? []
    return {
      home: h ? h / 1000 : null,
      draw: d ? d / 1000 : null,
      away: a ? a / 1000 : null,
      pct: o.Pct && o.Pct[0] !== "NA" ? (o.Pct.map(Number) as [number, number, number]) : null,
      ts: o.Ts ?? 0,
    }
  }
  try {
    const line = pick(await tx(`odds/snapshot/${fixtureId}`))
    if (line) return line
  } catch {}
  for (let i = 0; i < 24; i++) {
    const t = new Date(Date.now() - i * 300_000)
    const spec = `${Math.floor(t.getTime() / 86_400_000)}/${t.getUTCHours()}/${Math.floor(t.getUTCMinutes() / 5)}`
    try {
      const line = pick(await tx(`odds/updates/${spec}?fixtureId=${fixtureId}`))
      if (line) return line
    } catch {}
  }
  return null
}

export const proof = (fixtureId: number, seq: number) =>
  tx(`scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKeys=1,2`)

// ── pools from devnet ──
export interface Pool {
  id: string
  address: string
  fixtureId: number
  stake: number
  pot: number
  memberCount: number
  pickCounts: [number, number, number]
  settled: boolean
  result: number
  winners: number
  deadlineMs: number
  kickoffMs: number
  creator: string
}

let conn: Connection | null = null
export function connection(): Connection {
  if (!conn) conn = new Connection(RPC, "confirmed")
  return conn
}

export async function pools(): Promise<Pool[]> {
  const program = new Program(kickpactIdl as never, { connection: connection() })
  const all = await (program.account as never as Record<string, { all(): Promise<{ publicKey: PublicKey; account: Record<string, unknown> }[]> }>).pool.all()
  return all
    .map(({ publicKey, account: a }) => ({
      id: String(a.id),
      address: publicKey.toBase58(),
      fixtureId: Number(a.fixtureId),
      stake: Number(a.stake) / 1e6,
      pot: (Number(a.stake) / 1e6) * Number(a.memberCount),
      memberCount: Number(a.memberCount),
      pickCounts: a.pickCounts as [number, number, number],
      settled: Boolean(a.settled),
      result: Number(a.result),
      winners: Number(a.winners),
      deadlineMs: Number(a.deadlineMs),
      kickoffMs: Number(a.kickoffMs),
      creator: (a.creator as PublicKey).toBase58(),
    }))
    .sort((x, y) => Number(y.id) - Number(x.id))
}

export async function latestTx(address: string): Promise<string | null> {
  const sigs = await connection().getSignaturesForAddress(new PublicKey(address), { limit: 1 })
  return sigs[0]?.signature ?? null
}

const FLAGS: Record<string, string> = {
  Argentina: "🇦🇷", Brazil: "🇧🇷", France: "🇫🇷", England: "🏴", Spain: "🇪🇸",
  Germany: "🇩🇪", Portugal: "🇵🇹", Netherlands: "🇳🇱", Belgium: "🇧🇪", Italy: "🇮🇹",
  Croatia: "🇭🇷", Morocco: "🇲🇦", Japan: "🇯🇵", Mexico: "🇲🇽", Uruguay: "🇺🇾",
  Switzerland: "🇨🇭", Colombia: "🇨🇴", Senegal: "🇸🇳", Ghana: "🇬🇭", Egypt: "🇪🇬",
  Norway: "🇳🇴", Poland: "🇵🇱", Denmark: "🇩🇰", Sweden: "🇸🇪", Austria: "🇦🇹",
  Ecuador: "🇪🇨", Canada: "🇨🇦", Australia: "🇦🇺", Qatar: "🇶🇦", Wales: "🏴",
  Scotland: "🏴", Serbia: "🇷🇸", Ukraine: "🇺🇦", Turkey: "🇹🇷", Nigeria: "🇳🇬",
}
export const flag = (n: string) => FLAGS[n] ?? "⚽️"
export const phaseLabel = (p: number, clockSec: number | null) =>
  p === 5 ? "FT" : p === 3 ? "HT" : p === 1 || p === 0 ? "" : clockSec != null ? `${Math.floor(clockSec / 60)}'` : "LIVE"
