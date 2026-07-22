/**
 * De-risk everything: run the free-tier activation, then walk the real World
 * Cup data — fixtures, a finished match's score records, and the Merkle proof
 * for its final goals — saving every payload under out/ for program tests.
 *
 *   bun run src/discover.ts keys/keeper.json
 */
import fs from "node:fs"
import path from "node:path"
import { activate, get, OUT, WORLD_CUP_COMPETITION_ID } from "./txline.ts"

const keypairPath = process.argv[2] ?? "keys/keeper.json"
const auth = await activate(keypairPath)

// ── fixtures (from ~3 weeks back so finished knockout matches appear) ─────
const startEpochDay = Math.floor(Date.now() / 86400000) - 22
const fixtures = await get(
  auth,
  `/fixtures/snapshot?competitionId=${WORLD_CUP_COMPETITION_ID}&startEpochDay=${startEpochDay}`,
)
fs.writeFileSync(path.join(OUT, "fixtures.json"), JSON.stringify(fixtures, null, 2))
console.log(`\n[fixtures] ${fixtures.length} World Cup fixtures`)
const fmt = (f: any) =>
  `${f.FixtureId}  ${new Date(f.StartTime).toISOString().slice(0, 16)}  ${f.Participant1} v ${f.Participant2}`
const now = Date.now()
const past = fixtures.filter((f: any) => new Date(f.StartTime).getTime() < now).slice(-8)
const future = fixtures.filter((f: any) => new Date(f.StartTime).getTime() >= now).slice(0, 4)
console.log("recent past:"); past.forEach((f: any) => console.log("  " + fmt(f)))
console.log("upcoming:"); future.forEach((f: any) => console.log("  " + fmt(f)))

// ── find a finished fixture via the scores snapshot (JSON; latest state) ──
let target: any = null
let lastRecord: any = null
for (const f of [...past].reverse()) {
  try {
    const snap = await get(auth, `/scores/snapshot/${f.FixtureId}`)
    const rec = Array.isArray(snap) ? snap[snap.length - 1] : null
    if (rec && (rec.Seq ?? 0) > 0) {
      target = f
      lastRecord = rec
      fs.writeFileSync(path.join(OUT, `scores-${f.FixtureId}.json`), JSON.stringify(snap, null, 2))
      break
    }
  } catch (e: any) {
    console.log(`  (no scores for ${f.FixtureId}: ${e.message.slice(0, 80)})`)
  }
}
if (!target) throw new Error("no finished fixture with scores found")

console.log(`\n[target] ${fmt(target)}`)
console.log(`[target] last record:`, JSON.stringify(lastRecord).slice(0, 600))

// ── the Merkle proof for final goals (statKeys 1,2) ───────────────────────
const seq = lastRecord.Seq ?? lastRecord.seq
const proof = await get(
  auth,
  `/scores/stat-validation?fixtureId=${target.FixtureId}&seq=${seq}&statKeys=1,2`,
)
fs.writeFileSync(path.join(OUT, `proof-${target.FixtureId}.json`), JSON.stringify(proof, null, 2))
console.log(`\n[proof] fixture ${target.FixtureId} seq ${seq}`)
console.log(`[proof] summary:`, JSON.stringify(proof.summary))
console.log(`[proof] statsToProve:`, JSON.stringify(proof.statsToProve))
console.log(`[proof] proof sizes: sub=${proof.subTreeProof?.length} main=${proof.mainTreeProof?.length} statProofs=${proof.statProofs?.map((p: any) => p.length)}`)
console.log(`\nSaved to out/: fixtures.json, scores-${target.FixtureId}.json, proof-${target.FixtureId}.json`)
