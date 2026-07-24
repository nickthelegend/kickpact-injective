"use client"

/**
 * Verifiable Resolution UI — every pool with its settlement state, the final
 * score the oracles attested, and a one-click re-verification that recovers
 * EVERY EIP-712 signature from the settle calldata in the browser. No trust
 * required: the page re-derives each signer, checks it against the contract's
 * oracle key set, and reports "M of N verified" — the outcome itself was built
 * on-chain from the goals, and no single key could have settled alone.
 */
import { useEffect, useState } from "react"
import {
  fixtures, latestTx, pools, settlement, flag, shortAddr,
  EXPLORER, EXPLORER_ACCT, KICKPACT_ADDR, KICKPACT_USDC_ADDR, ORACLE_SIGNERS, ORACLE_THRESHOLD,
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
        Every Kickpact pool settles when the contract accepts{" "}
        <span className="gold">{ORACLE_THRESHOLD} of {ORACLE_SIGNERS.length || "N"}</span> oracle{" "}
        <span className="mono">EIP-712</span> signatures over the final goals and derives the outcome{" "}
        <span className="mono">on-chain</span> — the signers report the score, never who wins, and no single
        key can settle alone. Click a pool to inspect and re-verify its settlement.
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
        escrow: <a href={EXPLORER_ACCT(KICKPACT_ADDR)} target="_blank">kUSD</a>
        {KICKPACT_USDC_ADDR && (
          <> · <a href={EXPLORER_ACCT(KICKPACT_USDC_ADDR)} target="_blank">USDC</a></>
        )}
        {" · "}oracle keys:{" "}
        {ORACLE_SIGNERS.map((s, i) => (
          <span key={s}>
            {i > 0 && ", "}
            <a href={EXPLORER_ACCT(s)} target="_blank">{shortAddr(s)}</a>
          </span>
        ))}
        {" · "}Injective testnet
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
      // Re-recover EVERY signer from the settle calldata and check each against
      // the contract's oracle set — "verify this receipt yourself", in-browser.
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
              {s.ts != null && <> · attested {new Date(s.ts).toUTCString()}</>}
            </div>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              outcome derived on-chain:{" "}
              <span className="pill" style={{ marginRight: 6 }}>home goals = {s.homeGoals}</span>
              <span className="pill">away goals = {s.awayGoals}</span>
            </div>

            <div className="small dim" style={{ marginTop: 16 }}>
              ORACLE SIGNATURES · {s.verifiedCount} OF {s.signerCount} VERIFIED{" "}
              {s.verified ? "✓" : `· ${s.threshold} REQUIRED`}
            </div>
            {s.recovered.length > 0 ? (
              s.recovered.map((r, i) => (
                <div className="mono" key={`${r.address ?? "bad"}-${i}`} style={{ marginTop: 6 }}>
                  <span style={{ color: r.member ? "var(--green-light)" : "var(--red)" }}>
                    {r.member ? "✓" : "✕"}
                  </span>{" "}
                  {r.address ? (
                    <a href={EXPLORER_ACCT(r.address)} target="_blank">{r.address}</a>
                  ) : (
                    "unrecoverable signature"
                  )}{" "}
                  <span className="dim">{r.member ? "· oracle key" : "· not in the oracle set"}</span>
                </div>
              ))
            ) : (
              s.oracleSigners.map((a) => (
                <div className="mono" key={a} style={{ marginTop: 6 }}>
                  <a href={EXPLORER_ACCT(a)} target="_blank">{a}</a>{" "}
                  <span className="dim">· oracle key</span>
                </div>
              ))
            )}
            <div className="small dim" style={{ marginTop: 8 }}>
              {s.source === "signatures"
                ? "recovered in your browser from the settle calldata"
                : "calldata unavailable from the rpc — the contract verified the set on-chain"}
            </div>

            {pool.settled && (
              <button
                className={`btn ${verify === "true" ? "green" : verify === "false" ? "red" : ""}`}
                style={{ marginTop: 14 }}
                onClick={doVerify}
              >
                {verify === "running" ? "CHECKING ON-CHAIN…"
                  : verify === "true" ? `${s.verifiedCount} OF ${s.signerCount} SIGNERS VERIFIED ✓`
                  : verify === "false" ? "THRESHOLD NOT MET"
                  : verify === "error" ? "RETRY VERIFICATION"
                  : "VERIFY SIGNATURES NOW"}
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
