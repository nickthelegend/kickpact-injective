"use client"

/**
 * Verifiable Resolution UI — every pool with its settlement state, the final
 * score the oracle attested, and a one-click re-verification that recovers the
 * oracle's EIP-712 signature over those goals in the browser. No trust
 * required: the page re-derives the signer and checks it against the contract's
 * configured oracle — the outcome itself was built on-chain from the goals.
 */
import { useEffect, useState } from "react"
import {
  fixtures, latestTx, pools, settlement, flag, shortAddr,
  EXPLORER, EXPLORER_ACCT, KICKPACT_ADDR, ORACLE_SIGNER,
  type Fixture, type Pool, type Settlement,
} from "../../lib/data"

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
        Every Kickpact pool settles when the contract accepts the oracle&apos;s{" "}
        <span className="mono">EIP-712</span> signature over the final goals and derives the outcome{" "}
        <span className="mono">on-chain</span> — the signer reports the score, never who wins. Click a pool to
        inspect and re-verify its settlement.
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
        {!rows.length && <div className="dim small" style={{ padding: 14 }}>loading pools from Injective testnet…</div>}
      </div>
      <p className="small dim" style={{ marginTop: 14 }}>
        contract: <a href={EXPLORER_ACCT(KICKPACT_ADDR)} target="_blank">kickpact</a> ·{" "}
        oracle signer: <a href={EXPLORER_ACCT(ORACLE_SIGNER)} target="_blank">{shortAddr(ORACLE_SIGNER)}</a> ·{" "}
        Injective testnet
      </p>
    </main>
  )
}

function Receipt({ pool, name, onBack }: { pool: Pool; name: string; onBack: () => void }) {
  const [s, setS] = useState<Settlement | null>(null)
  const [sig, setSig] = useState<string | null>(null)
  const [verify, setVerify] = useState<"idle" | "running" | "true" | "false" | "error">("idle")

  useEffect(() => {
    latestTx(pool.id).then(setSig).catch(() => {})
    settlement(pool.id).then(setS).catch(() => {})
  }, [pool])

  const doVerify = async () => {
    if (!pool.settled) return
    setVerify("running")
    try {
      // Re-recover the signer from the settle tx and check it against the
      // contract's oracle — the browser-side "verify this receipt yourself".
      const r = await settlement(pool.id)
      setS(r)
      setVerify(r?.verified ? "true" : "false")
    } catch (e) {
      console.error("verify failed:", e)
      setVerify("error")
    }
  }

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
            : "not settled yet — the keeper is watching the API-Football feed"}
        </div>
        <div className="small" style={{ marginTop: 8 }}>
          {sig && <a href={EXPLORER(sig)} target="_blank">↗ settle transaction</a>}
          {"  ·  "}
          <a href={EXPLORER_ACCT(pool.address)} target="_blank">↗ escrow contract</a>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="small dim">ORACLE-SIGNED FINAL SCORE</div>
        {s ? (
          <>
            <div className="mono" style={{ marginTop: 8, fontSize: 12 }}>
              fixture {pool.fixtureId} · oracle-signed final {s.homeGoals}–{s.awayGoals}
            </div>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              outcome derived on-chain:{" "}
              <span className="pill" style={{ marginRight: 6 }}>home goals = {s.homeGoals}</span>
              <span className="pill">away goals = {s.awayGoals}</span>
            </div>
            <div className="mono" style={{ marginTop: 8 }}>
              oracle signer {shortAddr(s.oracleSigner)}
              {s.verified && <span className="live"> · signature verified on-chain ✓</span>}
            </div>
            {pool.settled && (
              <button
                className={`btn ${verify === "true" ? "green" : verify === "false" ? "red" : ""}`}
                style={{ marginTop: 14 }}
                onClick={doVerify}
              >
                {verify === "running" ? "CHECKING ON-CHAIN…"
                  : verify === "true" ? "ORACLE SIGNATURE VERIFIED ✓"
                  : verify === "false" ? "NO SETTLEMENT EVENT FOUND"
                  : verify === "error" ? "RETRY VERIFICATION"
                  : "VERIFY ON-CHAIN NOW"}
              </button>
            )}
          </>
        ) : (
          <div className="dim small" style={{ marginTop: 8 }}>
            {pool.settled ? "reading settlement from Injective testnet…" : "no settlement yet."}
          </div>
        )}
      </div>
    </main>
  )
}
