#!/usr/bin/env python3
"""Cut the football out of a pixel-art source image and rebuild every icon.

    python3 tools/crop-ball.py assets-src/ball.png

The source is artwork of a ball sitting on a pitch against a background. We want
the ball alone, on transparency, square, with its pixel edges intact — so this
keys out the scene rather than resampling it:

  1. sample the four corners to learn the background colours (sky + pitch)
  2. flood from the border inwards, so a dark panel *inside* the ball is kept
     even though it matches a dark background colour
  3. crop to the surviving blob's bounding box, pad to a square
  4. every resize is NEAREST — a smooth resample would turn pixel art to mush

Pass --check to write a preview strip instead of touching the repo.
"""
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(path):
    from PIL import Image
    return Image.open(path).convert("RGBA")


def key_out(im, tol=38):
    """Transparent background via border flood-fill; returns a new RGBA image."""
    w, h = im.size
    px = im.load()

    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]

    def bg_like(c):
        return any(sum(abs(a - b) for a, b in zip(c[:3], k[:3])) <= tol for k in corners)

    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg_like(px[x, y]):
                q.append((x, y)); seen[y][x] = True
    for y in range(h):
        for x in (0, w - 1):
            if bg_like(px[x, y]) and not seen[y][x]:
                q.append((x, y)); seen[y][x] = True

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and bg_like(px[nx, ny]):
                seen[ny][nx] = True
                q.append((nx, ny))

    from PIL import Image
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not seen[y][x]:
                op[x, y] = px[x, y]
    return out


def square_crop(im, margin=2):
    bbox = im.getbbox()
    if not bbox:
        sys.exit("nothing survived the key — try a different --tol")
    l, t, r, b = bbox
    im = im.crop((l, t, r, b))
    w, h = im.size
    side = max(w, h) + margin * 2
    from PIL import Image
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return sq


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    if not src.exists():
        sys.exit(f"no such file: {src}")
    check = "--check" in sys.argv
    tol = 38
    for a in sys.argv:
        if a.startswith("--tol="):
            tol = int(a.split("=")[1])

    from PIL import Image
    ball = square_crop(key_out(load(src), tol))
    print(f"cut to {ball.size[0]}x{ball.size[1]} (transparent)")

    if check:
        strip = Image.new("RGB", (240 * 4, 240), (13, 18, 38))
        for i, px in enumerate((512, 192, 48, 16)):
            s = ball.resize((px, px), Image.NEAREST)
            s = s.resize((200, 200), Image.NEAREST)
            strip.paste(s, (i * 240 + 20, 20), s)
        strip.save("/tmp/ball-check.png")
        print("preview -> /tmp/ball-check.png (512 / 192 / 48 / 16 px)")
        return

    L, M = ROOT / "apps/landing", ROOT / "apps/mobile/assets"
    FRAME = "#1b2548"

    def emit(size, bg, inset, out: Path):
        inner = int(size * inset)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0) if bg is None else bg)
        s = ball.resize((inner, inner), Image.NEAREST)
        canvas.paste(s, ((size - inner) // 2, (size - inner) // 2), s)
        out.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(out)

    emit(512, None, 1.0, L / "public/kickpact-mark.png")
    emit(180, FRAME, 0.74, L / "src/app/apple-icon.png")
    emit(180, FRAME, 0.74, L / "public/apple-icon.png")
    emit(1024, FRAME, 0.72, M / "icon.png")
    emit(512, None, 0.64, M / "android-icon-foreground.png")
    emit(512, FRAME, 0.64, M / "android-icon-monochrome.png")
    emit(1024, FRAME, 0.56, M / "splash-icon.png")
    emit(48, FRAME, 0.84, M / "favicon.png")
    Image.new("RGBA", (512, 512), FRAME).save(M / "android-icon-background.png")

    # the landing references an .svg; embed the cut PNG so one file serves both
    import base64, io
    buf = io.BytesIO(); ball.resize((256, 256), Image.NEAREST).save(buf, "PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'
           f'<image href="data:image/png;base64,{b64}" width="256" height="256" '
           'style="image-rendering:pixelated"/></svg>')
    (L / "public/kickpact-mark.svg").write_text(svg)
    (L / "src/app/icon.svg").write_text(svg)

    print("rebuilt landing + mobile icons from the cut ball")


if __name__ == "__main__":
    main()
