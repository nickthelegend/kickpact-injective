/**
 * Proof-of-concept: feed a REAL TxLINE World Cup proof to validateStatV2 on
 * devnet and watch the oracle confirm (and refute) outcomes on-chain.
 *
 *   bun run src/validate.ts out/proof-18241006.json
 *
 * Expected for England 1–2 Argentina: away-win TRUE, draw FALSE, home-win FALSE.
 */
import * as anchor from "@coral-xyz/anchor"
import { Connection, ComputeBudgetProgram, PublicKey } from "@solana/web3.js"
import BN from "bn.js"
import fs from "node:fs"
import { RPC, loadKeypair, oracleProgram } from "./txline.ts"

const proofPath = process.argv[2] ?? "out/proof-18241006.json"
const val = JSON.parse(fs.readFileSync(proofPath, "utf8"))
const user = loadKeypair(process.argv[3] ?? "keys/keeper.json")

const connection = new Connection(RPC, "confirmed")
const { program } = oracleProgram(connection, user)

const mapProof = (arr: any[]) =>
  arr.map((n) => ({ hash: Array.from(n.hash), isRightSibling: n.isRightSibling }))

const targetTs = val.summary.updateStats.minTimestamp
const epochDay = Math.floor(targetTs / 86400000)
const [dailyScoresPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)],
  program.programId,
)
console.log(`[pda] epochDay ${epochDay} → ${dailyScoresPda.toBase58()}`)

const payload = {
  ts: new BN(targetTs),
  fixtureSummary: {
    fixtureId: new BN(val.summary.fixtureId),
    updateStats: {
      updateCount: val.summary.updateStats.updateCount,
      minTimestamp: new BN(val.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(val.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: Array.from(val.summary.eventStatsSubTreeRoot),
  },
  fixtureProof: mapProof(val.subTreeProof),
  mainTreeProof: mapProof(val.mainTreeProof),
  eventStatRoot: Array.from(val.eventStatRoot),
  stats: val.statsToProve.map((statObj: any, i: number) => ({
    stat: statObj,
    statProof: mapProof(val.statProofs[i]),
  })),
}

// index 0 = statKey 1 (home goals), index 1 = statKey 2 (away goals)
const S = (outcome: "home" | "draw" | "away") => ({
  geometricTargets: [],
  distancePredicate: null,
  discretePredicates: [
    outcome === "draw"
      ? { binary: { indexA: 0, indexB: 1, op: { subtract: {} }, predicate: { threshold: 0, comparison: { equalTo: {} } } } }
      : outcome === "home"
        ? { binary: { indexA: 0, indexB: 1, op: { subtract: {} }, predicate: { threshold: 0, comparison: { greaterThan: {} } } } }
        : { binary: { indexA: 1, indexB: 0, op: { subtract: {} }, predicate: { threshold: 0, comparison: { greaterThan: {} } } } },
  ],
})

const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
for (const outcome of ["away", "draw", "home"] as const) {
  try {
    const ok = await (program.methods as any)
      .validateStatV2(payload, S(outcome))
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
      .preInstructions([cu])
      .view()
    console.log(`[validateStatV2] ${outcome.padEnd(5)} → ${ok}`)
  } catch (e: any) {
    console.log(`[validateStatV2] ${outcome.padEnd(5)} → ERROR: ${String(e.message ?? e).slice(0, 300)}`)
  }
}
