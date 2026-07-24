#!/usr/bin/env bash
# Narrate (macOS `say`, sped to 1.3x) + stitch the recorded web clips into the
# Injective demo film. Each clip is held on its last frame to match its
# narration length — nothing on screen is sped up or looped.
#
#   demo/assemble-injective.sh
#
# In:  demo/capture/<id>.webm   (from record-web.mjs)
#      demo/narration-injective.json
# Out: docs/media/kickpact-injective-demo.mp4
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$ROOT/demo"
CAP="$DEMO/capture"
AUD="$DEMO/audio"
CLIPS="$DEMO/clips"
OUT="$ROOT/docs/media/kickpact-injective-demo.mp4"
JSON="$DEMO/narration-injective.json"
mkdir -p "$AUD" "$CLIPS" "$(dirname "$OUT")"

TEMPO=$(node -e "console.log(require('$JSON').tempo||1.2)")
VOICE=$(node -e "console.log(require('$JSON').voice||'am_michael')")
# Narration is Kokoro (local AI TTS) via `hyperframes tts`. TEMPO is Kokoro's
# --speed (so 1.2 = 1.2x); no post atempo needed.

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
maxf() { node -e "console.log(Math.max($1,$2))"; }
subf() { node -e "console.log(Math.max(0,($1)-($2)))"; }

IDS=$(node -e "require('$JSON').segments.forEach(s=>console.log(s.id))")

: > "$CLIPS/list.txt"
for ID in $IDS; do
  V="$CAP/$ID.webm"
  [ -f "$V" ] || { echo "!! missing clip $V — skipping"; continue; }
  TEXT=$(node -e "console.log(require('$JSON').segments.find(s=>s.id==='$ID').text)")

  # 1) narration → Kokoro (am_michael) at TEMPO speed → normalize to 48k stereo
  npx --yes hyperframes tts "$TEXT" --voice "$VOICE" --speed "$TEMPO" --output "$AUD/$ID.kokoro.wav" >/dev/null 2>&1
  ffmpeg -nostdin -y -i "$AUD/$ID.kokoro.wav" -ar 48000 -ac 2 "$AUD/$ID.wav" >/dev/null 2>&1

  # 2) durations → clip length (hold video's last frame to narration length)
  VD=$(dur "$V"); AD=$(dur "$AUD/$ID.wav")
  CLIP=$(maxf "$VD" "$AD"); PAD=$(subf "$AD" "$VD")
  echo "  $ID  video=${VD}s narration=${AD}s → clip=${CLIP}s"

  # 3) mux held video + narration into a normalized clip
  ffmpeg -nostdin -y -i "$V" -i "$AUD/$ID.wav" -filter_complex \
    "[0:v]scale=440:860:force_original_aspect_ratio=decrease,pad=440:860:(ow-iw)/2:(oh-ih)/2:color=0x0a0f1e,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=$PAD[v];[1:a]apad[a]" \
    -map "[v]" -map "[a]" -t "$CLIP" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -ar 48000 -ac 2 "$CLIPS/$ID.mp4" >/dev/null 2>&1
  echo "file '$CLIPS/$ID.mp4'" >> "$CLIPS/list.txt"
done

# 4) concat
ffmpeg -nostdin -y -f concat -safe 0 -i "$CLIPS/list.txt" -c copy "$OUT" >/dev/null 2>&1 || \
  ffmpeg -nostdin -y -f concat -safe 0 -i "$CLIPS/list.txt" -c:v libx264 -pix_fmt yuv420p -c:a aac "$OUT" >/dev/null 2>&1

echo ""
echo "✔ $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 "$OUT" 2>/dev/null | head -4
