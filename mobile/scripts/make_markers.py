# mobile/scripts/make_markers.py
"""Map marker art -> mobile/assets/markers/*.png + src/map/marker-images.generated.ts.

Re-run whenever art changes.

One sheet with the five stages side by side on a transparent background (the usual way):
  python mobile/scripts/make_markers.py --sheet SHEET.png [--preview]
Separate files (older art):
  python mobile/scripts/make_markers.py --paw PAW --box BOX --hut HUT [--tower T] [--palace P]
Missing tower/palace -> amber placeholder.
"""
import argparse
import base64
import collections
import io
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

AMBER = (0xE6, 0xA5, 0x52)  # color.primary
AMBER_DEEP = (0xC9, 0x8A, 0x3C)  # color.primaryDeep
SIZE = 256  # shown up to ~140dp (celebration); 256px stays crisp on 2x and acceptable on 3x
WORK = 512  # cut backgrounds at this size: faster, and soft glows become smoother
MOBILE = Path(__file__).resolve().parents[1]


def shrink(img):
    img = img.copy()
    img.thumbnail((WORK, WORK), Image.LANCZOS)
    return img


def recolor_silhouette(path):
    """Dark shape -> amber shape. Alpha = source alpha x darkness, so both "black on white" and
    "black on transparent" sources work."""
    src = shrink(Image.open(path).convert("RGBA"))
    alpha = ImageChops.multiply(src.getchannel("A"), ImageOps.invert(src.convert("L")))
    img = Image.new("RGBA", src.size, AMBER + (0,))
    img.putalpha(alpha)
    return img


def cut_background(path, tol):
    """Flood-fill from the border while neighbouring pixels change smoothly: swallows flat
    backgrounds and soft glows, stops at the object's hard edge."""
    img = shrink(Image.open(path).convert("RGBA"))
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    q = collections.deque()
    for x in range(w):
        q.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        q.extend([(0, y), (w - 1, y)])
    for x, y in q:
        seen[y * w + x] = 1
    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                r2, g2, b2, _ = px[nx, ny]
                if abs(r - r2) + abs(g - g2) + abs(b - b2) <= tol:
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))
    for y in range(h):
        for x in range(w):
            if seen[y * w + x]:
                px[x, y] = (0, 0, 0, 0)
    return img


def harden_alpha(path, threshold=128):
    """Art whose background was already removed but left a faint coloured fringe: drop everything
    under half opacity, make the rest opaque, then an opening pass removes stray specks."""
    img = shrink(Image.open(path).convert("RGBA"))
    mask = img.getchannel("A").point(lambda v: 255 if v >= threshold else 0)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    img.putalpha(mask)
    return img


def split_sheet(path, gap=12):
    """Five stages left to right on a transparent sheet -> five RGBA crops.
    Columns with (almost) no opaque pixels separate the stages; watercolor leaves faint specks
    between them, so a column counts as empty below a small opaque-pixel count."""
    src = Image.open(path).convert("RGBA")
    # generated art keeps a yellowish semi-transparent fringe: keep only solid pixels, then shave 1px
    mask = src.getchannel("A").point(lambda v: 255 if v >= 200 else 0)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    src.putalpha(mask)
    w, h = src.size
    cols = [sum(1 for v in mask.crop((x, 0, x + 1, h)).getdata() if v) for x in range(w)]
    runs, start, empty = [], None, 0
    for x, n in enumerate(cols):
        if n > 2:
            if start is None:
                start = x
            empty = 0
        elif start is not None:
            empty += 1
            if empty >= gap:
                runs.append((start, x - empty + 1))
                start = None
    if start is not None:
        runs.append((start, w))
    runs = [r for r in runs if r[1] - r[0] > 20]  # drop stray specks
    if len(runs) != 5:
        raise SystemExit(f"expected 5 stages on the sheet, found {len(runs)}: {runs}")
    return [src.crop((a, 0, b, h)) for a, b in runs]


def cut(path, tol):
    """Pick the background remover: sources with a transparent corner already have alpha."""
    src = Image.open(path)
    if src.mode in ("RGBA", "LA") and src.convert("RGBA").getpixel((0, 0))[3] == 0:
        return harden_alpha(path)
    return cut_background(path, tol)


def square(img):
    img = img.crop(img.getchannel("A").getbbox())
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def placeholder(rings):
    # ponytail: temporary art until the user's tower/palace images arrive — pass --tower/--palace.
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((8, 8, SIZE - 8, SIZE - 8), fill=AMBER_DEEP + (255,))
    for i in range(rings):
        m = 28 + i * 16
        d.ellipse((m, m, SIZE - m, SIZE - m), outline=(255, 255, 255, 255), width=6)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", help="one image with paw, box, hut, tower, palace left to right")
    ap.add_argument("--preview", action="store_true", help="also write scripts/markers-preview.png")
    ap.add_argument("--paw")
    ap.add_argument("--box")
    ap.add_argument("--hut")
    ap.add_argument("--tower")
    ap.add_argument("--palace")
    ap.add_argument("--tol", type=int, default=18)
    a = ap.parse_args()

    if a.sheet:
        images = dict(zip(["paw", "box", "hut", "tower", "palace"], (square(i) for i in split_sheet(a.sheet))))
    elif not (a.paw and a.box and a.hut):
        ap.error("give --sheet, or --paw --box --hut")
    else:
      images = {
        "paw": square(recolor_silhouette(a.paw)),
        "box": square(cut_background(a.box, a.tol)),
        "hut": square(cut_background(a.hut, a.tol)),
        "tower": square(cut(a.tower, a.tol)) if a.tower else placeholder(1),
        "palace": square(cut(a.palace, a.tol)) if a.palace else placeholder(2),
      }

    out_dir = MOBILE / "assets" / "markers"
    out_dir.mkdir(parents=True, exist_ok=True)
    lines = [
        "// GENERATED by mobile/scripts/make_markers.py — do not edit by hand.",
        "import type { Grade } from './grades';",
        "",
        "export const MARKER_IMAGES: Record<Grade, string> = {",
    ]
    for grade, img in images.items():
        img.save(out_dir / f"{grade}.png", optimize=True)
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        lines.append(f"  {grade}: 'data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}',")
    lines.append("};")
    (MOBILE / "src" / "map" / "marker-images.generated.ts").write_text("\n".join(lines) + "\n", encoding="utf-8")
    if a.preview:
        # on meadow green and on fog grey: the two grounds a marker actually sits on
        sheet = Image.new("RGBA", (SIZE * 5, SIZE * 2), (0x8F, 0xC6, 0x58, 255))
        sheet.paste((0xCA, 0xD7, 0xD1, 255), (0, SIZE, SIZE * 5, SIZE * 2))
        for i, img in enumerate(images.values()):
            sheet.alpha_composite(img, (i * SIZE, 0))
            sheet.alpha_composite(img, (i * SIZE, SIZE))
        sheet.convert("RGB").save(MOBILE / "scripts" / "markers-preview.png")
    print("wrote", ", ".join(images))


if __name__ == "__main__":
    main()
