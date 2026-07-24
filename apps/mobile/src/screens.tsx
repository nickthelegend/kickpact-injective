/**
 * Kickpact screens — Injective era. Same pixel cabinet, new engine:
 *   • API-Football real-time World Cup data (fixtures / live scores / odds)
 *   • kUSD prediction pools escrowed by the Kickpact contract on Injective EVM
 *   • settlement receipts backed by an M-of-N oracle-signed final score —
 *     verifiable from the phone by re-recovering every EIP-712 signature in the
 *     settle calldata against the contract's oracle key set
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator, Linking, PermissionsAndroid, Platform, Pressable, ScrollView, Share,
  StyleSheet, TextInput, View,
} from "react-native"

import { C } from "./theme"
import { BalanceChip, Panel, PixelButton, PixelText } from "./ui"
import { QRCode } from "./qr"
import { useWallet } from "./wallet"
import {
  fetchGames, fetchScore, fetchOdds, filterGames, kickoffLabel, feed,
  PHASE_ENDED,
  type Filter, type Game, type LiveScore, type OddsLine,
} from "./feed"
import {
  EXPLORER, EXPLORER_ACCT, OUTCOMES, claim, createPool, faucet,
  joinPool, duelDeadlineMs, duelJoinable, getPool, latestPoolTx, allPools,
  poolsForFixture, myPick, pickName, shortAddr, verifySettlement, KICKPACT_ADDR, ORACLE_SIGNERS,
  ORACLE_THRESHOLD, KICKPACT_USDC_ADDR,
  type PoolOutcome, type PoolState, type Settlement,
} from "./injective"
import * as nearby from "./nearby"

const USDT_ICON = require("../assets/tokens/usdc-icon.png")

// ─────────────────────────────────────────────────────────────── sign in ──
export function SignInScreen() {
  const { createBurner, importBurner, confirmBackup, status, privyAvailable, loginPrivy } = useWallet()
  const [busy, setBusy] = useState<"privy" | "burner" | "import" | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [phrase, setPhrase] = useState("")
  const [err, setErr] = useState<string | null>(null)

  const doPrivy = async () => {
    setBusy("privy")
    setErr(null)
    try {
      await loginPrivy()
    } catch (e: any) {
      // Privy rejects the whole app when this build's package id / scheme isn't
      // on the dashboard allowlist — the SDK surfaces that as a generic
      // "login flow was closed", which reads like the user cancelled. Say what
      // actually happened and point at the way in that always works.
      const raw = String(e?.message ?? e)
      setErr(
        /native_app_id|not allowed|allowlist/i.test(raw)
          ? "this build isn't on the Privy allowlist yet — use a burner below"
          : `${raw.slice(0, 80)} — you can still use a burner below`,
      )
    } finally {
      setBusy(null)
    }
  }
  const doCreateBurner = async () => {
    setBusy("burner")
    setErr(null)
    try {
      setSecret(await createBurner())
    } catch (e: any) {
      setErr(String(e.message ?? e))
    } finally {
      setBusy(null)
    }
  }
  const doImport = async () => {
    setBusy("import")
    setErr(null)
    try {
      await importBurner(phrase)
    } catch {
      setErr("invalid private key")
    } finally {
      setBusy(null)
    }
  }

  if (status === "BACKUP_PENDING" && secret) {
    return (
      <ScrollView contentContainerStyle={s.signWrap}>
        <PixelText size={26} style={{ textAlign: "center" }}>Back up your key</PixelText>
        <PixelText size={11} color={C.white60} style={{ textAlign: "center", marginTop: 8 }} upper={false}>
          This 0x private key IS your burner wallet. Store it somewhere safe.
        </PixelText>
        <Panel style={{ padding: 14, marginTop: 18 }}>
          <PixelText size={12} upper={false} style={{ lineHeight: 20 }}>{secret}</PixelText>
        </Panel>
        <PixelButton label="I'VE SAVED IT — ENTER" onPress={confirmBackup} style={{ marginTop: 18 }} />
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={s.signWrap}>
      <PixelText size={40} style={{ textAlign: "center" }} upper={false}>⚽️🔒</PixelText>
      <PixelText size={26} style={{ textAlign: "center", marginTop: 10 }}>Ready for the final?</PixelText>
      <PixelText size={10} color={C.ethLight} style={{ textAlign: "center", marginTop: 8 }} tracking={2}>
        SELF-CUSTODIAL · API-FOOTBALL DATA · INJECTIVE EVM
      </PixelText>

      {importing ? (
        <>
          <Panel style={{ padding: 12, marginTop: 22 }}>
            <TextInput
              value={phrase}
              onChangeText={setPhrase}
              placeholder="0x private key"
              placeholderTextColor={C.white35}
              multiline
              style={s.input}
            />
          </Panel>
          <PixelButton label={busy === "import" ? "…" : "IMPORT"} onPress={doImport} style={{ marginTop: 14 }} />
          <PixelButton label="BACK" color={C.importBlue} onPress={() => setImporting(false)} style={{ marginTop: 10 }} />
        </>
      ) : (
        <>
          {/* PRIMARY — Privy: email or a social account, wallet created for you */}
          {privyAvailable && (
            <>
              <PixelButton
                label={busy === "privy" ? "OPENING…" : "◆ SIGN IN"}
                onPress={doPrivy}
                color={C.eth}
                style={{ marginTop: 26 }}
              />
              <PixelText size={9} color={C.white45} style={{ textAlign: "center", marginTop: 8 }} upper={false}>
                Email · Google · X · GitHub · LinkedIn — a self-custodial Injective wallet is created for you. No seed phrase.
              </PixelText>
              <View style={{ height: 1, backgroundColor: C.white15, marginVertical: 18 }} />
            </>
          )}

          {/* BURNER — always available, and the default when Privy isn't set up */}
          <PixelText size={9} color={C.white45} style={{ textAlign: "center" }} tracking={2}>
            {privyAvailable ? "OR USE A BURNER WALLET" : "USE A BURNER WALLET"}
          </PixelText>
          <PixelButton
            label={busy === "burner" ? "…" : "CREATE A BURNER WALLET"}
            onPress={doCreateBurner}
            color={C.green}
            style={{ marginTop: 12 }}
          />
          <PixelButton
            label="IMPORT PRIVATE KEY"
            onPress={() => setImporting(true)}
            color={C.importBlue}
            style={{ marginTop: 10 }}
          />
        </>
      )}
      {err && (
        <PixelText size={10} color={C.amber} style={{ textAlign: "center", marginTop: 14 }} upper={false}>{err}</PixelText>
      )}
    </ScrollView>
  )
}

// ─────────────────────────────────────────────────────────────── header ──
export function WalletHeader({ onAvatar, onFaucet }: { onAvatar?: () => void; onFaucet?: () => void }) {
  const { kusd, inj, address } = useWallet()
  return (
    <View style={s.header}>
      <Pressable onPress={onAvatar} style={s.avatar}>
        <PixelText size={13} upper={false}>{address ? address.slice(0, 2) : "?"}</PixelText>
      </Pressable>
      <BalanceChip icon={USDT_ICON} amount={`$ ${kusd.toFixed(2)}`} onPressAdd={onFaucet} />
      <View style={{ flex: 1 }} />
      <Panel style={{ paddingHorizontal: 10, paddingVertical: 5 }}>
        <PixelText size={10} upper={false} color={C.white60}>{inj.toFixed(3)} INJ</PixelText>
      </Panel>
    </View>
  )
}

// ─────────────────────────────────────────────────────────── game cards ──
function TeamRow({ flag, name, score, winner }: { flag: string; name: string; score: string | null; winner: boolean }) {
  return (
    <View style={s.teamRow}>
      <PixelText size={16} upper={false}>{flag}</PixelText>
      <PixelText size={13} style={{ flex: 1, marginLeft: 8 }} color={winner ? C.gold : C.white} upper={false}>
        {name}
      </PixelText>
      <PixelText size={14} color={winner ? C.gold : C.white70}>{score ?? ""}</PixelText>
    </View>
  )
}

function GameCard({ g, onPress }: { g: Game; onPress: () => void }) {
  const live = g.state === "in"
  return (
    <Pressable onPress={onPress}>
      <Panel style={{ padding: 12, marginBottom: 10, borderColor: live ? C.green : C.panelBorder }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <PixelText size={9} color={g.round === "SEMI-FINAL" ? C.gold : C.white45} tracking={2}>
            {g.round ? `WORLD CUP · ${g.round}` : "WORLD CUP"}
          </PixelText>
          <PixelText size={9} color={live ? C.greenLight : C.white45} tracking={2} upper={false}>
            {live ? `● ${g.status}` : g.state === "post" ? "FT" : kickoffLabel(g)}
          </PixelText>
        </View>
        <TeamRow flag={g.home.flag} name={g.home.name} score={g.home.score} winner={g.home.winner} />
        <TeamRow flag={g.away.flag} name={g.away.name} score={g.away.score} winner={g.away.winner} />
      </Panel>
    </Pressable>
  )
}

// ───────────────────────────────────────────────────────────────── home ──
export function HomeScreen({ onProfile, onGame }: { onProfile?: () => void; onGame: (id: string) => void }) {
  const { kusd, getSigner, address, refresh } = useWallet()
  const [games, setGames] = useState<Game[]>([])
  const [filter, setFilter] = useState<Filter>("upcoming")
  const [loading, setLoading] = useState(true)
  const [minting, setMinting] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [feedDown, setFeedDown] = useState<{ reason: string; capturedAt: string | null } | null>(null)

  const load = useCallback(async () => {
    try {
      setGames(await fetchGames())
      setNote(null)
      // fetchGames falls back to the bundled snapshot rather than throwing —
      // say so plainly instead of pretending the feed is live.
      setFeedDown(feed.live ? null : { reason: feed.reason ?? "live feed unavailable", capturedAt: feed.capturedAt })
    } catch (e: any) {
      setNote(`feed: ${String(e.message ?? e).slice(0, 60)}`)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [load])

  const doFaucet = async () => {
    if (!address || minting) return
    setMinting(true)
    setNote(null)
    try {
      const hash = await faucet(await getSigner(), 100)
      setNote(`minted 100 kUSD · ${hash.slice(0, 10)}…`)
      refresh()
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 80))
    } finally {
      setMinting(false)
    }
  }

  const shown = filterGames(games, filter)
  return (
    <View style={{ flex: 1 }}>
      <WalletHeader onAvatar={onProfile} onFaucet={doFaucet} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
        <Panel style={{ padding: 14, marginBottom: 14 }}>
          <PixelText size={9} color={C.white45} tracking={2}>TOTAL BALANCE</PixelText>
          <PixelText size={30} style={{ marginTop: 6 }} upper={false}>$ {kusd.toFixed(2)}</PixelText>
          <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
            kUSD · Injective EVM · pools escrowed on-chain
          </PixelText>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <PixelButton label={minting ? "…" : "+ MINT"} onPress={doFaucet} size={12} style={{ flex: 1, paddingVertical: 9 }} />
          </View>
          {note && (
            <PixelText size={9} color={C.amber} style={{ marginTop: 8 }} upper={false}>{note}</PixelText>
          )}
        </Panel>

        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <PixelText size={20}>Semi-finals</PixelText>
          <PixelText size={8} color={feedDown ? C.gold : C.white45} tracking={2}>
            {feedDown ? "WORLD CUP · LAST FOUR" : "API-FOOTBALL · POOLS ON INJECTIVE"}
          </PixelText>
        </View>

        {feedDown && (
          <Panel style={{ padding: 12, marginTop: 10, borderColor: C.gold }}>
            <PixelText size={9} color={C.gold} tracking={2}>WORLD CUP · SEMI-FINALS</PixelText>
            <PixelText size={10} color={C.white60} style={{ marginTop: 6 }} upper={false}>
              The last four. Lock a pick on who reaches the final.
            </PixelText>
            <PixelText size={9} color={C.white45} style={{ marginTop: 8 }} upper={false}>
              The pot is escrowed on Injective and pays out to the oracle-signed result — the keeper reads the same
              fixtures, so the pool you open and the score that settles it always agree.
            </PixelText>
          </Panel>
        )}

        <View style={s.filters}>
          {(["live", "upcoming", "completed"] as Filter[]).map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)} style={[s.filter, filter === f && s.filterOn]}>
              <PixelText size={10} color={filter === f ? C.white : C.white45}>{f}</PixelText>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={C.eth} style={{ marginTop: 30 }} />
        ) : shown.length === 0 ? (
          <PixelText size={11} color={C.white45} style={{ textAlign: "center", marginTop: 26 }}>
            no {filter} matches
          </PixelText>
        ) : (
          shown.map((g) => <GameCard key={g.id} g={g} onPress={() => onGame(g.id)} />)
        )}
      </ScrollView>
    </View>
  )
}

// ──────────────────────────────────────────────────────── match + pools ──
function OddsPanel({ odds }: { odds: OddsLine | null }) {
  if (!odds) return null
  const cells: { k: string; price: number | null; pct: number | null }[] = [
    { k: "1", price: odds.home, pct: odds.pct?.[0] ?? null },
    { k: "X", price: odds.draw, pct: odds.pct?.[1] ?? null },
    { k: "2", price: odds.away, pct: odds.pct?.[2] ?? null },
  ]
  return (
    <Panel style={{ padding: 12, marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <PixelText size={9} color={C.white45} tracking={2}>1X2 ODDS · API-FOOTBALL</PixelText>
        <PixelText size={8} color={C.white35} upper={false}>{odds.ts ? new Date(odds.ts).toLocaleTimeString() : ""}</PixelText>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        {cells.map((c) => (
          <View key={c.k} style={s.oddsCell}>
            <PixelText size={9} color={C.white45}>{c.k}</PixelText>
            <PixelText size={16} style={{ marginTop: 2 }} upper={false}>
              {c.price ? c.price.toFixed(2) : "—"}
            </PixelText>
            {c.pct != null && (
              <>
                <View style={s.pctTrack}>
                  <View style={[s.pctFill, { width: `${Math.min(100, c.pct)}%` }]} />
                </View>
                <PixelText size={8} color={C.ethLight} upper={false}>{c.pct.toFixed(1)}%</PixelText>
              </>
            )}
          </View>
        ))}
      </View>
    </Panel>
  )
}

function PickSelector({ g, pick, setPick }: { g: Game; pick: PoolOutcome; setPick: (p: PoolOutcome) => void }) {
  const labels: Record<PoolOutcome, string> = {
    home: `${g.home.flag} ${g.home.abbrev}`,
    draw: "DRAW",
    away: `${g.away.flag} ${g.away.abbrev}`,
  }
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {OUTCOMES.map((o) => (
        <Pressable key={o} onPress={() => setPick(o)} style={[s.pickBtn, pick === o && s.pickOn]}>
          <PixelText size={10} color={pick === o ? C.white : C.white60} upper={false}>{labels[o]}</PixelText>
        </Pressable>
      ))}
    </View>
  )
}

function PoolCard({
  g, p, onChanged, onReceipt,
}: { g: Game; p: PoolState; onChanged: () => void; onReceipt: (p: PoolState) => void }) {
  const { getSigner, address, connection } = useWallet()
  const [mine, setMine] = useState<{ pick: number; claimed: boolean } | null>(null)
  const [pick, setPick] = useState<PoolOutcome>("home")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (address) myPick(connection, p.id, address).then(setMine).catch(() => {})
  }, [address, connection, p.id, p.settled, p.memberCount])

  const joinOpen = !p.settled && Date.now() < p.deadlineMs
  const iWon = p.settled && mine && (p.winners === 0 || mine.pick === p.result)

  const doJoin = async () => {
    if (!address || busy) return
    setBusy(true)
    setNote(null)
    try {
      await joinPool(await getSigner(), p.id, pick)
      onChanged()
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 90))
    } finally {
      setBusy(false)
    }
  }
  const doClaim = async () => {
    if (!address || busy) return
    setBusy(true)
    setNote(null)
    try {
      await claim(await getSigner(), p.id)
      onChanged()
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 90))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel style={{ padding: 12, marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <PixelText size={11} color={C.gold}>POOL #{String(p.id)}</PixelText>
        <PixelText size={10} color={C.white60} upper={false}>
          {p.memberCount} in · {p.pot.toFixed(0)} kUSD pot
        </PixelText>
      </View>
      <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
        stake {p.stake.toFixed(0)} kUSD · picks {g.home.abbrev} {p.pickCounts[0]} / X {p.pickCounts[1]} / {g.away.abbrev} {p.pickCounts[2]}
      </PixelText>

      {p.settled ? (
        <>
          <PixelText size={10} color={C.greenLight} style={{ marginTop: 8 }}>
            SETTLED · {pickName(p.result)?.toUpperCase()} · {p.winners} WINNER{p.winners === 1 ? "" : "S"}
          </PixelText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {iWon && !mine?.claimed && (
              <PixelButton label={busy ? "…" : "CLAIM"} onPress={doClaim} size={11} style={{ flex: 1, paddingVertical: 8 }} />
            )}
            {mine?.claimed && (
              <Panel style={{ flex: 1, padding: 8, alignItems: "center" }}>
                <PixelText size={10} color={C.white45}>CLAIMED ✓</PixelText>
              </Panel>
            )}
            <PixelButton label="RECEIPT" color={C.importBlue} onPress={() => onReceipt(p)} size={11} style={{ flex: 1, paddingVertical: 8 }} />
          </View>
        </>
      ) : mine ? (
        <PixelText size={10} color={C.ethLight} style={{ marginTop: 8 }} upper={false}>
          you're in — picked {pickName(mine.pick)?.toUpperCase()}
        </PixelText>
      ) : joinOpen ? (
        <>
          <View style={{ marginTop: 10 }}>
            <PickSelector g={g} pick={pick} setPick={setPick} />
          </View>
          <PixelButton label={busy ? "…" : `JOIN · ${p.stake.toFixed(0)} KUSD`} onPress={doJoin} size={11} style={{ marginTop: 8, paddingVertical: 9 }} />
        </>
      ) : (
        <PixelText size={10} color={C.white45} style={{ marginTop: 8 }}>LOCKED — AWAITING RESULT</PixelText>
      )}
      {note && <PixelText size={9} color={C.amber} style={{ marginTop: 6 }} upper={false}>{note}</PixelText>}
    </Panel>
  )
}

export function GameScreen({ gameId, onBack, onReceipt }: { gameId: string; onBack: () => void; onReceipt: (p: PoolState) => void }) {
  const { getSigner, address, connection, refresh } = useWallet()
  const [g, setG] = useState<Game | null>(null)
  const [score, setScore] = useState<LiveScore | null>(null)
  const [odds, setOdds] = useState<OddsLine | null>(null)
  const [pools, setPools] = useState<PoolState[]>([])
  const [stake, setStake] = useState("10")
  const [pick, setPick] = useState<PoolOutcome>("home")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const loadPools = useCallback(() => {
    poolsForFixture(connection, Number(gameId)).then(setPools).catch(() => {})
  }, [connection, gameId])

  useEffect(() => {
    fetchGames().then((all) => setG(all.find((x) => x.id === gameId) ?? null))
    fetchOdds(Number(gameId)).then(setOdds).catch(() => {})
    loadPools()
  }, [gameId, loadPools])

  // live score poll
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const sc = await fetchScore(Number(gameId))
        if (!stop) setScore(sc)
      } catch {}
    }
    tick()
    const id = setInterval(tick, 6000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [gameId])

  if (!g) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.eth} />
      </View>
    )
  }

  const h = score?.home ?? (g.home.score != null ? Number(g.home.score) : null)
  const a = score?.away ?? (g.away.score != null ? Number(g.away.score) : null)
  const phase = score?.phase ?? g.phase
  const live = phase >= 2 && phase !== PHASE_ENDED && phase !== 19

  const doCreate = async () => {
    if (!address || busy) return
    const stakeN = Number(stake)
    if (!stakeN || stakeN <= 0) {
      setNote("enter a stake")
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const deadline = Math.max(g.kickoffMs, Date.now() + 60_000)
      const { hash } = await createPool(await getSigner(), g.fixtureId, stakeN, deadline, g.kickoffMs, pick)
      setNote(`pool opened · ${hash.slice(0, 10)}…`)
      refresh()
      loadPools()
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 90))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <Pressable onPress={onBack}>
        <PixelText size={11} color={C.white60}>‹ BACK</PixelText>
      </Pressable>

      <Panel style={{ padding: 16, marginTop: 12 }}>
        <PixelText size={9} color={live ? C.greenLight : C.white45} tracking={2} style={{ textAlign: "center" }} upper={false}>
          {live ? `● LIVE · ${score ? phaseL(score) : g.status}` : phase === PHASE_ENDED ? "FULL TIME" : kickoffLabel(g)}
        </PixelText>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          <View style={{ flex: 1, alignItems: "center" }}>
            <PixelText size={30} upper={false}>{g.home.flag}</PixelText>
            <PixelText size={11} style={{ marginTop: 6, textAlign: "center" }} upper={false}>{g.home.name}</PixelText>
          </View>
          <PixelText size={30} upper={false}>{h != null ? h : "–"} : {a != null ? a : "–"}</PixelText>
          <View style={{ flex: 1, alignItems: "center" }}>
            <PixelText size={30} upper={false}>{g.away.flag}</PixelText>
            <PixelText size={11} style={{ marginTop: 6, textAlign: "center" }} upper={false}>{g.away.name}</PixelText>
          </View>
        </View>
        {score?.action && live && (
          <PixelText size={9} color={C.amber} style={{ textAlign: "center", marginTop: 8 }} upper={false}>
            {score.action.replace(/_/g, " ")}
          </PixelText>
        )}
      </Panel>

      <OddsPanel odds={odds} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 }}>
        <PixelText size={15}>Group pools</PixelText>
        <PixelText size={8} color={C.white45} tracking={1}>SETTLED BY ORACLE SIGNATURE</PixelText>
      </View>
      {pools.length === 0 && (
        <PixelText size={10} color={C.white45} style={{ marginTop: 8 }} upper={false}>
          no pools yet — open the first one
        </PixelText>
      )}
      {pools.map((p) => (
        <PoolCard key={String(p.id)} g={g} p={p} onChanged={() => { loadPools(); refresh() }} onReceipt={onReceipt} />
      ))}

      {phase !== PHASE_ENDED && (
        <Panel style={{ padding: 12, marginTop: 14 }}>
          <PixelText size={11} color={C.gold}>OPEN A POOL</PixelText>
          <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
            friends stake the same, winners split the pot — the contract holds the money
          </PixelText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
            <Panel style={{ flex: 1, paddingHorizontal: 10 }}>
              <TextInput
                value={stake}
                onChangeText={setStake}
                keyboardType="numeric"
                placeholder="stake"
                placeholderTextColor={C.white35}
                style={[s.input, { paddingVertical: 8 }]}
              />
            </Panel>
            <PixelText size={10} color={C.white45}>KUSD</PixelText>
          </View>
          <View style={{ marginTop: 10 }}>
            <PickSelector g={g} pick={pick} setPick={setPick} />
          </View>
          <PixelButton label={busy ? "…" : "CREATE POOL"} onPress={doCreate} style={{ marginTop: 10 }} size={12} />
          {note && <PixelText size={9} color={C.amber} style={{ marginTop: 8 }} upper={false}>{note}</PixelText>}
        </Panel>
      )}
    </ScrollView>
  )
}

function phaseL(sc: LiveScore): string {
  if (sc.clockSec != null) return `${Math.floor(sc.clockSec / 60)}'`
  return "LIVE"
}

// ───────────────────────────────────────────────────────────── receipts ──
export function ReceiptsScreen({ onOpen }: { onOpen: (p: PoolState) => void }) {
  const { connection } = useWallet()
  const [pools, setPools] = useState<PoolState[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([allPools(connection), fetchGames()])
      .then(([ps, gs]) => {
        setPools(ps)
        setGames(gs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [connection])

  const gameFor = (p: PoolState) => games.find((g) => g.fixtureId === Number(p.fixtureId))
  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <PixelText size={20}>Receipts</PixelText>
      <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
        every settlement traces to a final score co-signed by
        {ORACLE_SIGNERS.length ? ` a ${ORACLE_THRESHOLD}-of-${ORACLE_SIGNERS.length} oracle set` : " the oracle set"},
        verified on Injective
      </PixelText>
      {loading ? (
        <ActivityIndicator color={C.eth} style={{ marginTop: 30 }} />
      ) : pools.length === 0 ? (
        <PixelText size={11} color={C.white45} style={{ textAlign: "center", marginTop: 30 }}>
          no pools yet
        </PixelText>
      ) : (
        pools.map((p) => {
          const g = gameFor(p)
          return (
            <Pressable key={String(p.id)} onPress={() => onOpen(p)}>
              <Panel style={{ padding: 12, marginTop: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <PixelText size={11} color={p.settled ? C.greenLight : C.gold}>
                    {p.settled ? "SETTLED ✓" : "OPEN"}
                  </PixelText>
                  <PixelText size={10} color={C.white45}>POOL #{String(p.id)}</PixelText>
                </View>
                <PixelText size={12} style={{ marginTop: 6 }} upper={false}>
                  {g ? `${g.home.flag} ${g.home.name} v ${g.away.name} ${g.away.flag}` : `fixture ${p.fixtureId}`}
                </PixelText>
                <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
                  {p.memberCount} members · pot {p.pot.toFixed(0)} kUSD
                  {p.settled ? ` · result ${pickName(p.result)?.toUpperCase()}` : ""}
                </PixelText>
              </Panel>
            </Pressable>
          )
        })
      )}
    </ScrollView>
  )
}

export function ReceiptScreen({ pool, onBack }: { pool: PoolState; onBack: () => void }) {
  const { connection } = useWallet()
  const [g, setG] = useState<Game | null>(null)
  const [settlement, setSettlement] = useState<Settlement | null>(null)
  const [txSig, setTxSig] = useState<string | null>(null)
  const usdcEscrow = KICKPACT_USDC_ADDR // null when this deployment has no USDC escrow

  useEffect(() => {
    fetchGames().then((all) => setG(all.find((x) => x.fixtureId === Number(pool.fixtureId)) ?? null)).catch(() => {})
    latestPoolTx(connection, pool.id).then(setTxSig).catch(() => {})
  }, [connection, pool])

  useEffect(() => {
    if (!pool.settled) return
    // Re-verify the receipt from the phone: recover EVERY EIP-712 signature in
    // the settle calldata and count how many of the oracle keys really signed.
    verifySettlement(connection, pool.id).then(setSettlement).catch(() => {})
  }, [connection, pool])

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <Pressable onPress={onBack}>
        <PixelText size={11} color={C.white60}>‹ BACK</PixelText>
      </Pressable>

      <PixelText size={20} style={{ marginTop: 12 }}>Receipt · Pool #{String(pool.id)}</PixelText>
      {g && (
        <PixelText size={12} style={{ marginTop: 6 }} upper={false}>
          {g.home.flag} {g.home.name} {g.home.score ?? ""} : {g.away.score ?? ""} {g.away.name} {g.away.flag}
        </PixelText>
      )}

      <Panel style={{ padding: 14, marginTop: 12 }}>
        <PixelText size={9} color={C.white45} tracking={2}>SETTLEMENT</PixelText>
        <PixelText size={12} style={{ marginTop: 6 }} upper={false}>
          {pool.settled
            ? `result: ${pickName(pool.result)?.toUpperCase()} · ${pool.winners} winner${pool.winners === 1 ? "" : "s"} split ${pool.pot.toFixed(0)} kUSD`
            : "not settled yet"}
        </PixelText>
        {txSig && (
          <Pressable onPress={() => Linking.openURL(EXPLORER(txSig))}>
            <PixelText size={9} color={C.ethLight} style={{ marginTop: 8 }} upper={false}>
              ↗ settle tx: {txSig.slice(0, 16)}… (explorer)
            </PixelText>
          </Pressable>
        )}
      </Panel>

      <Panel style={{ padding: 14, marginTop: 12 }}>
        <PixelText size={9} color={C.white45} tracking={2}>ORACLE ATTESTATION</PixelText>
        {pool.settled && settlement ? (
          <>
            <PixelText size={11} color={C.white60} style={{ marginTop: 8 }} upper={false}>
              final score signed by the oracles: {settlement.homeGoals}–{settlement.awayGoals}
            </PixelText>
            <PixelText size={9} color={C.white45} style={{ marginTop: 6 }} upper={false}>
              the contract derived {settlement.outcome?.toUpperCase()} from these goals on-chain — the oracles report
              the score, the contract decides the outcome.
            </PixelText>
            <PixelText size={9} color={C.white45} style={{ marginTop: 8 }} upper={false}>
              {settlement.threshold} of {settlement.signerCount} keys must co-sign — no single signer can settle.
            </PixelText>

            {settlement.recovered.length > 0 ? (
              settlement.recovered.map((r, i) => (
                <PixelText
                  key={`${r.address ?? "bad"}-${i}`}
                  size={9}
                  color={r.member ? C.greenLight : "#a33b3b"}
                  style={{ marginTop: 6 }}
                  upper={false}
                >
                  {r.member ? "✓" : "✕"} {r.address ? shortAddr(r.address) : "unrecoverable signature"}
                  {r.member ? " · oracle key" : " · not in the oracle set"}
                </PixelText>
              ))
            ) : (
              settlement.oracleSigners.map((s) => (
                <PixelText key={s} size={9} color={C.white45} style={{ marginTop: 6 }} upper={false}>
                  · {shortAddr(s)} · oracle key
                </PixelText>
              ))
            )}

            <PixelText size={8} color={C.white45} style={{ marginTop: 8 }} upper={false}>
              {settlement.source === "signatures"
                ? "recovered from the settle calldata on this phone"
                : "calldata unavailable from the rpc — the contract verified the set on-chain"}
            </PixelText>

            <Panel
              style={{
                padding: 8,
                marginTop: 10,
                alignItems: "center",
                borderColor: settlement.verified ? C.green : "#a33b3b",
              }}
            >
              <PixelText size={10} color={settlement.verified ? C.green : "#a33b3b"}>
                {settlement.verified
                  ? `ORACLE SIGNATURES · ${settlement.verifiedCount} OF ${settlement.signerCount} VERIFIED ✓`
                  : `ONLY ${settlement.verifiedCount} OF ${settlement.threshold} SIGNATURES VERIFIED`}
              </PixelText>
            </Panel>
          </>
        ) : (
          <PixelText size={9} color={C.white45} style={{ marginTop: 8 }} upper={false}>
            {pool.settled ? "verifying the oracle signatures…" : "no attestation until the pool settles"}
          </PixelText>
        )}
      </Panel>

      <Panel style={{ padding: 14, marginTop: 12 }}>
        <PixelText size={9} color={C.white45} tracking={2}>CONTRACTS</PixelText>
        <Pressable onPress={() => Linking.openURL(EXPLORER_ACCT(KICKPACT_ADDR))}>
          <PixelText size={9} color={C.ethLight} style={{ marginTop: 8 }} upper={false}>
            ↗ kickpact · kUSD {shortAddr(KICKPACT_ADDR)}
          </PixelText>
        </Pressable>
        {usdcEscrow && (
          <Pressable onPress={() => Linking.openURL(EXPLORER_ACCT(usdcEscrow))}>
            <PixelText size={9} color={C.ethLight} style={{ marginTop: 6 }} upper={false}>
              ↗ kickpact · usdc {shortAddr(usdcEscrow)}
            </PixelText>
          </Pressable>
        )}
        {(settlement?.oracleSigners ?? ORACLE_SIGNERS).map((s, i) => (
          <Pressable key={s} onPress={() => Linking.openURL(EXPLORER_ACCT(s))}>
            <PixelText size={9} color={C.ethLight} style={{ marginTop: 6 }} upper={false}>
              ↗ oracle key {i + 1} {shortAddr(s)}
            </PixelText>
          </Pressable>
        ))}
      </Panel>
    </ScrollView>
  )
}

// ────────────────────────────────────────────────────────────── profile ──
export function ProfileScreen() {
  const { address, inj, kusd, mode, logout, getSecret } = useWallet()
  const [secret, setSecret] = useState<string | null>(null)

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <PixelText size={20}>Profile</PixelText>

      <Panel style={{ padding: 16, marginTop: 12, alignItems: "center" }}>
        {address && <QRCode value={address} size={140} />}
        <PixelText size={10} style={{ marginTop: 10 }} upper={false}>{address}</PixelText>
        <PixelText size={9} color={C.white45} style={{ marginTop: 4 }}>
          {mode === "privy" ? "PRIVY · EMBEDDED EVM WALLET" : "BURNER · KEY IN DEVICE KEYCHAIN"}
        </PixelText>
      </Panel>

      <Panel style={{ padding: 14, marginTop: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <PixelText size={11} upper={false}>kUSD</PixelText>
          <PixelText size={11} upper={false}>$ {kusd.toFixed(2)}</PixelText>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
          <PixelText size={11} upper={false}>INJ (gas)</PixelText>
          <PixelText size={11} upper={false}>{inj.toFixed(4)} INJ</PixelText>
        </View>
        <PixelText size={8} color={C.white45} style={{ marginTop: 8 }} upper={false}>
          need gas? testnet.faucet.injective.network → {shortAddr(address)}
        </PixelText>
      </Panel>

      {mode === "burner" && (
        <Panel style={{ padding: 14, marginTop: 12 }}>
          <PixelText size={9} color={C.white45} tracking={2}>RECOVERY</PixelText>
          {secret ? (
            <PixelText size={10} style={{ marginTop: 8, lineHeight: 18 }} upper={false}>{secret}</PixelText>
          ) : (
            <PixelButton
              label="REVEAL SECRET KEY"
              color={C.importBlue}
              size={11}
              style={{ marginTop: 10 }}
              onPress={async () => setSecret(await getSecret())}
            />
          )}
        </Panel>
      )}

      <PixelButton label="LOG OUT" color="#a33b3b" style={{ marginTop: 16 }} onPress={logout} />
    </ScrollView>
  )
}

// ──────────────────────────────────────────────────────────────── duels ──
// A "duel" is a group pot: friends stake the same kUSD on a match and pick an
// outcome — settled by an oracle-signed final score. They gather two ways: over Bluetooth
// (in person, with live chat) or by an online code (from anywhere).

async function requestNearbyPerms(): Promise<boolean> {
  if (Platform.OS !== "android") return false
  const P: any = PermissionsAndroid.PERMISSIONS
  const want = [
    P.ACCESS_FINE_LOCATION,
    P.BLUETOOTH_ADVERTISE,
    P.BLUETOOTH_CONNECT,
    P.BLUETOOTH_SCAN,
    P.NEARBY_WIFI_DEVICES,
  ].filter(Boolean)
  try {
    const res = await PermissionsAndroid.requestMultiple(want)
    return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED)
  } catch {
    return false
  }
}

function FixturePicker({ games, value, onPick }: { games: Game[]; value: Game | null; onPick: (g: Game) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
      {games.map((g) => {
        const on = value?.id === g.id
        return (
          <Pressable key={g.id} onPress={() => onPick(g)} style={[s.fxChip, on && s.fxChipOn]}>
            <PixelText size={11} upper={false}>{g.home.flag} {g.home.abbrev} v {g.away.abbrev} {g.away.flag}</PixelText>
            <PixelText size={8} color={C.white45} style={{ marginTop: 3 }} upper={false}>{kickoffLabel(g)}</PixelText>
          </Pressable>
        )
      })}
      {games.length === 0 && <PixelText size={10} color={C.white45} upper={false}>loading fixtures…</PixelText>}
    </ScrollView>
  )
}

export function DuelsScreen({ onGame, onReceipt }: { onGame: (id: string) => void; onReceipt: (p: PoolState) => void }) {
  const [view, setView] = useState<"menu" | "nearby" | "online">("menu")
  if (view === "nearby") return <NearbyDuel onBack={() => setView("menu")} onGame={onGame} />
  if (view === "online") return <OnlineDuel onBack={() => setView("menu")} onGame={onGame} />
  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <PixelText size={20}>Duels</PixelText>
      <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>
        pot up with friends on a match — everyone stakes, winners split, an oracle-signed score settles it
      </PixelText>

      <Pressable onPress={() => setView("nearby")}>
        <Panel style={{ padding: 16, marginTop: 14, borderColor: C.eth }}>
          <PixelText size={30} upper={false}>📡</PixelText>
          <PixelText size={14} style={{ marginTop: 8 }}>Nearby · Bluetooth</PixelText>
          <PixelText size={10} color={C.white60} style={{ marginTop: 6 }} upper={false}>
            Friends around you? Discover each other over Bluetooth, chat live, and pot up together — no server, no internet needed to coordinate.
          </PixelText>
        </Panel>
      </Pressable>

      <Pressable onPress={() => setView("online")}>
        <Panel style={{ padding: 16, marginTop: 12, borderColor: C.gold }}>
          <PixelText size={30} upper={false}>🌐</PixelText>
          <PixelText size={14} style={{ marginTop: 8 }}>Online · Duel code</PixelText>
          <PixelText size={10} color={C.white60} style={{ marginTop: 6 }} upper={false}>
            Friends far away? Open a duel, share the code, and everyone joins the same on-chain pot from anywhere.
          </PixelText>
        </Panel>
      </Pressable>

      <PixelText size={8} color={C.white35} style={{ marginTop: 16 }} upper={false}>
        The money always lives on Injective — Bluetooth/online only carry the chat and the invite. Multiple friends can join one pot.
      </PixelText>
    </ScrollView>
  )
}

// ── Bluetooth room ──────────────────────────────────────────────────────────
interface ChatLine {
  from: string
  text: string
  mine?: boolean
  system?: boolean
}

function NearbyDuel({ onBack, onGame }: { onBack: () => void; onGame: (id: string) => void }) {
  const { getSigner, address } = useWallet()
  const myName = address ? address.slice(0, 6) : "me"

  const [ready, setReady] = useState<"idle" | "starting" | "on" | "unsupported">("idle")
  const [found, setFound] = useState<nearby.Peer[]>([])
  const [peers, setPeers] = useState<Record<string, string>>({}) // peerId -> name
  const [chat, setChat] = useState<ChatLine[]>([])
  const [draft, setDraft] = useState("")
  const [games, setGames] = useState<Game[]>([])
  const [fixture, setFixture] = useState<Game | null>(null)
  const [stake, setStake] = useState("10")
  const [pick, setPick] = useState<PoolOutcome>("home")
  const [duel, setDuel] = useState<nearby.NearbyMsg & { t: "duel" } | null>(null)
  // Which side THIS device already staked in the current duel. The host is
  // entered by create_pool itself, so without this we'd keep offering them the
  // join buttons and every tap would bounce off the program as a duplicate.
  const [myPick, setMyPick] = useState<PoolOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const peersRef = useRef<Record<string, string>>({})
  peersRef.current = peers

  const say = (line: ChatLine) => setChat((c) => [...c.slice(-60), line])

  useEffect(() => {
    fetchGames()
      .then((all) =>
        setGames(
          filterGames(all, "upcoming")
            .concat(filterGames(all, "live"))
            .filter((g) => duelJoinable(g.kickoffMs))
            .slice(0, 12),
        ),
      )
      .catch(() => {})
  }, [])

  // start advertise + discover (mesh) and wire events
  useEffect(() => {
    if (!nearby.nearbyAvailable()) {
      setReady("unsupported")
      return
    }
    let subs: nearby.Unsub[] = []
    let alive = true
    ;(async () => {
      setReady("starting")
      const ok = await requestNearbyPerms()
      if (!ok) {
        setNote("Bluetooth/location permission denied")
        setReady("idle")
        return
      }
      if (!(await nearby.playServicesOk())) {
        setNote("Google Play services required")
        setReady("unsupported")
        return
      }
      subs = [
        nearby.onPeerFound((p) => alive && setFound((f) => (f.some((x) => x.peerId === p.peerId) ? f : [...f, p]))),
        nearby.onPeerLost(({ peerId }) => alive && setFound((f) => f.filter((x) => x.peerId !== peerId))),
        nearby.onInvitation((p) => nearby.acceptConnection(p.peerId)), // auto-accept friends
        nearby.onConnected((p) => {
          if (!alive) return
          setPeers((m) => ({ ...m, [p.peerId]: p.name }))
          setFound((f) => f.filter((x) => x.peerId !== p.peerId))
          say({ from: p.name, text: "joined the room", system: true })
          if (address) nearby.send(p.peerId, { t: "hello", addr: address, name: myName })
        }),
        nearby.onDisconnected(({ peerId }) => {
          if (!alive) return
          setPeers((m) => {
            const n = { ...m }
            delete n[peerId]
            return n
          })
        }),
        nearby.onMessage((peerId, msg) => {
          if (!alive) return
          if (msg.t === "chat") say({ from: peersRef.current[peerId] ?? msg.from, text: msg.text })
          else if (msg.t === "duel") {
            setDuel(msg)
            setMyPick(null) // somebody else's duel — we haven't staked in it yet
            say({ from: "★", text: `duel opened on the match · ${msg.stake} kUSD stake`, system: true })
          }
        }),
      ]
      try {
        await nearby.startAdvertise(myName)
        await nearby.startDiscovery(myName)
        if (alive) setReady("on")
      } catch (e: any) {
        setNote(String(e?.message ?? e).slice(0, 80))
        setReady("idle")
      }
    })()
    return () => {
      alive = false
      subs.forEach((u) => u())
      nearby.stopAll()
      nearby.disconnect()
    }
  }, [address])

  const peerIds = Object.keys(peers)

  const sendChat = () => {
    const text = draft.trim()
    if (!text) return
    say({ from: myName, text, mine: true })
    nearby.broadcast(peerIds, { t: "chat", from: myName, text, at: Date.now() })
    setDraft("")
  }

  const startDuel = async () => {
    if (!address || !fixture || busy) return
    const stakeN = Number(stake)
    if (!stakeN) return setNote("enter a stake")
    setBusy(true)
    setNote(null)
    try {
      const deadline = duelDeadlineMs(fixture.kickoffMs)
      const { poolId } = await createPool(await getSigner(), fixture.fixtureId, stakeN, deadline, fixture.kickoffMs, pick)
      const d = { t: "duel" as const, poolId: String(poolId), fixtureId: fixture.fixtureId, stake: stakeN, host: address! }
      setDuel(d)
      setMyPick(pick) // create_pool already staked us on this side
      nearby.broadcast(peerIds, d)
      say({ from: myName, text: `opened a duel · ${stakeN} kUSD · picked ${pick.toUpperCase()}`, system: true })
    } catch (e: any) {
      setNote(String(e.message ?? e).slice(0, 90))
    } finally {
      setBusy(false)
    }
  }

  const joinDuel = async (dpick: PoolOutcome) => {
    if (!address || !duel || busy) return
    setBusy(true)
    setNote(null)
    try {
      await joinPool(await getSigner(), BigInt(duel.poolId), dpick)
      setMyPick(dpick)
      say({ from: myName, text: `joined the pot · picked ${dpick.toUpperCase()}`, system: true })
      nearby.broadcast(peerIds, { t: "chat", from: myName, text: `I'm in — ${dpick.toUpperCase()}`, at: Date.now() })
    } catch (e: any) {
      // The contract rejects a second entry from the same wallet (AlreadyJoined).
      const raw = String(e?.message ?? e)
      setNote(
        /AlreadyJoined|already/i.test(raw)
          ? "you're already in this pot — one entry per wallet"
          : raw.slice(0, 90),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 20 }}>
        <Pressable onPress={onBack}><PixelText size={11} color={C.white60}>‹ DUELS</PixelText></Pressable>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
          <PixelText size={18}>Nearby room</PixelText>
          <PixelText size={9} color={ready === "on" ? C.greenLight : C.white45} tracking={1}>
            {ready === "on" ? `● LIVE · ${peerIds.length + 1} here` : ready === "starting" ? "starting…" : ready === "unsupported" ? "unavailable" : "off"}
          </PixelText>
        </View>

        {ready === "unsupported" && (
          <Panel style={{ padding: 12, marginTop: 12 }}>
            <PixelText size={10} color={C.amber} upper={false}>
              Bluetooth duels run on the Android app (Google Nearby Connections). Install the APK and open this on a device with a friend nearby.
            </PixelText>
          </Panel>
        )}

        {/* discovered friends */}
        {found.length > 0 && (
          <Panel style={{ padding: 12, marginTop: 12 }}>
            <PixelText size={9} color={C.white45} tracking={2}>FRIENDS NEARBY</PixelText>
            {found.map((p) => (
              <Pressable key={p.peerId} onPress={() => nearby.requestConnection(p.peerId)} style={s.peerRow}>
                <PixelText size={11} upper={false}>📲 {p.name}</PixelText>
                <PixelText size={9} color={C.ethLight}>CONNECT ›</PixelText>
              </Pressable>
            ))}
          </Panel>
        )}

        {/* connected peers */}
        {peerIds.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            <View style={s.peerPill}><PixelText size={9} upper={false}>🟢 you</PixelText></View>
            {peerIds.map((id) => (
              <View key={id} style={s.peerPill}><PixelText size={9} upper={false}>🟢 {peers[id]}</PixelText></View>
            ))}
          </View>
        )}

        {/* the duel */}
        {duel ? (
          <Panel style={{ padding: 12, marginTop: 12, borderColor: C.gold }}>
            <PixelText size={11} color={C.gold}>DUEL · POOL #{duel.poolId} · {duel.stake} kUSD</PixelText>
            {myPick ? (
              <PixelText size={10} color={C.greenLight} style={{ marginTop: 6 }} upper={false}>
                you're in — staked {duel.stake} kUSD on {myPick.toUpperCase()}
              </PixelText>
            ) : (
              <>
                <PixelText size={9} color={C.white45} style={{ marginTop: 4 }} upper={false}>pick your side to join the pot</PixelText>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  {OUTCOMES.map((o) => (
                    <PixelButton key={o} label={busy ? "…" : o.toUpperCase()} size={10} color={C.eth} style={{ flex: 1, paddingVertical: 8 }} onPress={() => joinDuel(o)} />
                  ))}
                </View>
              </>
            )}
            <Pressable onPress={() => onGame(String(duel.fixtureId))} style={{ marginTop: 10 }}>
              <PixelText size={9} color={C.ethLight} upper={false}>open the match to watch + settle ›</PixelText>
            </Pressable>
          </Panel>
        ) : (
          <Panel style={{ padding: 12, marginTop: 12 }}>
            <PixelText size={11} color={C.gold}>OPEN A DUEL</PixelText>
            <FixturePicker games={games} value={fixture} onPick={setFixture} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
              <Panel style={{ flex: 1, paddingHorizontal: 10 }}>
                <TextInput value={stake} onChangeText={setStake} keyboardType="numeric" placeholder="stake" placeholderTextColor={C.white35} style={[s.input, { paddingVertical: 8 }]} />
              </Panel>
              <PixelText size={10} color={C.white45}>KUSD</PixelText>
            </View>
            {fixture && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                {OUTCOMES.map((o) => {
                  const label = o === "home" ? fixture.home.abbrev : o === "away" ? fixture.away.abbrev : "DRAW"
                  return (
                    <Pressable key={o} onPress={() => setPick(o)} style={[s.pickBtn, pick === o && s.pickOn]}>
                      <PixelText size={10} color={pick === o ? C.white : C.white60} upper={false}>{label}</PixelText>
                    </Pressable>
                  )
                })}
              </View>
            )}
            <PixelButton label={busy ? "…" : "OPEN DUEL & INVITE ROOM"} onPress={startDuel} size={11} style={{ marginTop: 10 }} />
          </Panel>
        )}
        {note && <PixelText size={9} color={C.amber} style={{ marginTop: 8 }} upper={false}>{note}</PixelText>}
      </ScrollView>

      {/* chat dock */}
      <View style={s.chatDock}>
        <ScrollView style={{ maxHeight: 150 }} contentContainerStyle={{ padding: 10 }}>
          {chat.length === 0 && <PixelText size={9} color={C.white35} upper={false}>say hi to the room…</PixelText>}
          {chat.map((m, i) => (
            <PixelText key={i} size={10} upper={false} color={m.system ? C.white45 : m.mine ? C.ethLight : C.white} style={{ marginBottom: 3 }}>
              {m.system ? `— ${m.text} —` : `${m.from}: ${m.text}`}
            </PixelText>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, padding: 8 }}>
          <Panel style={{ flex: 1, paddingHorizontal: 10 }}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="message the room" placeholderTextColor={C.white35} style={[s.input, { paddingVertical: 8 }]} onSubmitEditing={sendChat} />
          </Panel>
          <PixelButton label="SEND" size={10} onPress={sendChat} style={{ paddingHorizontal: 14 }} />
        </View>
      </View>
    </View>
  )
}

// ── Online duel by code ─────────────────────────────────────────────────────
function OnlineDuel({ onBack, onGame }: { onBack: () => void; onGame: (id: string) => void }) {
  const { getSigner, address, connection } = useWallet()
  const [tab, setTab] = useState<"create" | "join">("create")
  const [games, setGames] = useState<Game[]>([])
  const [fixture, setFixture] = useState<Game | null>(null)
  const [stake, setStake] = useState("10")
  const [pick, setPick] = useState<PoolOutcome>("home")
  const [code, setCode] = useState("")
  const [joinPickState, setJoinPick] = useState<PoolOutcome>("home")
  const [created, setCreated] = useState<{ poolId: string; fixtureId: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetchGames()
      .then((all) =>
        setGames(
          filterGames(all, "upcoming")
            .concat(filterGames(all, "live"))
            .filter((g) => duelJoinable(g.kickoffMs))
            .slice(0, 12),
        ),
      )
      .catch(() => {})
  }, [])

  const doCreate = async () => {
    if (!address || !fixture || busy) return
    const stakeN = Number(stake)
    if (!stakeN) return setNote("enter a stake")
    setBusy(true)
    setNote(null)
    try {
      const deadline = duelDeadlineMs(fixture.kickoffMs)
      const { poolId } = await createPool(await getSigner(), fixture.fixtureId, stakeN, deadline, fixture.kickoffMs, pick)
      setCreated({ poolId: String(poolId), fixtureId: fixture.fixtureId })
    } catch (e: any) {
      setNote(String(e?.message ?? e).slice(0, 120))
    } finally {
      setBusy(false)
    }
  }

  const doJoin = async () => {
    if (!address || busy) return
    const id = code.trim().replace(/[^0-9]/g, "")
    if (!id) return setNote("enter a duel code")
    setBusy(true)
    setNote(null)
    try {
      const p = await getPool(connection, BigInt(id)) // validates it exists
      if (p.deadlineMs <= Date.now()) throw new Error("DEADLINE_PASSED")
      await joinPool(await getSigner(), p.id, joinPickState)
      setNote(`joined duel #${id} · picked ${joinPickState.toUpperCase()}`)
      onGame(String(p.fixtureId))
    } catch (e: any) {
      // The two ways a join legitimately bounces are a closed window and a
      // second entry from the same wallet.
      const raw = String(e?.message ?? e)
      setNote(
        raw === "DEADLINE_PASSED"
          ? `duel #${id}'s join window has closed`
          : /AlreadyJoined|already/i.test(raw)
            ? "you're already in this pot — one entry per wallet"
            : raw.slice(0, 120),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }}>
      <Pressable onPress={onBack}><PixelText size={11} color={C.white60}>‹ DUELS</PixelText></Pressable>
      <PixelText size={18} style={{ marginTop: 10 }}>Online duel</PixelText>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pressable onPress={() => setTab("create")} style={[s.filter, tab === "create" && s.filterOn]}><PixelText size={10} color={tab === "create" ? C.white : C.white45}>create</PixelText></Pressable>
        <Pressable onPress={() => setTab("join")} style={[s.filter, tab === "join" && s.filterOn]}><PixelText size={10} color={tab === "join" ? C.white : C.white45}>join by code</PixelText></Pressable>
      </View>

      {tab === "create" ? (
        created ? (
          <Panel style={{ padding: 16, marginTop: 14, borderColor: C.gold, alignItems: "center" }}>
            <PixelText size={9} color={C.white45} tracking={2}>DUEL CODE</PixelText>
            <PixelText size={40} style={{ marginTop: 6 }}>#{created.poolId}</PixelText>
            <PixelText size={9} color={C.white60} style={{ marginTop: 6, textAlign: "center" }} upper={false}>
              share this code — friends join the same pot from anywhere
            </PixelText>
            <PixelButton label="SHARE CODE" size={11} style={{ marginTop: 12 }} onPress={() => Share.share({ message: `Join my Kickpact duel — enter code #${created.poolId} in the app.` })} />
            <Pressable onPress={() => onGame(String(created.fixtureId))} style={{ marginTop: 10 }}>
              <PixelText size={9} color={C.ethLight} upper={false}>open the match ›</PixelText>
            </Pressable>
          </Panel>
        ) : (
          <Panel style={{ padding: 12, marginTop: 14 }}>
            <PixelText size={11} color={C.gold}>PICK A MATCH</PixelText>
            <FixturePicker games={games} value={fixture} onPick={setFixture} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
              <Panel style={{ flex: 1, paddingHorizontal: 10 }}>
                <TextInput value={stake} onChangeText={setStake} keyboardType="numeric" placeholder="stake" placeholderTextColor={C.white35} style={[s.input, { paddingVertical: 8 }]} />
              </Panel>
              <PixelText size={10} color={C.white45}>KUSD</PixelText>
            </View>
            {fixture && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                {OUTCOMES.map((o) => {
                  const label = o === "home" ? fixture.home.abbrev : o === "away" ? fixture.away.abbrev : "DRAW"
                  return (
                    <Pressable key={o} onPress={() => setPick(o)} style={[s.pickBtn, pick === o && s.pickOn]}>
                      <PixelText size={10} color={pick === o ? C.white : C.white60} upper={false}>{label}</PixelText>
                    </Pressable>
                  )
                })}
              </View>
            )}
            <PixelButton label={busy ? "…" : "CREATE DUEL"} onPress={doCreate} size={11} style={{ marginTop: 10 }} />
          </Panel>
        )
      ) : (
        <Panel style={{ padding: 12, marginTop: 14 }}>
          <PixelText size={11} color={C.gold}>ENTER A DUEL CODE</PixelText>
          <Panel style={{ paddingHorizontal: 10, marginTop: 10 }}>
            <TextInput value={code} onChangeText={setCode} keyboardType="numeric" placeholder="# duel code" placeholderTextColor={C.white35} style={[s.input, { paddingVertical: 10 }]} />
          </Panel>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            {OUTCOMES.map((o) => (
              <Pressable key={o} onPress={() => setJoinPick(o)} style={[s.pickBtn, joinPickState === o && s.pickOn]}>
                <PixelText size={10} color={joinPickState === o ? C.white : C.white60} upper={false}>{o.toUpperCase()}</PixelText>
              </Pressable>
            ))}
          </View>
          <PixelButton label={busy ? "…" : "JOIN THE POT"} onPress={doJoin} size={11} style={{ marginTop: 10 }} />
        </Panel>
      )}
      {note && <PixelText size={9} color={C.amber} style={{ marginTop: 10 }} upper={false}>{note}</PixelText>}
    </ScrollView>
  )
}

// ─────────────────────────────────────────────────────────────── styles ──
const s = StyleSheet.create({
  signWrap: { flexGrow: 1, justifyContent: "center", padding: 22 },
  input: { color: C.white, fontSize: 14, paddingVertical: 10, minHeight: 40 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  avatar: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: C.eth,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#000",
  },
  teamRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
  filters: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 12 },
  filter: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.panel },
  filterOn: { backgroundColor: C.eth },
  oddsCell: {
    flex: 1, alignItems: "center", padding: 8, borderRadius: 10,
    borderWidth: 1, borderColor: C.white15, backgroundColor: C.panel,
  },
  pctTrack: { width: "100%", height: 4, borderRadius: 2, backgroundColor: C.white15, marginTop: 5 },
  pctFill: { height: 4, borderRadius: 2, backgroundColor: C.eth },
  pickBtn: {
    flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.white15,
  },
  pickOn: { backgroundColor: C.eth, borderColor: C.eth },
  fxChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8,
    backgroundColor: C.panel, borderWidth: 1, borderColor: C.white15,
  },
  fxChipOn: { borderColor: C.eth, backgroundColor: "rgba(98,126,234,0.15)" },
  peerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  peerPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.panel, borderWidth: 1, borderColor: C.white15 },
  chatDock: { borderTopWidth: 1, borderTopColor: C.white15, backgroundColor: C.frameDark },
})
