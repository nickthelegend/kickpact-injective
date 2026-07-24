/**
 * Match-data layer — real-time World Cup fixtures, live scores and 1X2 odds
 * from API-Football (https://v3.football.api-sports.io). Drop-in replacement
 * for the old TxLINE feed: it exports the same `Game`/`OddsLine`/`LiveScore`
 * shapes the screens already render, so the UI is unchanged.
 *
 * When EXPO_PUBLIC_APISPORTS_KEY is set the data is live; otherwise it falls
 * back to a bundled snapshot (feed-fixtures.json) whose kickoffs are assigned
 * relative to load time, so the app always has upcoming matches to bet on and
 * finished ones to settle. The keeper reads the SAME snapshot, so fixtureIds
 * always agree between the pool you open and the score that settles it.
 */
import snapshot from "./feed-fixtures.json"

const API_BASE = "https://v3.football.api-sports.io"
const KEY = process.env.EXPO_PUBLIC_APISPORTS_KEY || ""
export const WORLD_CUP_LEAGUE = 1
export const SEASON = 2026

// ── the Game shape the screens render ───────────────────────────────────────
export type GameState = "pre" | "in" | "post"

export interface Team {
  name: string
  shortName: string
  abbrev: string
  flag: string
  score: string | null
  winner: boolean
  homeAway: "home" | "away"
}

export interface Game {
  id: string
  fixtureId: number
  league: string
  leagueName: string
  round?: string // e.g. "SEMI-FINAL", "QUARTER-FINAL"
  date: string
  kickoffMs: number
  state: GameState
  completed: boolean
  status: string
  seq: number
  phase: number
  home: Team
  away: Team
}

export interface OddsLine {
  home: number | null
  draw: number | null
  away: number | null
  pct: [number, number, number] | null
  bookmaker: string
  ts: number
}

export interface LiveScore {
  home: number | null
  away: number | null
  phase: number
  clockSec: number | null
  seq: number
  ts: number
  action: string | null
}

// TxLINE-era phase constant the screens still import (5 = Ended / full time).
export const PHASE_ENDED = 5

// ── nation flags (pixel-friendly, no image CDN needed) ─────────────────────
const FLAGS: Record<string, string> = {
  Argentina: "🇦🇷", Brazil: "🇧🇷", France: "🇫🇷", England: "🏴", Spain: "🇪🇸",
  Germany: "🇩🇪", Portugal: "🇵🇹", Netherlands: "🇳🇱", Belgium: "🇧🇪", Italy: "🇮🇹",
  Croatia: "🇭🇷", Morocco: "🇲🇦", Japan: "🇯🇵", Mexico: "🇲🇽", Uruguay: "🇺🇾",
  Switzerland: "🇨🇭", Colombia: "🇨🇴", Senegal: "🇸🇳", Ghana: "🇬🇭", Egypt: "🇪🇬",
  Norway: "🇳🇴", Poland: "🇵🇱", Denmark: "🇩🇰", Sweden: "🇸🇪", Austria: "🇦🇹",
  Ecuador: "🇪🇨", Canada: "🇨🇦", Australia: "🇦🇺", Qatar: "🇶🇦", Wales: "🏴",
  Scotland: "🏴", Serbia: "🇷🇸", Ukraine: "🇺🇦", Turkey: "🇹🇷", Nigeria: "🇳🇬",
  Cameroon: "🇨🇲", Tunisia: "🇹🇳", Algeria: "🇩🇿", "Saudi Arabia": "🇸🇦", Iran: "🇮🇷",
  "South Korea": "🇰🇷", "Korea Republic": "🇰🇷", USA: "🇺🇸", "United States": "🇺🇸",
  "Costa Rica": "🇨🇷", Panama: "🇵🇦", Peru: "🇵🇪", Chile: "🇨🇱", Paraguay: "🇵🇾",
}
export const flagFor = (name: string) => FLAGS[name] ?? "⚽️"

// ── feed status the UI reads ────────────────────────────────────────────────
export type FeedStatus = { live: boolean; reason: string | null; capturedAt: string | null }
export const feed: FeedStatus = { live: !!KEY, reason: null, capturedAt: null }

// ── API-Football status short codes → our states ────────────────────────────
const POST = new Set(["FT", "AET", "PEN", "AWD", "WO"])
const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"])
function stateOf(short: string): GameState {
  if (POST.has(short)) return "post"
  if (LIVE.has(short)) return "in"
  return "pre"
}
function phaseOf(state: GameState): number {
  return state === "post" ? 5 : state === "in" ? 2 : 1
}
function statusLabel(short: string, elapsed: number | null, startMs: number): string {
  if (short === "HT") return "HT"
  if (POST.has(short)) return "FT"
  if (LIVE.has(short)) return elapsed != null ? `${elapsed}'` : "LIVE"
  const d = new Date(startMs)
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
}

const team = (name: string, score: number | null, other: number | null, homeAway: "home" | "away"): Team => ({
  name,
  shortName: name,
  abbrev: name.slice(0, 3).toUpperCase(),
  flag: flagFor(name),
  score: score != null ? String(score) : null,
  winner: score != null && other != null && score > other,
  homeAway,
})

function gameFromApi(row: any): Game {
  const short = row.fixture?.status?.short ?? "NS"
  const state = stateOf(short)
  const startMs = row.fixture.timestamp * 1000
  const h = row.goals?.home ?? null
  const a = row.goals?.away ?? null
  return {
    id: String(row.fixture.id),
    fixtureId: row.fixture.id,
    league: "worldcup",
    leagueName: "World Cup",
    date: new Date(startMs).toISOString(),
    kickoffMs: startMs,
    state,
    completed: state === "post",
    status: statusLabel(short, row.fixture?.status?.elapsed ?? null, startMs),
    seq: row.fixture?.status?.elapsed ?? 0,
    phase: phaseOf(state),
    home: team(row.teams.home.name, h, a, "home"),
    away: team(row.teams.away.name, a, h, "away"),
  }
}

// ── snapshot fallback ───────────────────────────────────────────────────────
interface SnapRow {
  id: number
  home: string
  away: string
  offsetMin: number
  round?: string
  homeGoals?: number
  awayGoals?: number
}
function gamesFromSnapshot(): Game[] {
  const now = Date.now()
  return (snapshot.fixtures as SnapRow[]).map((f) => {
    const kickoffMs = now + f.offsetMin * 60_000
    const finished = f.homeGoals != null && f.awayGoals != null
    const state: GameState = finished ? "post" : kickoffMs > now ? "pre" : now > kickoffMs + 3 * 3600_000 ? "post" : "in"
    const h = finished ? f.homeGoals! : null
    const a = finished ? f.awayGoals! : null
    return {
      id: String(f.id),
      fixtureId: f.id,
      league: "worldcup",
      leagueName: "World Cup",
      round: f.round,
      date: new Date(kickoffMs).toISOString(),
      kickoffMs,
      state,
      completed: state === "post",
      status: statusLabel(finished ? "FT" : state === "in" ? "LIVE" : "NS", null, kickoffMs),
      seq: 0,
      phase: phaseOf(state),
      home: team(f.home, h, a, "home"),
      away: team(f.away, a, h, "away"),
    }
  })
}

async function api(endpoint: string): Promise<any> {
  const r = await fetch(`${API_BASE}${endpoint}`, { headers: { "x-apisports-key": KEY } })
  if (!r.ok) throw new Error(`API-Football ${endpoint} → ${r.status}`)
  const j = await r.json()
  if (j.errors && Object.keys(j.errors).length) throw new Error(`API-Football: ${JSON.stringify(j.errors)}`)
  return j.response
}

let cache: { at: number; games: Game[] } | null = null

export async function fetchGames(): Promise<Game[]> {
  if (cache && Date.now() - cache.at < 25_000) return cache.games
  let games: Game[]
  if (KEY) {
    try {
      const rows = await api(`/fixtures?league=${WORLD_CUP_LEAGUE}&season=${SEASON}`)
      games = rows.map(gameFromApi)
      feed.live = true
      feed.reason = null
    } catch (e: any) {
      games = gamesFromSnapshot()
      feed.live = false
      feed.reason = `API-Football unreachable (${String(e?.message ?? e).slice(0, 40)}) — showing bundled fixtures.`
    }
  } else {
    games = gamesFromSnapshot()
    feed.live = false
    feed.reason = "World Cup semi-finals — the last four."
  }
  games.sort((a, b) => a.kickoffMs - b.kickoffMs)
  cache = { at: Date.now(), games }
  return games
}

export async function fetchScore(fixtureId: number): Promise<LiveScore | null> {
  const g = (await fetchGames()).find((x) => x.fixtureId === fixtureId)
  if (!g) return null
  return {
    home: g.home.score != null ? Number(g.home.score) : null,
    away: g.away.score != null ? Number(g.away.score) : null,
    phase: g.phase,
    clockSec: null,
    seq: g.seq,
    ts: g.kickoffMs,
    action: null,
  }
}

/** 1X2 odds from API-Football when available, else null (the UI handles null). */
export async function fetchOdds(fixtureId: number): Promise<OddsLine | null> {
  if (!KEY) return null
  try {
    const rows = await api(`/odds?fixture=${fixtureId}&bet=1`)
    const bm = rows?.[0]?.bookmakers?.[0]
    const values = bm?.bets?.[0]?.values
    if (!values) return null
    const num = (label: string) => {
      const v = values.find((x: any) => x.value === label)
      return v ? Number(v.odd) : null
    }
    const home = num("Home"), draw = num("Draw"), away = num("Away")
    let pct: [number, number, number] | null = null
    if (home && draw && away) {
      const inv = [1 / home, 1 / draw, 1 / away]
      const s = inv[0] + inv[1] + inv[2]
      pct = [inv[0] / s, inv[1] / s, inv[2] / s]
    }
    return { home, draw, away, pct, bookmaker: bm?.name ?? "API-Football", ts: Date.now() }
  } catch {
    return null
  }
}

// ── helpers the screens already use ─────────────────────────────────────────
export type Filter = "live" | "upcoming" | "completed" | "all"

export function filterGames(games: Game[], f: Filter): Game[] {
  if (f === "all") return games
  if (f === "live") return games.filter((g) => g.state === "in")
  if (f === "upcoming") return games.filter((g) => g.state === "pre")
  return games.filter((g) => g.state === "post")
}

export async function fetchGame(id: string): Promise<Game | null> {
  return (await fetchGames()).find((g) => g.id === id) ?? null
}

export function kickoffLabel(g: Game): string {
  const d = new Date(g.date)
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${day} · ${time}`
}

export type Outcome = "home" | "draw" | "away"

export function finalOutcome(g: Game): Outcome | null {
  if (g.state !== "post") return null
  const h = Number(g.home.score), a = Number(g.away.score)
  if (Number.isNaN(h) || Number.isNaN(a)) return null
  return h > a ? "home" : a > h ? "away" : "draw"
}

export function outcomeLabel(g: Game, outcome: Outcome): string {
  if (outcome === "draw") return `Draw — ${g.home.shortName} vs ${g.away.shortName}`
  const win = outcome === "home" ? g.home : g.away
  const lose = outcome === "home" ? g.away : g.home
  return `${win.shortName} to beat ${lose.shortName}`
}
