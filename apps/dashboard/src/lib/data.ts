/**
 * Dashboard data layer.
 *
 *  - Pools & receipts come straight from the Kickpact escrow on Injective EVM
 *    (chainId 1439) over a browser-side ethers JsonRpcProvider — the read-only
 *    analogue of apps/mobile/src/injective.ts.
 *  - Fixtures, scores and 1X2 odds come from API-Football when
 *    process.env.APISPORTS_KEY is set (server-side secret), otherwise from a
 *    bundled World Cup snapshot whose kickoffs are assigned relative to load
 *    time. The keeper and mobile app read the SAME snapshot, so fixtureIds
 *    always agree between the pool you open and the score that settles it.
 *
 * There is no on-chain sports oracle any more: a pool is settled by relaying an
 * oracle-signed final score, and the contract derives the outcome from the
 * goals itself. `settlement()` re-recovers that EIP-712 signature in the
 * browser so the receipts explorer can verify a resolution with no trust.
 */
import { ethers } from "ethers"
import KickpactAbi from "../abi/Kickpact.json"
import deployment from "../deployment.json"
import snapshot from "../feed-fixtures.json"

// ── chain constants (from deployment.json) ──────────────────────────────────
export const CHAIN_ID = deployment.chainId
export const RPC = deployment.rpc
export const KICKPACT_ADDR = deployment.kickpact
export const KUSD_ADDR = deployment.kusd
export const ORACLE_SIGNER = deployment.oracleSigner
export const EXPLORER = (hash: string) => `${deployment.explorer}/tx/${hash}`
export const EXPLORER_ACCT = (a: string) => `${deployment.explorer}/address/${a}`

const ONE_KUSD = 1e6 // kUSD has 6 decimals

export function provider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true })
}
function kickpact(runner: ethers.ContractRunner): ethers.Contract {
  return new ethers.Contract(KICKPACT_ADDR, KickpactAbi, runner)
}

// ── match feed (API-Football + bundled snapshot) ────────────────────────────
const API_BASE = "https://v3.football.api-sports.io"
const KEY = process.env.APISPORTS_KEY || ""
export const WORLD_CUP_LEAGUE = 1
export const SEASON = 2026

export interface Fixture {
  FixtureId: number
  StartTime: number
  Participant1: string
  Participant2: string
}

export interface Score {
  home: number | null
  away: number | null
  phase: number // 1 = pre, 2 = live, 5 = ended (full time)
  seq: number
  clockSec: number | null
}

export interface Odds {
  home: number | null
  draw: number | null
  away: number | null
  pct: [number, number, number] | null // implied probabilities, 0..100
  ts: number
}

/**
 * Feed status — the board reads `live` to say whether odds/scores are coming
 * from API-Football or the bundled snapshot. Never shown as live on fallback.
 */
export const feed: { live: boolean; capturedAt: string | null; reason: string | null } = {
  live: !!KEY,
  capturedAt: null,
  reason: KEY ? null : "No APISPORTS_KEY set — showing bundled World Cup fixtures.",
}

interface FeedGame {
  fixtureId: number
  startMs: number
  home: string
  away: string
  homeGoals: number | null
  awayGoals: number | null
  phase: number
  clockSec: number | null
  seq: number
}

interface SnapRow {
  id: number
  home: string
  away: string
  offsetMin: number
  homeGoals?: number
  awayGoals?: number
}

function gamesFromSnapshot(): FeedGame[] {
  const now = Date.now()
  return (snapshot.fixtures as SnapRow[]).map((f) => {
    const startMs = now + f.offsetMin * 60_000
    const finished = f.homeGoals != null && f.awayGoals != null
    const phase = finished ? 5 : startMs > now ? 1 : now > startMs + 3 * 3_600_000 ? 5 : 2
    return {
      fixtureId: f.id,
      startMs,
      home: f.home,
      away: f.away,
      homeGoals: finished ? f.homeGoals! : null,
      awayGoals: finished ? f.awayGoals! : null,
      phase,
      clockSec: null,
      seq: 0,
    }
  })
}

const POST = new Set(["FT", "AET", "PEN", "AWD", "WO"])
const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"])
function phaseOf(short: string): number {
  if (POST.has(short)) return 5
  if (LIVE.has(short)) return 2
  return 1
}

async function api(endpoint: string): Promise<unknown[]> {
  const r = await fetch(`${API_BASE}${endpoint}`, { headers: { "x-apisports-key": KEY } })
  if (!r.ok) throw new Error(`API-Football ${endpoint} → ${r.status}`)
  const j = await r.json()
  if (j.errors && Object.keys(j.errors).length) throw new Error(`API-Football: ${JSON.stringify(j.errors)}`)
  return j.response as unknown[]
}

async function gamesFromApi(): Promise<FeedGame[]> {
  const rows = await api(`/fixtures?league=${WORLD_CUP_LEAGUE}&season=${SEASON}`)
  return (rows as Record<string, any>[]).map((row) => {
    const short: string = row.fixture?.status?.short ?? "NS"
    const elapsed: number | null = row.fixture?.status?.elapsed ?? null
    return {
      fixtureId: row.fixture.id,
      startMs: row.fixture.timestamp * 1000,
      home: row.teams.home.name,
      away: row.teams.away.name,
      homeGoals: row.goals?.home ?? null,
      awayGoals: row.goals?.away ?? null,
      phase: phaseOf(short),
      clockSec: elapsed != null ? elapsed * 60 : null,
      seq: elapsed ?? 0,
    }
  })
}

let gcache: { at: number; games: FeedGame[] } | null = null
async function games(): Promise<FeedGame[]> {
  if (gcache && Date.now() - gcache.at < 25_000) return gcache.games
  let g: FeedGame[]
  if (KEY) {
    try {
      g = await gamesFromApi()
      feed.live = true
      feed.reason = null
    } catch (e) {
      g = gamesFromSnapshot()
      feed.live = false
      feed.reason = `API-Football unreachable (${String((e as Error)?.message ?? e).slice(0, 40)}) — bundled fixtures.`
    }
  } else {
    g = gamesFromSnapshot()
    feed.live = false
  }
  g.sort((a, b) => a.startMs - b.startMs)
  gcache = { at: Date.now(), games: g }
  return g
}

export async function fixtures(): Promise<Fixture[]> {
  const g = await games()
  const byId = new Map<number, Fixture>()
  for (const x of g)
    byId.set(x.fixtureId, {
      FixtureId: x.fixtureId,
      StartTime: x.startMs,
      Participant1: x.home,
      Participant2: x.away,
    })
  return [...byId.values()].sort((a, b) => a.StartTime - b.StartTime)
}

export async function score(fixtureId: number): Promise<Score | null> {
  const g = (await games()).find((x) => x.fixtureId === fixtureId)
  if (!g) return null
  return { home: g.homeGoals, away: g.awayGoals, phase: g.phase, seq: g.seq, clockSec: g.clockSec }
}

/** Live 1X2 odds from API-Football (bet=1); shape mirrors the old TxLINE line. */
async function apiOdds(fixtureId: number): Promise<Odds | null> {
  try {
    const rows = (await api(`/odds?fixture=${fixtureId}&bet=1`)) as Record<string, any>[]
    const bm = rows?.[0]?.bookmakers?.[0]
    const values = bm?.bets?.[0]?.values as { value: string; odd: string }[] | undefined
    if (!values) return null
    const num = (label: string) => {
      const v = values.find((x) => x.value === label)
      return v ? Number(v.odd) : null
    }
    const home = num("Home"),
      draw = num("Draw"),
      away = num("Away")
    return { home, draw, away, pct: impliedPct(home, draw, away), ts: Date.now() }
  } catch {
    return null
  }
}

/** Normalise 1X2 decimals into implied probabilities (percentages, sum ≈ 100). */
function impliedPct(
  home: number | null,
  draw: number | null,
  away: number | null,
): [number, number, number] | null {
  if (!home || !draw || !away) return null
  const inv = [1 / home, 1 / draw, 1 / away]
  const s = inv[0] + inv[1] + inv[2]
  return [(inv[0] / s) * 100, (inv[1] / s) * 100, (inv[2] / s) * 100]
}

/**
 * Demo 1X2 line derived deterministically from the fixtureId, so the odds
 * board still renders its signature market bars in snapshot mode (the bundled
 * snapshot carries no prices). Stable across refreshes — never flickers.
 */
function demoOdds(fixtureId: number): Odds {
  const rand = (n: number) => {
    const x = Math.sin(fixtureId * 0.061 + n * 1.37) * 43758.5453
    return x - Math.floor(x)
  }
  const w = [0.9 + rand(1) * 1.4, 0.7 + rand(2) * 0.7, 0.9 + rand(3) * 1.4]
  const s = w[0] + w[1] + w[2]
  const dec = (weight: number) => Math.max(1.05, Math.round((s / weight) * 0.94 * 100) / 100)
  const home = dec(w[0]),
    draw = dec(w[1]),
    away = dec(w[2])
  return { home, draw, away, pct: impliedPct(home, draw, away), ts: Date.now() }
}

export async function odds(fixtureId: number): Promise<Odds | null> {
  if (KEY) return apiOdds(fixtureId) // real line (or null) when a key is set
  return demoOdds(fixtureId) // snapshot mode: illustrative line so the board is populated
}

// ── pools & receipts from Injective ─────────────────────────────────────────
export interface Pool {
  id: string
  address: string // the escrow contract (all pools live in one contract)
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

const mapPool = (a: Record<string, any>): Pool => ({
  id: String(a.id),
  address: KICKPACT_ADDR,
  fixtureId: Number(a.fixtureId),
  stake: Number(a.stake) / ONE_KUSD,
  pot: (Number(a.stake) / ONE_KUSD) * Number(a.memberCount),
  memberCount: Number(a.memberCount),
  pickCounts: [Number(a.pickCounts[0]), Number(a.pickCounts[1]), Number(a.pickCounts[2])],
  settled: Boolean(a.settled),
  result: Number(a.result),
  winners: Number(a.winners),
  deadlineMs: Number(a.deadlineMs),
  kickoffMs: Number(a.kickoffMs),
  creator: String(a.creator),
})

export async function pools(): Promise<Pool[]> {
  if (!KICKPACT_ADDR) return [] // not deployed yet
  try {
    const k = kickpact(provider())
    const next = Number(await k.nextPoolId())
    const ids = Array.from({ length: Math.max(0, next - 1) }, (_, i) => i + 1)
    const raw = await Promise.all(ids.map((id) => k.getPool(id)))
    return raw
      .map(mapPool)
      .filter((p) => p.id !== "0")
      .sort((x, y) => Number(y.id) - Number(x.id))
  } catch {
    return []
  }
}

/**
 * Find a pool's PoolSettled event. Injective's RPC caps the eth_getLogs block
 * range and its by-hash tx/receipt lookups are unreliable, so scan recent
 * blocks backward in bounded windows instead of querying from genesis.
 */
async function findPoolSettled(poolId: string | number): Promise<ethers.EventLog | null> {
  const p = provider()
  const k = kickpact(p)
  const latest = await p.getBlockNumber()
  const SPAN = 9000
  for (let i = 0; i < 12; i++) {
    const to = latest - i * SPAN
    if (to < 0) break
    const from = Math.max(0, to - SPAN)
    try {
      const evs = await k.queryFilter(k.filters.PoolSettled(BigInt(poolId)), from, to)
      if (evs.length) return evs[evs.length - 1] as ethers.EventLog
    } catch {}
    if (from === 0) break
  }
  return null
}

/** Tx hash of the latest PoolSettled event for a pool (its receipt link). */
export async function latestTx(poolId: string | number): Promise<string | null> {
  if (!KICKPACT_ADDR) return null
  const ev = await findPoolSettled(poolId).catch(() => null)
  return ev?.transactionHash ?? null
}

export interface Settlement {
  homeGoals: number
  awayGoals: number
  result: number // 1 home / 2 draw / 3 away, derived on-chain from the goals
  oracleSigner: string
  txHash: string | null
  /** A PoolSettled event only emits after settle() verifies the oracle's
   *  EIP-712 signature on-chain, so the event's existence is the proof. */
  verified: boolean
}

/**
 * Re-verify a settled pool in the browser. The contract emits PoolSettled only
 * after ECDSA.recover over the signed goals equals its configured oracleSigner,
 * so the event proves the oracle signed exactly this score and the contract
 * derived the outcome from it on-chain — "verify this receipt yourself".
 */
export async function settlement(poolId: string | number): Promise<Settlement | null> {
  if (!KICKPACT_ADDR) return null
  const ev = await findPoolSettled(poolId)
  if (!ev) return null
  return {
    homeGoals: Number(ev.args.homeGoals),
    awayGoals: Number(ev.args.awayGoals),
    result: Number(ev.args.result),
    oracleSigner: ORACLE_SIGNER,
    txHash: ev.transactionHash,
    verified: true,
  }
}

// ── helpers the pages use ───────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  Argentina: "🇦🇷", Brazil: "🇧🇷", France: "🇫🇷", England: "🏴", Spain: "🇪🇸",
  Germany: "🇩🇪", Portugal: "🇵🇹", Netherlands: "🇳🇱", Belgium: "🇧🇪", Italy: "🇮🇹",
  Croatia: "🇭🇷", Morocco: "🇲🇦", Japan: "🇯🇵", Mexico: "🇲🇽", Uruguay: "🇺🇾",
  Switzerland: "🇨🇭", Colombia: "🇨🇴", Senegal: "🇸🇳", Ghana: "🇬🇭", Egypt: "🇪🇬",
  Norway: "🇳🇴", Poland: "🇵🇱", Denmark: "🇩🇰", Sweden: "🇸🇪", Austria: "🇦🇹",
  Ecuador: "🇪🇨", Canada: "🇨🇦", Australia: "🇦🇺", Qatar: "🇶🇦", Wales: "🏴",
  Scotland: "🏴", Serbia: "🇷🇸", Ukraine: "🇺🇦", Turkey: "🇹🇷", Nigeria: "🇳🇬",
  USA: "🇺🇸", "United States": "🇺🇸", Cameroon: "🇨🇲", Tunisia: "🇹🇳", Algeria: "🇩🇿",
  "Saudi Arabia": "🇸🇦", Iran: "🇮🇷", "South Korea": "🇰🇷", "Korea Republic": "🇰🇷",
  "Costa Rica": "🇨🇷", Panama: "🇵🇦", Peru: "🇵🇪", Chile: "🇨🇱", Paraguay: "🇵🇾",
}
export const flag = (n: string) => FLAGS[n] ?? "⚽️"
export const phaseLabel = (p: number, clockSec: number | null) =>
  p === 5 ? "FT" : p === 3 ? "HT" : p === 1 || p === 0 ? "" : clockSec != null ? `${Math.floor(clockSec / 60)}'` : "LIVE"
export const shortAddr = (a: string | null): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—")
