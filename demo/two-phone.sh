#!/bin/bash
# Two-phone test harness — drives BOTH real Android devices by on-screen text
# and records each screen. A real Bluetooth handshake needs two physical
# radios, so this cannot be done on emulators.
#
#   source demo/two-phone.sh          # then call the helpers by hand, or:
#   demo/two-phone.sh run             # the scripted end-to-end pass
#
# Set A and B to your two device serials (`adb devices`).
set -uo pipefail

A="${KICKPACT_PHONE_A:-$(adb devices | awk 'NR==2{print $1}')}"
B="${KICKPACT_PHONE_B:-$(adb devices | awk 'NR==3{print $1}')}"
PKG=io.kickpact.app
OUT="${KICKPACT_DEMO_OUT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/capture}"
mkdir -p "$OUT"

# ── tapping ────────────────────────────────────────────────────────────────
# All three tappers dump the view hierarchy and hit real element bounds. They
# skip nodes reporting bounds="[0,0][0,0]" — React Native emits those for some
# pressables, and tapping (0,0) hits the status bar and backgrounds the app.

_dump() {
  adb -s "$1" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb -s "$1" shell cat /sdcard/ui.xml 2>/dev/null > "/tmp/ui-$1.xml"
}

_els='
import re,html
def els(dev):
    out=[]
    for m in re.finditer(r"text=\"([^\"]*)\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"",
                         open("/tmp/ui-"+dev+".xml").read()):
        t=html.unescape(m.group(1))
        x=(int(m.group(2))+int(m.group(4)))//2; y=(int(m.group(3))+int(m.group(5)))//2
        if x or y: out.append((t,x,y))
    return out
'

# tap <dev> <text> — first match
tap() {
  _dump "$1"
  python3 -c "
import sys,subprocess
$_els
dev,want=sys.argv[1],sys.argv[2].lower()
for t,x,y in els(dev):
    if want in t.lower():
        subprocess.run(['adb','-s',dev,'shell','input','tap',str(x),str(y)])
        print('  ['+dev+'] tap: '+t[:34]); sys.exit(0)
print('  ['+dev+'] MISS: '+sys.argv[2]); sys.exit(1)
" "$1" "$2"
  sleep 2
}

# tapl <dev> <text> — LAST match. Pool rows repeat the same pick/JOIN labels;
# the create-a-pool form is always the last one on the page.
tapl() {
  _dump "$1"
  python3 -c "
import sys,subprocess
$_els
dev,want=sys.argv[1],sys.argv[2].lower()
hits=[e for e in els(dev) if want in e[0].lower()]
if not hits: print('  ['+dev+'] MISS: '+sys.argv[2]); sys.exit(1)
t,x,y=hits[-1]
subprocess.run(['adb','-s',dev,'shell','input','tap',str(x),str(y)])
print('  ['+dev+'] tap[last of '+str(len(hits))+']: '+t[:34])
" "$1" "$2"
  sleep 2
}

# tapin <dev> <anchor> <target> — first <target> BELOW <anchor>. The only way
# to address "the SPA button inside POOL #8", or to avoid hitting the bottom
# nav's HOME tab when you meant a pick button also labelled HOME.
tapin() {
  _dump "$1"
  python3 -c "
import sys,subprocess
$_els
dev,anchor,want=sys.argv[1],sys.argv[2].lower(),sys.argv[3].lower()
e=els(dev)
ay=[y for t,x,y in e if anchor in t.lower()]
if not ay: print('  ['+dev+'] no anchor: '+sys.argv[2]); sys.exit(1)
ay=ay[0]
for t,x,y in sorted(e,key=lambda z:z[2]):
    if y>=ay and want in t.lower():
        subprocess.run(['adb','-s',dev,'shell','input','tap',str(x),str(y)])
        print('  ['+dev+'] tap under '+sys.argv[2]+': '+t[:30]); sys.exit(0)
print('  ['+dev+'] MISS '+sys.argv[3]+' under '+sys.argv[2]); sys.exit(1)
" "$1" "$2" "$3"
  sleep 2
}

# nav <dev> <0..3> — bottom tab (home/duels/receipts/profile).
# The tab pressables dump as zero-area, so find the strip visually instead: it
# is the lowest band of rows whose median colour is C.frame (#1b2548). Works
# regardless of what the phone puts below it (3-button bar vs gesture pill).
nav() {
  adb -s "$1" exec-out screencap -p > "$OUT/.nav-$1.png"
  python3 -c "
import sys,subprocess
from PIL import Image
dev,idx=sys.argv[1],int(sys.argv[2])
im=Image.open(sys.argv[3]).convert('RGB'); w,h=im.size
FRAME=(0x1b,0x25,0x48)
def rowmed(y):
    px=[im.getpixel((x,y)) for x in range(10,w-10,9)]
    return tuple(sorted(p[i] for p in px)[len(px)//2] for i in range(3))
rows=[y for y in range(h-1,h-560,-1) if max(abs(a-b) for a,b in zip(rowmed(y),FRAME))<=12]
if not rows: print('  ['+dev+'] nav strip NOT FOUND'); sys.exit(1)
bot=rows[0]; top=bot
for y in rows:
    if top-y<=1: top=y
    else: break
if bot-top<40: print('  ['+dev+'] nav strip too thin'); sys.exit(1)
cy=(top+bot)//2; cx=int((idx+0.5)*w/4)
subprocess.run(['adb','-s',dev,'shell','input','tap',str(cx),str(cy)])
print('  ['+dev+'] nav['+str(idx)+'] @ '+str(cx)+','+str(cy))
" "$1" "$2" "$OUT/.nav-$1.png"
  sleep 3
}

# type <dev> <field-placeholder> <text> — focus a field and type into it.
# Spaces must be %s for `input text`; close the IME with BACK (not ESC).
type_into() {
  tap "$1" "$2"
  adb -s "$1" shell input text "${3// /%s}"
  sleep 1
  adb -s "$1" shell input keyevent 4
  sleep 1
}

# ── observation ────────────────────────────────────────────────────────────
screen() {
  _dump "$1"
  python3 -c "
import sys,re,html
ts=[html.unescape(m.group(1)) for m in re.finditer(r'text=\"([^\"]+)\"',open('/tmp/ui-$1.xml').read())]
print(' | '.join(t for t in ts if t.strip())[:900])"
}
shot() { adb -s "$1" exec-out screencap -p > "$OUT/$2"; }

# ── lifecycle ──────────────────────────────────────────────────────────────
grant_all() {
  for d in "$A" "$B"; do
    for p in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION BLUETOOTH_ADVERTISE \
             BLUETOOTH_CONNECT BLUETOOTH_SCAN NEARBY_WIFI_DEVICES; do
      adb -s "$d" shell pm grant $PKG android.permission.$p 2>/dev/null
    done
  done
}
launch() { adb -s "$1" shell am force-stop $PKG; sleep 1; adb -s "$1" shell am start -n $PKG/.MainActivity >/dev/null 2>&1; sleep 7; }
install_apk() {
  local apk="${1:-apps/mobile/android/app/build/outputs/apk/release/app-release.apk}"
  for d in "$A" "$B"; do echo -n "$d: "; adb -s "$d" install -r "$apk" 2>&1 | tail -1; done
}

# screenrecord caps at ~180s per clip, so record per phase.
rec_start() { adb -s "$1" shell screenrecord --bit-rate 8000000 --size 720x1600 "/sdcard/$2.mp4" >/dev/null 2>&1 & }
rec_stop()  { adb -s "$1" shell pkill -INT screenrecord 2>/dev/null; sleep 3; adb -s "$1" pull "/sdcard/$2.mp4" "$OUT/$2.mp4" >/dev/null 2>&1; }

# ── the scripted pass ──────────────────────────────────────────────────────
run() {
  echo "A=$A  B=$B  out=$OUT"
  grant_all; launch "$A"; launch "$B"

  echo "── mint on both"
  rec_start "$A" p1-mint-A; rec_start "$B" p1-mint-B; sleep 2
  tap "$A" "MINT"; tap "$B" "MINT"; sleep 20
  rec_stop "$A" p1-mint-A; rec_stop "$B" p1-mint-B

  echo "── A opens a pool, B joins the other side"
  rec_start "$A" p2-pool-A; sleep 2
  tap "$A" "Argentina"; sleep 6
  for i in 1 2; do adb -s "$A" shell input swipe 540 1800 540 700 400; sleep 2; done
  tapl "$A" "ARG"; tapl "$A" "CREATE POOL"; sleep 15
  rec_stop "$A" p2-pool-A
  POOL=$(screen "$A" | grep -o 'POOL #[0-9]*' | tail -1)
  echo "   created $POOL"

  rec_start "$B" p3-join-B; sleep 2
  tap "$B" "Argentina"; sleep 6
  for i in 1 2 3; do adb -s "$B" shell input swipe 540 1800 540 600 400; sleep 2; done
  tapin "$B" "$POOL" "SPA"; tapin "$B" "$POOL" "JOIN"; sleep 15
  rec_stop "$B" p3-join-B

  echo "── Bluetooth room + duel"
  tap "$A" "BACK"; tap "$B" "BACK"; sleep 3
  rec_start "$A" p4-duel-A; rec_start "$B" p4-duel-B; sleep 2
  nav "$A" 1; nav "$B" 1
  tap "$A" "NEARBY"; tap "$B" "NEARBY"; sleep 10
  tap "$A" "CONNECT"; sleep 10
  type_into "$B" "message the room" "argentina taking it"
  tap "$B" "SEND"; sleep 5
  tapl "$A" "SPA v ARG"; sleep 1
  tapl "$A" "ARG"; sleep 1                       # host takes a side explicitly
  tap "$A" "OPEN DUEL & INVITE"; sleep 18
  tapin "$B" "DUEL ·" "HOME"; sleep 18           # friend takes the other side
  rec_stop "$A" p4-duel-A; rec_stop "$B" p4-duel-B

  echo "── receipts + on-chain proof"
  rec_start "$A" p6-receipts-A; rec_start "$B" p6-receipts-B; sleep 2
  tap "$A" "‹ DUELS"; tap "$B" "‹ DUELS"; sleep 3
  nav "$A" 2; nav "$B" 2; sleep 5
  for i in 1 2 3; do adb -s "$A" shell input swipe 540 1800 540 700 350; sleep 1; done
  tap "$A" "England v Argentina"; sleep 8
  tap "$A" "VERIFY ON-CHAIN NOW"; sleep 20
  shot "$A" proof-receipt.png
  rec_stop "$A" p6-receipts-A; rec_stop "$B" p6-receipts-B

  echo "done → $OUT"
}

[ "${1:-}" = "run" ] && run
