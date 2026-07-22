/**
 * Kickpact settle-keeper — watches TxLINE's live scores SSE stream and, the
 * moment a fixture with open pools reaches full time, fetches the Merkle
 * proof of the final goal counts and settles every pool on-chain (the
 * program CPIs into txoracle validateStatV2, so the keeper can't lie —
 * it merely delivers the proof).
 *
 * Also sweeps periodically via REST snapshots in case the stream is quiet.
 *
 *   bun run src/keeper.ts
 */
import * as anchor from "@coral-xyz/anchor"
import { Connection, PublicKey, ComputeBudgetProgram } from "@solana/web3.js"
import BN from "bn.js"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { activate, get, getSse, guestJwt, API, RPC, loadKeypair, type Auth } from "./txline.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const PHASE_ENDED = 5
const FULL_TIME_MS = 105 * 60 * 1000
const TXORACLE_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J")

const keeper = loadKeypair(path.join(here, "..", "keys", "keeper.json"))
const connection = new Connection(RPC, "confirmed")
const idl = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "target", "idl", "kickpact.json"), "utf8"))
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(keeper), { commitment: "confirmed" })
const program = new anchor.Program(idl, provider)

const auth: Auth = await activate(path.join(here, "..", "keys", "keeper.json"))
console.log("[keeper] wallet", keeper.publicKey.toBase58())

const mapProof = (arr: any[]) => arr.map((n: any) => ({ hash: Array.from(n.hash), isRightSibling: n.isRightSibling }))

function outcomeFromStats(stats: any[]): 1 | 2 | 3 {
  const h = stats.find((s) => s.key === 1)?.value ?? 0
  const a = stats.find((s) => s.key === 2)?.value ?? 0
  return h > a ? 1 : a > h ? 3 : 2
}

async function settlePool(pool: any): Promise<void> {
  const fixtureId = Number(pool.account.fixtureId)
  const poolId: BN = pool.account.id

  // latest score record → seq for the proof
  const snap = await get(auth, `/scores/snapshot/${fixtureId}`)
  const rec = Array.isArray(snap) && snap.length ? snap[snap.length - 1] : null
  if (!rec?.Seq) return console.log(`[skip] pool #${poolId} — no score records yet`)

  const phase = rec.StatusId ?? 0
  const kickoff = Number(pool.account.kickoffMs)
  const finalByTime = rec.Ts >= kickoff + FULL_TIME_MS
  if (phase !== PHASE_ENDED && !finalByTime)
    return console.log(`[skip] pool #${poolId} — fixture ${fixtureId} not final (phase ${phase})`)

  const proof = await get(auth, `/scores/stat-validation?fixtureId=${fixtureId}&seq=${rec.Seq}&statKeys=1,2`)
  const outcome = outcomeFromStats(proof.statsToProve)
  console.log(`[settle] pool #${poolId} fixture ${fixtureId} → outcome ${["", "HOME", "DRAW", "AWAY"][outcome]} (${proof.statsToProve.map((s: any) => s.value).join("-")})`)

  const payload = {
    ts: new BN(proof.summary.updateStats.minTimestamp),
    fixtureSummary: {
      fixtureId: new BN(proof.summary.fixtureId),
      updateStats: {
        updateCount: proof.summary.updateStats.updateCount,
        minTimestamp: new BN(proof.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(proof.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: Array.from(proof.summary.eventStatsSubTreeRoot),
    },
    fixtureProof: mapProof(proof.subTreeProof),
    mainTreeProof: mapProof(proof.mainTreeProof),
    eventStatRoot: Array.from(proof.eventStatRoot),
    stats: proof.statsToProve.map((statObj: any, i: number) => ({ stat: statObj, statProof: mapProof(proof.statProofs[i]) })),
  }
  const epochDay = Math.floor(proof.summary.updateStats.minTimestamp / 86400000)
  const dailyRoots = PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)],
    TXORACLE_ID,
  )[0]
  const poolPda = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), poolId.toArrayLike(Buffer, "le", 8)],
    program.programId,
  )[0]

  try {
    const sig = await (program.methods as any)
      .settle(outcome, payload)
      .accounts({ caller: keeper.publicKey, pool: poolPda, dailyScoresMerkleRoots: dailyRoots, txoracleProgram: TXORACLE_ID })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
      .rpc()
    console.log(`[settled] pool #${poolId} ✅ ${sig}`)
  } catch (e: any) {
    console.log(`[error] pool #${poolId}: ${String(e.message ?? e).slice(0, 160)}`)
  }
}

async function sweep(): Promise<void> {
  const pools = await (program.account as any).pool.all()
  const open = pools.filter((p: any) => !p.account.settled)
  if (!open.length) return console.log("[sweep] no open pools")
  console.log(`[sweep] ${open.length} open pool(s)`)
  for (const p of open) {
    // joins must be closed before settle
    if (Date.now() < Number(p.account.deadlineMs)) {
      console.log(`[skip] pool #${p.account.id} — joins still open`)
      continue
    }
    await settlePool(p).catch((e) => console.log("[error]", String(e).slice(0, 120)))
  }
}

/** Live SSE scores stream — full-time events trigger an immediate sweep. */
async function streamScores(): Promise<void> {
  let lastEventId: string | undefined
  for (;;) {
    try {
      console.log("[stream] connecting to /scores/stream…")
      const res = await fetch(`${API}/scores/stream`, {
        headers: {
          Authorization: `Bearer ${auth.jwt}`,
          "X-Api-Token": auth.apiToken,
          Accept: "text/event-stream",
          "Accept-Encoding": "deflate",
          "Cache-Control": "no-cache",
          ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
        },
      })
      if (res.status === 401) {
        auth.jwt = await guestJwt()
        continue
      }
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
      console.log("[stream] open ✅")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const blocks = buf.split("\n\n")
        buf = blocks.pop() ?? ""
        for (const block of blocks) {
          let data = ""
          for (const line of block.split("\n")) {
            if (line.startsWith("id:")) lastEventId = line.slice(3).trim()
            if (line.startsWith("data:")) data += line.slice(5).trim()
          }
          if (!data) continue
          try {
            const rec = JSON.parse(data)
            const phase = rec.StatusId ?? 0
            console.log(`[stream] fixture ${rec.FixtureId} seq ${rec.Seq} phase ${phase} ${rec.Action ?? ""}`)
            if (phase === PHASE_ENDED) {
              console.log(`[stream] FULL TIME for ${rec.FixtureId} — sweeping`)
              sweep().catch(() => {})
            }
          } catch {}
        }
      }
      console.log("[stream] closed — reconnecting in 3s")
    } catch (e: any) {
      console.log("[stream] error:", String(e.message ?? e).slice(0, 120), "— retrying in 5s")
      await new Promise((r) => setTimeout(r, 5000))
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
}

// periodic sweep + live stream in parallel
sweep().catch(() => {})
setInterval(() => sweep().catch(() => {}), 90_000)
streamScores()
