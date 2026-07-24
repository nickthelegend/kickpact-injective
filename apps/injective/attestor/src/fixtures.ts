/**
 * Match data for the attestor.
 *
 * Same rule as the keeper and the mobile feed: live API-Football when
 * APISPORTS_KEY is set, otherwise the bundled snapshot at
 * ../../keeper/fixtures.snapshot.json — the SAME file the keeper reads, so the
 * fixtureIds an attestation is sold for always match the fixtureIds pools were
 * opened on. Kickoffs in the snapshot are relative to load time, so the
 * quarter-finals are always finished (attestable) and the semis are not.
 *
 * This mirrors keeper/src/sports.ts rather than importing it: the attestor is a
 * standalone service and shouldn't break if the keeper's internals move.
 */
import fs from "node:fs"
import path from "node:path"
import { INJECTIVE_ROOT } from "./config.ts"

export const WORLD_CUP_LEAGUE = 1
export const SEASON = 2026
const API_BASE = "https://v3.football.api-sports.io"

export type FixtureState = "pre" | "in" | "post"

export interface Fixture {
  id: number
  home: string
  away: string
  round?: string
  kickoffMs: number
  state: FixtureState
  homeGoals: number | null
  awayGoals: number | null
  /** epoch ms of the final whistle; used as the attestation `ts`. */
  tsMs: number
}

const key = () => process.env.APISPORTS_KEY || ""
export const usingLiveApi = () => !!key()

async function api(endpoint: string): Promise<any> {
  const r = await fetch(`${API_BASE}${endpoint}`, { headers: { "x-apisports-key": key() } })
  if (!r.ok) throw new Error(`API-Football ${endpoint} → ${r.status}`)
  const j = (await r.json()) as any
  if (j.errors && Object.keys(j.errors).length) throw new Error(`API-Football: ${JSON.stringify(j.errors)}`)
  return j.response
}

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
    round: row.league?.round,
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
  round?: string
  offsetMin: number
  homeGoals?: number
  awayGoals?: number
}

function loadSnapshot(): Fixture[] {
  const file = path.join(INJECTIVE_ROOT, "keeper", "fixtures.snapshot.json")
  const snap = JSON.parse(fs.readFileSync(file, "utf8"))
  const now = Date.now()
  return (snap.fixtures as SnapRow[]).map((f) => {
    const kickoffMs = now + f.offsetMin * 60_000
    const state: FixtureState = kickoffMs > now ? "pre" : now > kickoffMs + 3 * 3600_000 ? "post" : "in"
    const finished = f.homeGoals != null && f.awayGoals != null
    return {
      id: f.id,
      home: f.home,
      away: f.away,
      round: f.round,
      kickoffMs,
      state: finished ? "post" : state,
      homeGoals: finished ? f.homeGoals! : null,
      awayGoals: finished ? f.awayGoals! : null,
      tsMs: finished ? kickoffMs + 105 * 60_000 : now,
    }
  })
}

export async function fetchFixtures(): Promise<Fixture[]> {
  if (!key()) return loadSnapshot()
  const rows = await api(`/fixtures?league=${WORLD_CUP_LEAGUE}&season=${SEASON}`)
  return (rows as any[]).map(fromApi).sort((a, b) => a.kickoffMs - b.kickoffMs)
}

export async function fetchFixture(id: number): Promise<Fixture | null> {
  if (!key()) return loadSnapshot().find((f) => f.id === id) ?? null
  const rows = await api(`/fixtures?id=${id}`)
  return rows.length ? fromApi(rows[0]) : null
}

/** Only finished fixtures can be attested — everything else has no final score. */
export function isAttestable(f: Fixture): boolean {
  return f.state === "post" && f.homeGoals != null && f.awayGoals != null
}

export async function attestableFixtures(): Promise<Fixture[]> {
  return (await fetchFixtures()).filter(isAttestable)
}
