/**
 * List World Cup fixtures the keeper can see (live API-Football or the bundled
 * snapshot). Handy for grabbing a fixtureId to open a pool on.
 *
 *   bun run src/fixtures.ts
 */
import { loadEnv } from "./env.ts"
import { fetchFixtures, usingLiveApi } from "./sports.ts"

loadEnv()

const fixtures = await fetchFixtures()
console.log(`source: ${usingLiveApi() ? "API-Football (live)" : "bundled snapshot"} — ${fixtures.length} fixtures\n`)
for (const f of fixtures) {
  const when = new Date(f.kickoffMs).toISOString().slice(0, 16).replace("T", " ")
  const score = f.homeGoals != null ? `  ${f.homeGoals}-${f.awayGoals}` : ""
  console.log(`  ${String(f.id).padEnd(9)} ${when}  ${f.state.padEnd(4)}  ${f.home} vs ${f.away}${score}`)
}
