---
format: 1920x1080
message: "Kickpact — self-custodial, peer-to-peer football predictions. Your keys, your predictions, your crowd."
arc: Hook → Problem → Solution → How-it-works → Feature (Pacts) → Feature (Arena) → Feature (Match Rooms, P2P) → CTA
audience: World Cup fans + web3 / hackathon judges (WDK + Pears tracks)
music: minimal electronic, premium fintech, confident, low-hype, driving but restrained
palette: bg #10162e / panel #1b2548 / ACCENT #627eea (only) / win-green #3ba34b (F5+F6 only) / gold #e8b84b (Match Room panel only) / KickpactPixel display + body
captions: karaoke — active word = dark #10162e on a #627eea block; inactive muted #7f92c9; large + high-contrast
---

## Video direction

- **Ground (every frame):** dark navy `#10162e` full-bleed background clip (on a `class="clip"` layer, never `#root`) + the faint white graph-paper grid + top/bottom hairlines. This is Kickpact's canvas — persistent.
- **One accent, rationed:** `#627eea` is the ONLY accent — keywords, active state, highlights, the P2P line, links. **Withhold it in Frame 2** (the problem is cold/greyed) so it floods back on the Frame 3 brand reveal. Green `#3ba34b` appears ONLY on the Frame 5 payout + Frame 6 "YOU WON". Gold `#e8b84b` appears ONLY on the Frame 7 Match Room panel (echoing the app).
- **Type:** KickpactPixel everywhere (the app font). Hierarchy by SIZE not weight — one hero element 3–6× its neighbours per frame. Tracking on micro-labels.
- **Motion doctrine:** authoritative and calm — ease-out settles, no bounce, no gratuitous spin. Elements ENTER, SETTLE, and hold; reveals are **paced across the full frame duration to the voiceover** (never front-load then freeze). Numbers count/flip. The grid is alive but quiet (faint parallax/scanline).
- **Real UI:** recreate Kickpact components per the recipes in `frame.md` — Panels, PixelButtons, balance card, match card, chat bubbles, solo card, escrow vault. This IS the app, not stand-ins.
- **Captions:** karaoke band low-third, active word dark-on-accent block. Keep the lower ~180px clear of key content.
- **SFX (transitions only, ~20%):** soft UI click/whoosh on frame entrances; a heavier "lock clunk" on the escrow close (F5); a single bright "win chime" on the green ✓ (F5) and "YOU WON" (F6). Nothing under the VO otherwise. **BGM** minimal-electronic bed at ~5% throughout.

## Frame 1 — Hook

- scene: Dark grid; an accent centre-line glows down; "90:00" counts in; "a billion opinions"
- duration: 3.413s
- transition_in: cut
- status: outline
- sfx: click-soft
- voiceover: "Ninety minutes. One result. And a billion opinions."
- src: compositions/frames/01-hook.html

Cold open on the match, not the product. **Shot sequence:**
- 0.0–1.6s — Ground + grid fade up from black. A single **accent `#627eea` vertical centre-line** draws top→bottom down the middle with a soft outer glow (the pitch centre-line). Micro top-left: "● WORLD CUP · LIVE" (accent dot).
- 1.2–3.0s — Left of centre, a huge **"90:00"** (display-hero KickpactPixel, ink white) counts up its seconds; a hairline underlines it.
- 2.8–5.0s — Right of centre, stacked lines rise: "ONE RESULT." (ink) then "A BILLION" + "OPINIONS." — on "billion", a faint field of tiny ink dots scatters across the grid; the word "OPINIONS" holds. Keep accent ONLY on the centre-line here.
- Motion: grid `fade-up`; centre-line `draw` (clip-reveal, ease-out); numeral `count`; text `stagger` rise + fade. No exit — hard cut out.

## Frame 2 — The problem

- scene: Two cold panels — money→app, chat→server — a padlock snaps shut; "NONE OF IT IS YOURS"
- duration: 7.808s
- transition_in: crossfade
- status: outline
- sfx: impact-bass-1
- voiceover: "But when you back your call, an app holds your cash. When you talk it out, your chat lives on their server. None of it is yours."
- src: compositions/frames/02-problem.html

Name the pain — money custody + chat custody. **Everything here is desaturated/greyed — NO accent** (the accent is what we're missing). **Shot sequence:**
- 0.0–2.6s — A Panel slides in from the LEFT: micro "YOUR MONEY" + a small app/bank glyph + arrow "→" + a greyed "THEIR APP" box. Cold ink-soft tone.
- 2.4–5.0s — A second Panel slides in from the RIGHT: micro "YOUR CHAT" + a chat-bubble glyph + "→" + a greyed "THEIR SERVER" box (a server-rack glyph).
- 5.0–8.0s — A grey **padlock** scales in over the seam between both panels and snaps shut (tiny shake); centred stamp **"NONE OF IT IS YOURS"** with "YOURS" getting a strike-through draw. Hold cold.
- Motion: panels `slide-in` + settle (ease-out); lock `scale-in` + micro-shake; strike-through `draw`. All greyscale/ink-soft — deliberately flat.

## Frame 3 — Kickpact (the turn)

- scene: Grid re-aligns; KICKPACT wordmark assembles from grid cells (accent floods in); WDK · Pears badges dock
- duration: 5.461s
- transition_in: wipe
- status: outline
- sfx: glitch-1
- voiceover: "Kickpact fixes both. Self-custodial predictions. Serverless watch parties."
- src: compositions/frames/03-logo.html

The turn — accent returns, full brand. **Shot sequence:**
- 0.0–2.2s — The grid cells brighten and re-align toward centre; **"KICKPACT"** wordmark assembles from pixel-glitch cells (KickpactPixel display-hero, ink white with an **accent underglow**). A single accent hairline sweeps under it.
- 2.0–4.2s — Two lines fade up under the wordmark, each with a small **accent tick**: "SELF-CUSTODIAL PREDICTIONS" and "SERVERLESS WATCH PARTIES".
- 4.0–6.0s — Two pill badges slide up from the bottom hairline: **"WDK"** and **"PEARS"** (paper-2 fill, accent 1px border, KickpactPixel micro). Hold.
- Motion: cells `assemble` (stagger from grid positions); underline `draw`; lines `stagger` fade-up; badges `slide-up`.

## Frame 4 — Your wallet, every match

- scene: A phone device rises; real Kickpact Home — balance card + World Cup fixtures; a match card highlights
- duration: 4.779s
- transition_in: crossfade
- status: outline
- sfx: click-soft
- voiceover: "Your own wallet. Every World Cup match, live. Pick one — and back your team."
- src: compositions/frames/04-home.html

Prove it's a real, working self-custodial app. **Shot sequence:**
- 0.0–2.2s — A rounded dark **phone frame** rises + settles centre-right. Inside, the real **Home**: TESTNET/MAINNET pill row (TESTNET = accent active), then the **balance card** ("TOTAL BALANCE / $200.00 / 200.00 USD₮ · Sepolia testnet" + a chain badge), then the 5-icon **action row** (mint/swap/bridge/withdraw/offramp) — elements stagger in.
- 2.0–4.0s — Left of the phone, kinetic labels connect to the UI with hairline leaders: "YOUR OWN WALLET" → balance card; "EVERY MATCH, LIVE" → the fixtures.
- 4.0–6.0s — Two **match cards** (World Cup: "ARGENTINA vs EGYPT", "FRANCE vs MOROCCO" with flag squares + kickoff pills + "TAP TO PREDICT →" in accent) slide up inside the phone; the top card gets an **accent border pulse** as a tap ripple lands on it ("pick one").
- Motion: device `rise`; UI rows `stagger`; leader lines `draw`; match card `slide-up`; highlight `pulse`.

## Frame 5 — Pacts (on-chain escrow)

- scene: Two USD₮ stakes slide into an escrow vault; the real result flips a green ✓; payout to the winner
- duration: 10.155s
- transition_in: cut
- status: outline
- sfx: impact-bass-1
- voiceover: "You and a friend each lock USD-tether into on-chain escrow. No middleman. When the whistle blows, the real result pays the winner — automatically."
- src: compositions/frames/05-pacts.html

The hero feature + the WDK story. **Shot sequence:**
- 0.0–3.0s — Centre: the **escrow vault** (paper-2 rounded rect, accent 1px outline, padlock). A **USD₮ coin** labelled "YOU · 2 USD₮" slides in from the LEFT and drops into the vault; a second "FRIEND · 2 USD₮" slides in from the RIGHT.
- 3.0–5.0s — The vault padlock **snaps shut** (LOCK CLUNK); a pot readout **"POT · 4 USD₮"** forms; label "ON-CHAIN ESCROW" micro. Between the two sides, a faint "MIDDLEMAN" silhouette **dissolves / crosses out** on "no middleman".
- 5.0–8.0s — Top: a small **result card** arrives — "FULL TIME · ARGENTINA 2 – 0 EGYPT" — and flips a **green `#3ba34b` ✓** ("the real result"). WIN CHIME.
- 8.0–11.0s — The pot's 4 USD₮ **flies as an arc** to the winner's side; stamp **"WINNER TAKES THE POT"** + a small tag "AUTO-SETTLED FROM THE RESULT". The winning side glows accent, brief green flash on the payout.
- Motion: coins `slide-in`+`drop`; lock `snap`+shake; middleman `dissolve`; result `flip`; ✓ `pop`; payout `arc`; stamps `stagger`. Green used ONLY on ✓ + payout.

## Frame 6 — The Arena (duel)

- scene: A BTC solo card; live price ticks; an ↑UP swipe; "YOU WON"
- duration: 5.397s
- transition_in: wipe
- status: outline
- sfx: click-soft
- voiceover: "Or read the market in the arena — swipe up, swipe down, settled on live prices."
- src: compositions/frames/06-arena.html

Second feature, fast + playful. **Shot sequence:**
- 0.0–2.4s — The **Solo crypto card** (Panel): "BTC" big KickpactPixel, "Bitcoin" muted, "STRIKE $64,032", then a **live price "$64,032 → $64,180"** that ticks up (number flip) turning green with "(+0.23%)"; buttons "↓ DOWN" (#b3434f) and "↑ UP" (#3ba34b) below.
- 2.4–4.2s — A cursor/hand presses **↑ UP**; the whole card **tilts + lifts up** with a short accent motion trail (the swipe).
- 4.2–6.0s — A **"YOU WON"** stamp lands (green), and micro underneath: "FREE SOLO vs BOT · STAKED vs A FRIEND · SETTLED ON LIVE PRICES".
- Motion: price `count`/flip; card `swipe-tilt` up; stamp `pop`.

## Frame 7 — Match Rooms (Pears, P2P)

- scene: "THE CROWD"; a match room; P2P chat bubbles pop in; peers tick up; every message wallet-signed; NO SERVER
- duration: 8.491s
- transition_in: crossfade
- status: outline
- sfx: click-soft
- voiceover: "And the best part of the match? The crowd. Every game opens a peer-to-peer room — no server, every message signed by your wallet."
- src: compositions/frames/07-rooms.html

The Pears half + the two-track payoff. **Shot sequence:**
- 0.0–2.0s — Big pivot line **"THE CROWD."** (KickpactPixel, ink) punches centre, then slides up to make room.
- 2.0–5.5s — The **Match Room panel** (the ONLY gold-bordered element) fills with **chat bubbles that pop in from alternating sides** (P2P): "VAMOS ARGENTINA! 🔥" · "GOAL!! did you see that" · "watching from the couch 🛋". A **"● peers"** pill ticks **1 → 2 → 3** (green). Each incoming bubble stamps a small **"✓"** (accent) — "wallet-signed".
- 5.5–9.0s — Below, two nodes — a **phone** and a **laptop** — connect with a live **accent P2P line** drawing between them; a small **server icon between them is crossed out**; labels "NO SERVER" + "HYPERSWARM · PEER-TO-PEER". Hold.
- Motion: pivot `punch`+`slide-up`; bubbles `pop` stagger (alternating); peers `count`; ✓ `stamp`; P2P line `draw`; server `cross-out`. Gold ONLY on the room panel border.

## Frame 8 — CTA

- scene: Grid collapses to centre; KICKPACT + tagline "your keys · your predictions · your crowd"; WDK · Pears
- duration: 5s
- transition_in: cut
- status: outline
- sfx: chime
- voiceover: "Kickpact. Back your team. Own the bet."
- src: compositions/frames/08-cta.html

Close on the brand. **Shot sequence:**
- 0.0–1.6s — The grid **collapses inward** to centre; the **"KICKPACT"** wordmark settles (KickpactPixel display-hero, accent underglow).
- 1.6–3.4s — Tagline **"BACK YOUR TEAM. OWN THE BET."** staggers up under it (ink, accent on "OWN").
- 3.4–5.0s — Micro line **"your keys · your predictions · your crowd"** fades in, flanked by resting **"WDK" · "PEARS"** badges. Hold to black.
- Motion: grid `collapse`; wordmark `settle`; tagline `stagger`; micro `fade`. Calm, unhurried, done.
