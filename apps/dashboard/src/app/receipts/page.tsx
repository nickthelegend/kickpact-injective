"use client"

/**
 * Verifiable Resolution UI — every pool with its settlement state, the TxLINE
 * Merkle proof that resolved it, and a one-click re-verification that runs
 * validateStatV2 as a read-only call against the oracle program on devnet.
 * No trust required: the page rebuilds the proof and asks the chain.
 */
import { useEffect, useState } from "react"
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor"
import { ComputeBudgetProgram, PublicKey, Transaction, type VersionedTransaction } from "@solana/web3.js"
import {
  connection, fixtures, latestTx, pools, proof, score, flag,
  EXPLORER, EXPLORER_ACCT, KICKPACT_ID, TXORACLE_ID,
  type Fixture, type Pool,
} from "../../lib/data"
import txoracleIdl from "../../idl/txoracle.json"

const OUTCOME = ["", "HOME", "DRAW", "AWAY"]

export default function Receipts() {
  const [rows, setRows] = useState<Pool[]>([])
  const [fx, setFx] = useState<Fixture[]>([])
  const [open, setOpen] = useState<Pool | null>(null)

  useEffect(() => {
    pools().then(setRows).catch(() => {})
    fixtures().then(setFx).catch(() => {})
  }, [])

  const nameOf = (id: number) => {
    const f = fx.find((x) => x.FixtureId === id)
    return f ? `${flag(f.Participant1)} ${f.Participant1} v ${f.Participant2} ${flag(f.Participant2)}` : `fixture ${id}`
  }

  if (open) return <Receipt pool={open} name={nameOf(open.fixtureId)} onBack={() => setOpen(null)} />

  return (
    <main>
      <h1 style={{ fontSize: 20, letterSpacing: 2 }}>SETTLEMENT RECEIPTS</h1>
      <p className="dim" style={{ fontSize: 11, lineHeight: 1.7 }}>
        Every Kickpact pool settles by CPI into TxLINE&apos;s <span className="mono">validate_stat_v2</span> — the
        program only accepts the outcome the oracle proves. Click a pool to inspect and re-verify its proof.
      </p>
      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table className="receipts">
          <thead>
            <tr>
              <th>pool</th><th>match</th><th>status</th><th>pot</th><th>members</th><th>result</th><th>winners</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} onClick={() => setOpen(p)} style={{ cursor: "pointer" }}>
                <td className="gold">#{p.id}</td>
                <td>{nameOf(p.fixtureId)}</td>
                <td>{p.settled ? <span className="pill green">SETTLED ✓</span> : <span className="pill gold">OPEN</span>}</td>
                <td>{p.pot.toFixed(0)} kUSD</td>
                <td>{p.memberCount}</td>
                <td>{p.settled ? OUTCOME[p.result] : "—"}</td>
                <td>{p.settled ? p.winners : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="dim small" style={{ padding: 14 }}>loading pools from devnet…</div>}
      </div>
      <p className="small dim" style={{ marginTop: 14 }}>
        programs: <a href={EXPLORER_ACCT(KICKPACT_ID)} target="_blank">kickpact</a> ·{" "}
        <a href={EXPLORER_ACCT(TXORACLE_ID)} target="_blank">txoracle (TxLINE)</a> · cluster devnet
      </p>
    </main>
  )
}

function Receipt({ pool, name, onBack }: { pool: Pool; name: string; onBack: () => void }) {
  const [prf, setPrf] = useState<Record<string, never> | null>(null)
  const [sig, setSig] = useState<string | null>(null)
  const [verify, setVerify] = useState<"idle" | "running" | "true" | "false" | "error">("idle")

  useEffect(() => {
    latestTx(pool.address).then(setSig).catch(() => {})
    ;(async () => {
      const s = await score(pool.fixtureId)
      if (s?.seq) setPrf(await proof(pool.fixtureId, s.seq))
    })().catch(() => {})
  }, [pool])

  const doVerify = async () => {
    if (!prf || !pool.settled) return
    setVerify("running")
    try {
      // read-only provider: .view() simulates the tx, so the "wallet" is a
      // funded devnet pubkey that never signs anything
      const roWallet = {
        publicKey: new PublicKey("Ab5vEaLwkdvGwrmYwUpA4cok6EUzdgRbCyyNrV7pBqMP"),
        signTransaction: async <T extends Transaction | VersionedTransaction>(t: T) => t,
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(t: T[]) => t,
      }
      const provider = new AnchorProvider(connection(), roWallet, { commitment: "confirmed" })
      const oracle = new Program(txoracleIdl as never, provider)
      const mapProof = (arr: { hash: number[]; isRightSibling: boolean }[]) =>
        arr.map((n) => ({ hash: Array.from(n.hash), isRightSibling: n.isRightSibling }))
      const v = prf as never as {
        summary: { fixtureId: number; updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number }; eventStatsSubTreeRoot: number[] }
        subTreeProof: never[]; mainTreeProof: never[]; eventStatRoot: number[]
        statsToProve: { key: number; value: number; period: number }[]; statProofs: never[][]
      }
      const payload = {
        ts: new BN(v.summary.updateStats.minTimestamp),
        fixtureSummary: {
          fixtureId: new BN(v.summary.fixtureId),
          updateStats: {
            updateCount: v.summary.updateStats.updateCount,
            minTimestamp: new BN(v.summary.updateStats.minTimestamp),
            maxTimestamp: new BN(v.summary.updateStats.maxTimestamp),
          },
          eventsSubTreeRoot: Array.from(v.summary.eventStatsSubTreeRoot),
        },
        fixtureProof: mapProof(v.subTreeProof),
        mainTreeProof: mapProof(v.mainTreeProof),
        eventStatRoot: Array.from(v.eventStatRoot),
        stats: v.statsToProve.map((statObj, i) => ({ stat: statObj, statProof: mapProof(v.statProofs[i]) })),
      }
      const pred = (o: number) =>
        o === 2
          ? { binary: { indexA: 0, indexB: 1, op: { subtract: {} }, predicate: { threshold: 0, comparison: { equalTo: {} } } } }
          : o === 1
            ? { binary: { indexA: 0, indexB: 1, op: { subtract: {} }, predicate: { threshold: 0, comparison: { greaterThan: {} } } } }
            : { binary: { indexA: 1, indexB: 0, op: { subtract: {} }, predicate: { threshold: 0, comparison: { greaterThan: {} } } } }
      const strategy = { geometricTargets: [], distancePredicate: null, discretePredicates: [pred(pool.result)] }
      const epochDay = Math.floor(v.summary.updateStats.minTimestamp / 86400000)
      // browser-safe seeds (no Buffer global)
      const dailyRoots = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("daily_scores_roots"), new Uint8Array([epochDay & 0xff, (epochDay >> 8) & 0xff])],
        new PublicKey(TXORACLE_ID),
      )[0]
      const ok: boolean = await (oracle.methods as never as Record<string, (p: unknown, s: unknown) => { accounts(a: unknown): { preInstructions(i: unknown[]): { view(): Promise<boolean> } } }>)
        .validateStatV2(payload, strategy)
        .accounts({ dailyScoresMerkleRoots: dailyRoots })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .view()
      setVerify(ok ? "true" : "false")
    } catch (e) {
      console.error("verify failed:", e)
      setVerify("error")
    }
  }

  const v = prf as never as {
    summary?: { fixtureId: number; updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number } }
    statsToProve?: { key: number; value: number; period: number }[]
    subTreeProof?: unknown[]; mainTreeProof?: unknown[]; eventStatRoot?: number[]
  } | null

  return (
    <main>
      <a onClick={onBack} style={{ cursor: "pointer" }} className="small">‹ BACK TO RECEIPTS</a>
      <h1 style={{ fontSize: 20, letterSpacing: 2, marginTop: 12 }}>
        RECEIPT · POOL #{pool.id} <span className="dim" style={{ fontSize: 13 }}>{name}</span>
      </h1>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="small dim">SETTLEMENT</div>
        <div style={{ fontSize: 14, marginTop: 8 }}>
          {pool.settled
            ? <>result <span className="gold">{OUTCOME[pool.result]}</span> · {pool.winners} winner{pool.winners === 1 ? "" : "s"} split {pool.pot.toFixed(0)} kUSD</>
            : "not settled yet — the keeper is watching the TxLINE stream"}
        </div>
        <div className="small" style={{ marginTop: 8 }}>
          {sig && <a href={EXPLORER(sig)} target="_blank">↗ latest pool transaction</a>}
          {"  ·  "}
          <a href={EXPLORER_ACCT(pool.address)} target="_blank">↗ pool account</a>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="small dim">TXLINE MERKLE PROOF</div>
        {v?.summary ? (
          <>
            <div className="mono" style={{ marginTop: 8 }}>
              fixture {String(v.summary.fixtureId)} · {v.summary.updateStats.updateCount} updates ·{" "}
              {new Date(v.summary.updateStats.minTimestamp).toLocaleString()}
            </div>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              stats proven:{" "}
              {(v.statsToProve ?? []).map((s) => (
                <span key={s.key} className="pill" style={{ marginRight: 6 }}>
                  {s.key === 1 ? "home goals" : "away goals"} = {s.value}
                </span>
              ))}
            </div>
            <div className="mono" style={{ marginTop: 8 }}>
              eventStatRoot {(v.eventStatRoot ?? []).slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("")}… ·
              subTree {v.subTreeProof?.length} nodes · mainTree {v.mainTreeProof?.length}
            </div>
            {pool.settled && (
              <button
                className={`btn ${verify === "true" ? "green" : verify === "false" ? "red" : ""}`}
                style={{ marginTop: 14 }}
                onClick={doVerify}
              >
                {verify === "running" ? "VERIFYING ON-CHAIN…"
                  : verify === "true" ? "ORACLE CONFIRMS ✓"
                  : verify === "false" ? "ORACLE REFUTES ✗"
                  : verify === "error" ? "RETRY VERIFICATION"
                  : "VERIFY ON-CHAIN NOW"}
              </button>
            )}
          </>
        ) : (
          <div className="dim small" style={{ marginTop: 8 }}>fetching proof from TxLINE…</div>
        )}
      </div>
    </main>
  )
}
