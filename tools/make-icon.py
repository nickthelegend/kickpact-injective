#!/usr/bin/env python3
"""Generate the Kickpact mark and every icon asset that derives from it.

    python3 tools/make-icon.py

The mark is authored on a 16x16 pixel grid on purpose: the whole product is
pixel-art, and a mark drawn as vector curves would look foreign next to the UI
font — and turn to mush at 16px, which is where a favicon actually lives.
Everything (landing favicon, Android launcher, splash) is rendered from this
one definition so the brand can never drift between surfaces again.
"""
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
N = 16
C = (N - 1) / 2
WHITE, NAVY, FRAME = "#ffffff", "#10162e", "#1b2548"

# centre pentagon + three panels held one pixel clear of the rim, so the ball's
# silhouette stays a clean circle instead of going notchy
CENTRE = [(7,6),(8,6),(6,7),(7,7),(8,7),(9,7),(6,8),(7,8),(8,8),(9,8),(7,9),(8,9)]
EDGES  = [(7,3),(8,3),(7,4),(8,4),
          (4,10),(5,10),(4,11),(5,11),
          (10,10),(11,10),(10,11),(11,11)]


def grid():
    g = [[None] * N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            d = ((x - C) ** 2 + (y - C) ** 2) ** 0.5
            if d <= 7.6:
                g[y][x] = "w"
            if 6.7 < d <= 7.6:
                g[y][x] = "k"
    for x, y in CENTRE + EDGES:
        if g[y][x]:
            g[y][x] = "k"
    return g


COL = {"w": WHITE, "k": NAVY}


def svg(cell=32, bg=None, pad=0):
    g = grid()
    size = N * cell + pad * 2
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
         f'width="{size}" height="{size}" shape-rendering="crispEdges">']
    if bg:
        o.append(f'<rect width="{size}" height="{size}" rx="{size*0.22:.0f}" fill="{bg}"/>')
    for y in range(N):
        for x in range(N):
            if g[y][x]:
                o.append(f'<rect x="{pad+x*cell}" y="{pad+y*cell}" width="{cell}" '
                         f'height="{cell}" fill="{COL[g[y][x]]}"/>')
    o.append("</svg>")
    return "\n".join(o)


def png(svg_text, out: Path, size: int):
    """Rasterise via PIL by drawing the grid directly — no SVG toolchain needed."""
    from PIL import Image, ImageDraw
    g = grid()
    scale = 64
    im = Image.new("RGBA", (N * scale, N * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(N):
        for x in range(N):
            if g[y][x]:
                d.rectangle([x*scale, y*scale, (x+1)*scale-1, (y+1)*scale-1], fill=COL[g[y][x]])
    im = im.resize((size, size), Image.NEAREST)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    return im


def padded(size: int, bg: str | None, inset: float, out: Path):
    """Launcher/adaptive icons need the mark inside a safe area, not edge-to-edge."""
    from PIL import Image
    inner = int(size * inset)
    mark = png(svg(), Path("/tmp/_kp_tmp.png"), inner)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0) if bg is None else bg)
    canvas.paste(mark, ((size - inner) // 2, (size - inner) // 2), mark)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)


def main():
    L = ROOT / "apps/landing"
    M = ROOT / "apps/mobile/assets"

    (L / "src/app/icon.svg").write_text(svg(32))
    (L / "public/kickpact-mark.svg").write_text(svg(32))
    png(svg(), L / "public/kickpact-mark.png", 512)
    padded(180, FRAME, 0.72, L / "src/app/apple-icon.png")

    # Android: full-bleed icon, plus adaptive fore/background layers
    padded(1024, FRAME, 0.70, M / "icon.png")
    padded(512, None, 0.62, M / "android-icon-foreground.png")   # transparent
    padded(512, FRAME, 0.62, M / "android-icon-monochrome.png")
    padded(1024, FRAME, 0.55, M / "splash-icon.png")
    padded(48, FRAME, 0.80, M / "favicon.png")

    from PIL import Image
    Image.open(L / "public/kickpact-mark.png").resize((64, 64), Image.NEAREST)
    print("wrote landing icon.svg / apple-icon.png / kickpact-mark.{svg,png}")
    print("wrote mobile icon.png, android-icon-{foreground,monochrome}.png, splash-icon.png, favicon.png")


if __name__ == "__main__":
    main()
