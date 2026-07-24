/**
 * Match-data source for the keeper (and, mirrored, for the mobile feed).
 *
 * Prefers live API-Football (https://v3.football.api-sports.io) when
 * APISPORTS_KEY is set; otherwise falls back to the bundled snapshot in
 * fixtures.snapshot.json, whose kickoffs are assigned relative to load time so
 * the demo always has upcoming matches to bet on and finished ones to settle.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

export const WORLD_CUP_LEAGUE = 1 // API-Football league id for the FIFA World Cup
export const SEASON = 2026
const API_BASE = "https://v3.football.api-sports.io"
const KEY = process.env.APISPORTS_KEY || ""

export type FixtureState = "pre" | "in" | "post"

export interface Fixture {
  id: number
  home: string
  away: string
  kickoffMs: number
  state: FixtureState
  homeGoals: number | null
  awayGoals: number | null
  /** epoch ms of the last score update; used as the attestation `ts`. */
  tsMs: number
}

export const usingLiveApi = () => !!KEY

async function api(endpoint: string): Promise<any> {
  const r = await fetch(`${API_BASE}${endpoint}`, { headers: { "x-apisports-key": KEY } })
  if (!r.ok) throw new Error(`API-Football ${endpoint} → ${r.status}`)
  const j = await r.json()
  if (j.errors && Object.keys(j.errors).length) throw new Error(`API-Football: ${JSON.stringify(j.errors)}`)
  return j.response
}

// API-Football status short codes → our three states.
const POST = new Set(["FT", "AET", "PEN", "AWD", "WO"])
const IN = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"])
function stateOf(short: string): FixtureState {
  if (POST.has(short)) return "post"
  if (IN.has(short)) return "in"
  return "pre"
}

function fromApi(row: any): Fixture {
  const short = row.fixture?.status?.short ?? "NS"
  const state = stateOf(short)
  return {
    id: row.fixture.id,
    home: row.teams.home.name,
    away: row.teams.away.name,
    kickoffMs: row.fixture.timestamp * 1000,
    state,
    homeGoals: row.goals?.home ?? null,
    awayGoals: row.goals?.away ?? null,
    tsMs: (row.fixture.timestamp + (state === "post" ? 105 * 60 : 0)) * 1000,
  }
}

interface SnapRow {
  id: number
  home: string
  away: string
  offsetMin: number
  homeGoals?: number
  awayGoals?: number
}

function loadSnapshot(): Fixture[] {
  const snap = JSON.parse(fs.readFileSync(path.join(here, "..", "fixtures.snapshot.json"), "utf8"))
  const now = Date.now()
  return (snap.fixtures as SnapRow[]).map((f) => {
    const kickoffMs = now + f.offsetMin * 60_000
    const state: FixtureState = kickoffMs > now ? "pre" : now > kickoffMs + 3 * 3600_000 ? "post" : "in"
    const finished = f.homeGoals != null && f.awayGoals != null
    return {
      id: f.id,
      home: f.home,
      away: f.away,
      kickoffMs,
      state: finished ? "post" : state,
      homeGoals: finished ? f.homeGoals! : null,
      awayGoals: finished ? f.awayGoals! : null,
      tsMs: finished ? kickoffMs + 105 * 60_000 : now,
    }
  })
}

/** All World Cup fixtures (live API when keyed, else the bundled snapshot). */
export async function fetchFixtures(): Promise<Fixture[]> {
  if (!KEY) return loadSnapshot()
  const rows = await api(`/fixtures?league=${WORLD_CUP_LEAGUE}&season=${SEASON}`)
  return rows.map(fromApi).sort((a: Fixture, b: Fixture) => a.kickoffMs - b.kickoffMs)
}

/** A single fixture (for settling a specific pool). */
export async function fetchFixture(id: number): Promise<Fixture | null> {
  if (!KEY) return loadSnapshot().find((f) => f.id === id) ?? null
  const rows = await api(`/fixtures?id=${id}`)
  return rows.length ? fromApi(rows[0]) : null
}

/** Final score for a fixture, or null if not yet final. */
export async function finalScore(id: number): Promise<{ home: number; away: number; tsMs: number } | null> {
  const f = await fetchFixture(id)
  if (!f || f.state !== "post" || f.homeGoals == null || f.awayGoals == null) return null
  return { home: f.homeGoals, away: f.awayGoals, tsMs: f.tsMs }
}
