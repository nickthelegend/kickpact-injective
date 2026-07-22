# TxLINE API — builder feedback

*From the Kickpact team, after integrating the full surface (auth → REST → SSE → proofs → on-chain CPI) over the hackathon.*

## What we loved

1. **`validate_stat_v2` is a genuinely great primitive.** Building the predicate on-chain from a claimed outcome and letting the oracle confirm/refute it made our settlement engine trustless *by construction* — the "lying keeper gets refuted" test passed on the first run against the cloned program. The `.view()` pattern also gave us a killer UX feature for free: receipts that re-verify from a phone/browser.
2. **`llms.txt` + the `tx-on-chain` repo.** Docs index made for agents, runnable devnet scripts, published IDL, per-network IDLs — we went from zero to an activated API token and a validated real-match proof in one working session. `declare_program!` consumed the IDL unmodified.
3. **Demargined `Pct` on StablePrice odds.** Shipping implied probabilities next to prices (`Pct: ["36.887", …]`) meant our odds board needed zero math to be honest.
4. **Free tier that is actually free.** `subscribe(level 1)` at 0 TxL/week on devnet, pay only rent/fees — perfect hackathon on-ramp, and the on-chain activation is a nice taste of the real flow.
5. **The 2026 sim timeline.** Having played knockout fixtures with full score histories *and* proofs (England 1–2 Argentina!) available before the final made end-to-end testing possible days before submission.

## Friction we hit (with repro details)

1. **Mixed response framing on sibling endpoints.** `GET /api/scores/snapshot/{id}` returns a JSON array, but `GET /api/scores/updates/{id}` and `/historical/{id}` return **SSE-framed text** (`data:`/`event:`/`id:` lines) to a plain GET. Our client "Failed to parse JSON" until we sniffed the body. Suggestion: honor `Accept: application/json` on the replay endpoints, or document the framing prominently.
2. **The IDL `address` points at mainnet.** `idl/txoracle.json` in the repo root carries the mainnet program id; on devnet, `pricing_matrix` fetches fail with "Account does not exist" until you notice `examples/devnet/idl/txoracle.json` exists. Suggestion: a loud callout in the quickstart (or ship one IDL with per-cluster addresses in `metadata`).
3. **zstd responses break Bun's fetch.** The API compresses aggressively; Bun 1.3's fetch advertises zstd but fails decoding (`ZstdDecompressionError`) on `POST /api/token/activate`. Workaround: `Accept-Encoding: deflate` (your examples do this — now we know why). A note in the troubleshooting page would save people an hour.
4. **Lost activation response = lost token.** Our first `token/activate` succeeded server-side but the response was eaten by the zstd issue; retrying with the same `txSig` correctly returned *"This transaction has already been used to activate a subscription"* — but there's no `GET` to recover the already-minted token, so we had to subscribe again. Suggestion: make activation idempotent for the same (txSig, wallet) or add a token-recovery endpoint authenticated by wallet signature.
5. **Default fixtures snapshot is future-only.** `fixtures/snapshot?competitionId=72` (no `startEpochDay`) returns only upcoming fixtures — fine once you know it, surprising when you're hunting for a finished match to validate. A `from`/`to` doc note (or including the last N days by default) would help.
6. **Odds snapshot vs. windows.** For fixtures without a live snapshot yet, discovering odds means scanning 5-minute windows (`/odds/updates/{epochDay}/{hour}/{interval}`) — workable, but a `?latest=1` or "most recent odds for fixture" convenience endpoint would remove a loop from every client.
7. **Small one:** score records for a finished match can end at phase 4 (in-play) without a phase-5 record in the same window (our semifinal capture ends at the 93'). If the last record of a fixture always flipped to `Ended`, downstream finality logic would be simpler.

## What we'd use next

- Multi-stat strategies for prop pools ("total corners > 9") — the types are ready in the IDL and the UX writes itself.
- `stat-validation-v3` multiproofs to settle several pools of the same fixture in one transaction.
- A WebSocket/geyser feed of `insert_scores_root` events would let keepers react to *on-chain* anchoring rather than the off-chain stream.
