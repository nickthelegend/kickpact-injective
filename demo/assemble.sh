#!/bin/bash
# Cut demo/capture/*.mp4 + demo/audio/*.wav into one narrated film.
#
#   demo/narrate.py && demo/assemble.sh [out.mp4]
#
# Each segment in narration.json names a `source`. With "both": true we look for
# <source>-A.mp4 and <source>-B.mp4 and stack the two phones side by side —
# that's the only honest way to show a Bluetooth handshake, since the whole
# claim is that two separate devices react to each other.
#
# Each segment declares an `offset` into its capture, so the film shows the
# moment that matters rather than whatever lead-in the recording began with.
#
# `-ss` does not reliably rebase input timestamps, so every branch runs
# setpts=PTS-STARTPTS before trim= — without it a seeked segment trims an
# empty window and renders as a blank frame.
#
# Video is held on its last frame (never sped up or looped) to match the
# narration length, so nothing on screen is ever misrepresented.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAP="$HERE/capture"
AUD="$HERE/audio"
WORK="$HERE/.work"
OUT="${1:-$HERE/kickpact-demo.mp4}"
W=1920 H=1080 PH=980       # canvas + phone height
BG=0x0d1226

rm -rf "$WORK"; mkdir -p "$WORK"
command -v ffmpeg >/dev/null || { echo "ffmpeg required"; exit 1; }

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

# Captures live in capture/, but hand-shot footage tends to get dropped straight
# into demo/. Accept either.
src_for() { [ -f "$CAP/$1.mp4" ] && echo "$CAP/$1.mp4" || echo "$HERE/$1.mp4"; }

# ffmpeg reads stdin by default and would swallow bytes from the process
# substitution feeding this loop (it ate the first char of every other line).
n=0
: > "$WORK/list.txt"

while IFS=$'\t' read -r id source both full off grade; do
  [ "$grade" = "-" ] && grade="null"
  wav="$AUD/$id.wav"
  [ -f "$wav" ] || { echo "!! no narration for $id — run demo/narrate.py"; continue; }
  d=$(dur "$wav")

  if [ "$both" = "true" ]; then
    a=$(src_for "$source-A"); b=$(src_for "$source-B")
    if [ ! -f "$a" ] || [ ! -f "$b" ]; then echo "!! missing $source-A/-B — skipping $id"; continue; fi
    # two phones, side by side, each held on its last frame to the narration length
    ffmpeg -nostdin -y -loglevel error \
      -ss "$off" -i "$a" -ss "$off" -i "$b" -f lavfi -t "$d" -i "color=c=$BG:s=${W}x${H}:r=30" \
      -filter_complex "\
        [0:v]setpts=PTS-STARTPTS,scale=-2:$PH,tpad=stop_mode=clone:stop_duration=600,trim=duration=$d,setsar=1[L];\
        [1:v]setpts=PTS-STARTPTS,scale=-2:$PH,tpad=stop_mode=clone:stop_duration=600,trim=duration=$d,setsar=1[R];\
        [2:v][L]overlay=x=(W/2-overlay_w)/2+40:y=(H-overlay_h)/2[t];\
        [t][R]overlay=x=W/2+(W/2-overlay_w)/2-40:y=(H-overlay_h)/2[v]" \
      -map "[v]" -r 30 -t "$d" -c:v libx264 -pix_fmt yuv420p -crf 20 "$WORK/$id.mp4"
  elif [ "$full" = "true" ]; then
    # web/desktop capture — fills the canvas rather than being boxed like a phone
    src=$(src_for "$source")
    [ -f "$src" ] || { echo "!! missing $source.mp4 — skipping $id"; continue; }
    ffmpeg -nostdin -y -loglevel error -ss "$off" -i "$src" \
      -vf "setpts=PTS-STARTPTS,scale=$W:$H:force_original_aspect_ratio=decrease,pad=$W:$H:(ow-iw)/2:(oh-ih)/2:color=$BG,$grade,\
tpad=stop_mode=clone:stop_duration=600,trim=duration=$d,setsar=1,format=yuv420p" \
      -r 30 -t "$d" -c:v libx264 -crf 20 "$WORK/$id.mp4"
  else
    src=$(src_for "$source")
    [ -f "$src" ] || { echo "!! missing $source.mp4 — skipping $id"; continue; }
    ffmpeg -nostdin -y -loglevel error \
      -ss "$off" -i "$src" -f lavfi -t "$d" -i "color=c=$BG:s=${W}x${H}:r=30" \
      -filter_complex "\
        [0:v]setpts=PTS-STARTPTS,scale=-2:$PH,tpad=stop_mode=clone:stop_duration=600,trim=duration=$d,setsar=1[P];\
        [1:v][P]overlay=x=(W-overlay_w)/2:y=(H-overlay_h)/2[v]" \
      -map "[v]" -r 30 -t "$d" -c:v libx264 -pix_fmt yuv420p -crf 20 "$WORK/$id.mp4"
  fi

  echo "file '$WORK/$id.mp4'" >> "$WORK/list.txt"
  echo "file '$wav'"          >> "$WORK/audio.txt"
  printf "  %-14s %5.1fs  %s\n" "$id" "$d" "$source"
  n=$((n+1))
done < <(python3 -c "
import json,sys
spec=json.load(open('$HERE/narration.json'))
for s in spec['segments']:
    print(s['id'], s['source'], str(s.get('both', False)).lower(), str(s.get('full', False)).lower(), s.get('offset', 0), s.get('grade') or '-', sep='\t')")

[ "$n" -gt 0 ] || { echo "nothing to assemble"; exit 1; }

echo "→ concatenating $n segments"
ffmpeg -nostdin -y -loglevel error -f concat -safe 0 -i "$WORK/list.txt"  -c copy "$WORK/video.mp4"
ffmpeg -nostdin -y -loglevel error -f concat -safe 0 -i "$WORK/audio.txt" -c:a pcm_s16le "$WORK/voice.wav"
ffmpeg -nostdin -y -loglevel error -i "$WORK/video.mp4" -i "$WORK/voice.wav" \
  -c:v copy -c:a aac -b:a 192k -shortest "$OUT"

echo
echo "$OUT  ($(dur "$OUT" | cut -d. -f1)s, $(du -h "$OUT" | cut -f1))"
