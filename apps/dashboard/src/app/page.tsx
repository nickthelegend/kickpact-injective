"use client"

/**
 * The odds board — every World Cup fixture with TxLINE StablePrice 1X2 odds,
 * implied probabilities, live scores, and the kUSD escrowed in Kickpact pools.
 * Data refreshes continuously from the TxLINE proxy + devnet.
 */
import { useEffect, useMemo, useState } from "react"
import {
  fixtures, odds, pools, score, flag, phaseLabel, feed,
  type Fixture, type Odds, type Pool, type Score,
} from "../lib/data"

interface Row {
  f: Fixture
  s: Score | null
  o: Odds | null
}

export default function OddsBoard() {
  const [rows, setRows] = useState<Row[]>([])
  const [poolList, setPoolList] = useState<Pool[]>([])
  const [loaded, setLoaded] = useState(false)
  const [cached, setCached] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    const load = async () => {
      try {
        const fx = await fixtures()
        const now = Date.now()
        // enrich scores for recent/live, odds for near-term fixtures
        const interesting = fx.filter(
          (f) => f.StartTime > now - 6 * 86_400_000 && f.StartTime < now + 8 * 86_400_000,
        )
        const enriched: Row[] = await Promise.all(
          interesting.map(async (f) => {
            const [s, o] = await Promise.all([
              score(f.FixtureId).catch(() => null),
              f.StartTime > now - 2 * 86_400_000 ? odds(f.FixtureId).catch(() => null) : Promise.resolve(null),
            ])
            return { f, s, o }
          }),
        )
        if (!dead) {
          setRows(enriched.sort((a, b) => b.f.StartTime - a.f.StartTime))
          // fixtures() falls back to the captured snapshot rather than throwing
          setCached(feed.live ? null : feed.capturedAt)
        }
      } finally {
        if (!dead) setLoaded(true)
      }
    }
    const loadPools = () => pools().then((p) => !dead && setPoolList(p)).catch(() => {})
    load()
    loadPools()
    const i1 = setInterval(load, 30_000)
    const i2 = setInterval(loadPools, 30_000)
    return () => {
      dead = true
      clearInterval(i1)
      clearInterval(i2)
    }
  }, [])

  const potByFixture = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of poolList) m.set(p.fixtureId, (m.get(p.fixtureId) ?? 0) + p.pot)
    return m
  }, [poolList])

  const totalEscrow = poolList.reduce((s, p) => s + (p.settled ? 0 : p.pot), 0)
  const settledCount = poolList.filter((p) => p.settled).length

  return (
    <main>
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: 1, minWidth: 180 }}>
          <div className="small dim">OPEN ESCROW</div>
          <div style={{ fontSize: 24, marginTop: 6 }}>{totalEscrow.toFixed(0)} kUSD</div>
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 180 }}>
          <div className="small dim">POOLS</div>
          <div style={{ fontSize: 24, marginTop: 6 }}>
            {poolList.length} <span className="small dim">({settledCount} settled by proof)</span>
          </div>
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 180 }}>
          <div className="small dim">DATA SOURCE</div>
          <div style={{ fontSize: 13, marginTop: 10 }}>
            TxLINE StablePrice ·{" "}
            {cached ? (
              <span style={{ color: "#e8b84b" }}>cached {cached.slice(0, 10)}</span>
            ) : (
              <span className="live">devnet stream</span>
            )}
          </div>
        </div>
      </div>

      {!loaded && <div className="dim small">loading TxLINE feed…</div>}

      <div className="grid">
        {rows.map(({ f, s, o }) => {
          const live = s && s.phase >= 2 && s.phase !== 5 && s.phase !== 19
          const pot = potByFixture.get(f.FixtureId) ?? 0
          return (
            <div className="panel" key={f.FixtureId}>
              <div className="rowhead">
                <span>WORLD CUP · {f.FixtureId}</span>
                <span className={live ? "live" : "dim"}>
                  {live
                    ? `● ${phaseLabel(s!.phase, s!.clockSec)}`
                    : s?.phase === 5
                      ? "FT"
                      : new Date(f.StartTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <div className="team">
                <span>{flag(f.Participant1)}</span> {f.Participant1}
                <span className="score">{s?.home ?? ""}</span>
              </div>
              <div className="team">
                <span>{flag(f.Participant2)}</span> {f.Participant2}
                <span className="score">{s?.away ?? ""}</span>
              </div>
              {o && (
                <div className="oddsrow">
                  {([["1", o.home, o.pct?.[0]], ["X", o.draw, o.pct?.[1]], ["2", o.away, o.pct?.[2]]] as const).map(
                    ([k, price, pct]) => (
                      <div className="odds" key={k}>
                        <div className="k">{k}</div>
                        <div className="p">{price ? price.toFixed(2) : "—"}</div>
                        {pct != null && (
                          <>
                            <div className="bar">
                              <i style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                            <div className="pc">{pct.toFixed(1)}%</div>
                          </>
                        )}
                      </div>
                    ),
                  )}
                </div>
              )}
              {pot > 0 && (
                <div style={{ marginTop: 10 }}>
                  <span className="pill gold">◆ {pot.toFixed(0)} kUSD in pools</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
