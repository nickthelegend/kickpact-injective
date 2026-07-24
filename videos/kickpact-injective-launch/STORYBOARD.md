---
format: 1920x1080
duration: 60s
message: "Bet on the World Cup with friends — trust the data, not a custodian"
arc: "Hook → Problem → How it works → 3 Features → CTA"
audience: "crypto-curious football fans; hackathon judges"
mode: autonomous
music: none
---

## Frame 1 — Hook

- status: animated
- src: compositions/frames/01-hook.html
- duration: 4.587s
- transition_in: cut
- scene: Kickpact wordmark assembles on a hairline grid; the promise.
- voiceover: "Bet on the World Cup with friends — without trusting anyone to hold the money."
- asset_candidates: logo.png
- blueprint: cold-open-title

Full-bleed navy ground (#10162e) with the permanent periwinkle graph-paper grid + top/bottom hairlines. From black, the grid draws in (0–0.8s). The KickpactPixel wordmark **Kickpact** snaps in center with a one-frame pixel-glitch, a periwinkle underline sweeps L→R. A mono kicker "WORLD CUP · ON-CHAIN" sits above. Keyword **money** lands last, in the accent block. Sparse, ~50% silence.

## Frame 2 — The problem

- status: animated
- src: compositions/frames/02-problem.html
- duration: 4.48s
- transition_in: wipe
- scene: "admin key / custodian / trusted oracle" struck through and dissolved.
- voiceover: "Every prediction app asks you to trust a custodian. Kickpact doesn't."
- asset_candidates:
- blueprint: strike-through-list

Three mono tokens stack in, one per beat: `ADMIN KEY`, `CUSTODIAN`, `TRUSTED ORACLE`. As each is named, a periwinkle rule strikes it through and it desaturates + drops out (pixel-dust). The word **doesn't** hits hard, standalone, accent block, with a decisive hairline snap. Tight negative space.

## Frame 3 — How it works

- status: animated
- src: compositions/frames/03-mechanism.html
- duration: 12.16s
- transition_in: crossfade
- scene: Kinetic diagram — two players → stake → escrow on Injective → oracle signs score → contract picks winner.
- voiceover: "Friends lock the same stake. The pot lives in an escrow on Injective. An oracle signs the final score — and the contract derives the winner on-chain. The data decides."
- asset_candidates:
- blueprint: flow-diagram

A left→right node flow builds in time with the VO: (1) two pixel avatars → (2) equal `10 kUSD` chips slide into (3) a pixel **escrow vault** stamped `INJECTIVE`, (4) an `ORACLE` node emits a signed `2–1` chip that travels to (5) the vault, which flips to a **WINNER** payout. Connectors draw as hairlines; each node ticks in with a mono label. Accent lands on **Injective**, **oracle signs**, **on-chain**. End on "The data decides." held.

## Frame 4 — Feature 1 · self-custodial pools

- status: animated
- src: compositions/frames/04-pools.html
- duration: 5.76s
- transition_in: cut
- scene: Real app UI — open a pool, stake + pick, "CREATE POOL".
- voiceover: "Open a pool in seconds. Your keys, your stake, held by code no one can override."
- asset_candidates: app-bet.png
- blueprint: device-feature-callout

The app screen (`app-bet.png`) rises into a subtle phone frame, right-weighted; a periwinkle callout hairline points to the stake + pick + CREATE POOL. Left column: mono feature tag `01 · SELF-CUSTODIAL POOLS`, and a one-line KickpactPixel headline. Keyword **override**. The screen has a slow parallax drift (never frozen).

## Frame 5 — Feature 2 · Bluetooth & online duels

- status: animated
- src: compositions/frames/05-duels.html
- duration: 6.848s
- transition_in: wipe
- scene: Bluetooth waves + Nearby room UI + duel code.
- voiceover: "Pot up in person over Bluetooth, or online with a duel code. Friends anywhere, one on-chain pot."
- asset_candidates: app-bluetooth.png
- blueprint: device-feature-callout

`app-bluetooth.png` (the Nearby room) sits right; concentric periwinkle Bluetooth arcs pulse out from a pixel node on the left, meeting a second node (two phones discovering each other). A mono chip shows a `# DUEL CODE`. Feature tag `02 · DUELS — BLUETOOTH + ONLINE`. Keyword **Bluetooth**.

## Frame 6 — Feature 3 · verifiable receipts

- status: animated
- src: compositions/frames/06-receipts.html
- duration: 4.331s
- transition_in: cut
- scene: Receipt UI → green "ORACLE SIGNATURE VERIFIED ON-CHAIN ✓".
- voiceover: "Every payout is a receipt you can verify yourself — from your phone."
- asset_candidates: app-receipt.png
- blueprint: device-feature-callout

`app-receipt.png` rises center; a callout zooms the ORACLE ATTESTATION block, and the green **VERIFIED ON-CHAIN ✓** pill scales in with a single success-green (#54c468) accent + a soft tick. Feature tag `03 · VERIFIABLE RECEIPTS`. Keyword **verify**. Gold (#e8b84b) touches the ✓ only.

## Frame 7 — CTA

- status: animated
- src: compositions/frames/07-cta.html
- duration: 3.221s
- transition_in: crossfade
- scene: Logo lockup + "Predict together" + accent CTA.
- voiceover: "Kickpact. Predict together. Trust the data, not us."
- asset_candidates: logo.png
- blueprint: end-card

Return to the grid ground. The **Kickpact** wordmark re-forms center with the pixel-glitch; below it a KickpactPixel line "Predict together." An accent CTA block "GET THE APP · ON INJECTIVE" pulses once. Mono footer `SELF-CUSTODIAL · ORACLE-SIGNED · INJECTIVE EVM`. Keyword **data**. Hold to end on the wordmark.

## Video direction

- **Ground (every frame):** full-bleed navy `#10162e` with the permanent periwinkle graph-paper grid (`colors.grid`, ~2cqw cells) + top/bottom hairlines. The grid is a `class="clip"` background layer, never on `#root`.
- **Ink & accent:** one ink — periwinkle `#627eea` — for type, rules, glitch, QR. Text is periwinkle on navy (large/display weight for contrast). `ink-soft` `#8aa0f5` for secondary lines. Gold `#e8b84b` and success-green `#54c468` are RARE, single-touch highlights (the verified ✓, the CTA pulse) — never a second field.
- **Type:** KickpactPixel for display/hero + mono kickers/labels. Pixel-glitch on the wordmark; mono meta chrome.
- **Motion doctrine:** kinetic but calm — reveals paced to the VO across each frame's full duration (never front-load then freeze). Hairlines *draw*; nodes *tick in*; the keyword lands last in the accent. Subtle parallax drift on device screens. No easing melodrama, no bounce.
- **Captions:** karaoke band low-third; active word = navy `#10162e` text on a periwinkle `#627eea` block; spoken = periwinkle; unspoken = dim. Keep the lower ~170px band clear (16:9).
- **Cuts:** cut / wipe / crossfade per frame `transition_in`; a single low SFX tick per seam (added in post).
