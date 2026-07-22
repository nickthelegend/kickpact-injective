# demo/ — the two-phone test harness and the film it produces

A real Bluetooth handshake needs two real radios. Emulators have none, so the
Bluetooth duel — the feature this product is built around — can only be proved
on two physical Android devices. This directory is that proof, plus the tooling
to reproduce it.

```
two-phone.sh     drive BOTH phones by on-screen text, record both screens
narration.json   the script — one entry per segment, with its capture + offset
narrate.py       narration.json → one WAV per segment (Kokoro TTS)
assemble.sh      captures + WAVs → kickpact-demo.mp4
capture/         the screen recordings (and the landing-page pan)
```

## Reproducing

```bash
adb devices                                   # two serials expected
export KICKPACT_PHONE_A=<serial> KICKPACT_PHONE_B=<serial>

demo/two-phone.sh run                         # drives both phones, records to capture/
demo/narrate.py                               # renders demo/audio/*.wav
demo/assemble.sh                              # → demo/kickpact-demo.mp4
```

Source the script instead of running it to drive the phones by hand:
`source demo/two-phone.sh`, then `nav "$A" 1`, `tap "$B" "MINT"`, `screen "$A"`.

## What the harness had to work around

Driving a React Native app over `uiautomator` is not as simple as matching text:

- **Zero-area bounds.** RN emits `bounds="[0,0][0,0]"` for some pressables —
  including the whole bottom nav. Tapping the centre of those bounds hits (0,0),
  which is the status bar, and silently sends the app to the background. Every
  tapper skips zero-area nodes.
- **The bottom nav therefore can't be tapped by text at all.** `nav()` finds it
  visually instead: the strip is the lowest run of rows whose *median* colour is
  `C.frame` (`#1b2548`). The median ignores the icons, and starting from the
  bottom means it works whether the phone has a 3-button bar or a gesture pill.
- **Repeated labels.** Every pool row carries its own `SPA / DRAW / ARG / JOIN`,
  and the pick button labelled `HOME` collides with the `HOME` nav tab. `tapl`
  (last match) and `tapin` (first match *below* an anchor) address them.
- **The soft keyboard covers the submit button.** Type, then dismiss with
  `KEYCODE_BACK` — `KEYCODE_ESCAPE` doesn't close the IME reliably.
- **`screenrecord` caps at ~180s**, so recording is per phase.

## What the film shows, and what it doesn't

`narration.json` is written to describe only what was observed on the two phones
with the on-chain effect independently verified against devnet. Concretely, this
run verified:

| claim | evidence |
|---|---|
| kUSD mint is a real transaction | both wallets held 100 kUSD of mint `G5Nahk2k…XEY2`; SOL dropped |
| a pool escrows both stakes | pool #8 — 2 members, picks `[H=1,A=1]`, vault 20 kUSD |
| the second phone sees the first phone's pool | B joined a pool A created, from its own wallet |
| Bluetooth discovery is real | each phone listed the other's address prefix, then `● LIVE · 2 HERE` |
| Bluetooth carries chat | a message typed on B appeared on A |
| a Bluetooth duel escrows on-chain | pool #11 — 2 members, opposite picks, vault 20 kUSD |
| settlement traces to a proof | receipt for England 1–2 Argentina, statKeys 1+2, roots PDA |
| anyone can re-check the oracle | `VERIFY ON-CHAIN NOW` → `ORACLE CONFIRMS ✓`, live from the phone |

Two things are deliberately **not** claimed:

- **Privy login does not complete on this build.** The modal is real and its
  providers are the ones actually enabled on the app, but the backend rejects
  the request: `{"error":"Missing native app ID from mobile client","code":
  "invalid_native_app_id"}`. `io.kickpact.app` and the `kickpact` scheme have to
  be added to the Privy dashboard allowlist. Until then the app falls back to
  MWA or the keychain burner, which is what the phones in the film are using —
  and the narration says so.
- **No pool is settled on camera.** The settled receipt shown is a genuine
  earlier settlement of a real fixture; the film re-verifies it live rather than
  restaging it.

## Gotchas in the video pipeline itself

- `ffmpeg` reads stdin, and inside a `while read` loop it eats the bytes feeding
  that loop — it silently swallowed the first character of every other segment
  id. All invocations pass `-nostdin`.
- `-ss` does not reliably rebase input timestamps. A later `trim=duration=` then
  keeps an empty window and the segment renders as a blank frame. Every branch
  runs `setpts=PTS-STARTPTS` before trimming.
- Video is held on its last frame to match narration length — never sped up or
  looped, so nothing on screen is misrepresented.
