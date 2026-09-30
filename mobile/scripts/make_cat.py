# mobile/scripts/make_cat.py
"""Cat art -> src/map/cat-image.generated.ts (3 cats x 5 poses) + optional preview.

  python mobile/scripts/make_cat.py              # from mobile/assets/cats/{cat}/sit.png, sheet.png
  python mobile/scripts/make_cat.py --preview    # also cats-preview.png + cats-preview/{cat}-{pose}.png (look before shipping)
  python mobile/scripts/make_cat.py --self-test  # split/clean checks on synthetic images

sit.png = the cat sitting alone (bigger, cleaner). sheet.png = five poses laid out
top: sit, walk, lie / bottom: happy, look. Missing files are skipped — the app falls back to sit.
"""
import base64
import collections
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

MOBILE = Path(__file__).resolve().parents[1]
ROOT = MOBILE / "assets" / "cats"
CATS = ["cheese", "white", "mackerel"]
POSES = ["sit", "walk", "lie", "happy", "look"]
OUT = 160
WORK = 1200  # longest side while cleaning
# Alpha cut-off per cat sheet: the white sheet has a wide soft glow around every pose.
SHEET_ALPHA = {"cheese": 40, "white": 150, "mackerel": 40}
SIT_ALPHA = 40
FLAT_TOL = 18


def load(path, work=WORK):
    img = Image.open(path).convert("RGBA")
    scale = work / max(img.size)
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    return img


def has_alpha(path):
    """Already cut out? A corner can be almost-but-not-quite transparent (alpha 1-3), so look at how
    much of the picture is near-transparent instead of one pixel."""
    src = Image.open(path)
    if src.mode not in ("RGBA", "LA"):
        return False
    h = src.convert("RGBA").getchannel("A").histogram()
    return sum(h[:16]) >= 0.05 * sum(h)


def flood_background(img, tol=FLAT_TOL):
    """Opaque flat background (e.g. cream paper): clear everything reachable from the border
    through small colour steps. Stops at the drawn outline."""
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


def clean_alpha(img, threshold):
    """Drop faint pixels (fringe, glow, specks), then an opening pass removes small islands.
    Kept pixels keep their own alpha so soft fur edges stay soft."""
    a = img.getchannel("A")
    keep = a.point(lambda v: 255 if v >= threshold else 0)
    keep = keep.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    img.putalpha(Image.composite(a, Image.new("L", a.size, 0), keep))
    return img


def prepare(path, threshold):
    img = load(path)
    if not has_alpha(path):
        img = flood_background(img)
    return clean_alpha(img, threshold)


def coverage(mask, box):
    return mask.crop(box).histogram()[255]


def quietest(mask, horizontal, lo, hi, span):
    """Index in [lo, hi) of the row (horizontal) or column with the fewest drawn pixels —
    the gap between two poses. Ties go to the one nearest the middle of the window."""
    mid = (lo + hi) / 2
    best, best_score = lo, None
    for i in range(lo, hi):
        box = (0, i, span, i + 1) if horizontal else (i, 0, i + 1, span)
        score = (coverage(mask, box), abs(i - mid))
        if best_score is None or score < best_score:
            best, best_score = i, score
    return best


def split_sheet(img):
    """Five poses by layout: find the gap row, then gaps between the top three and bottom two."""
    w, h = img.size
    mask = img.getchannel("A").point(lambda v: 255 if v else 0)
    y = quietest(mask, True, int(h * 0.35), int(h * 0.65), w)
    top = mask.crop((0, 0, w, y))
    bottom = mask.crop((0, y, w, h))
    x1 = quietest(top, False, int(w * 0.2), int(w * 0.45), y)
    x2 = quietest(top, False, int(w * 0.55), int(w * 0.8), y)
    x3 = quietest(bottom, False, int(w * 0.35), int(w * 0.65), h - y)
    return {
        "sit": img.crop((0, 0, x1, y)),
        "walk": img.crop((x1, 0, x2, y)),
        "lie": img.crop((x2, 0, w, y)),
        "happy": img.crop((0, y, x3, h)),
        "look": img.crop((x3, y, w, h)),
    }


def drop_strays(part, margin=0.2, step=4):
    """A cell can catch a bit of the neighbouring pose (e.g. its "!" marks). Keep the biggest shape
    (the cat) and anything whose centre is near it (sparkles, petals); drop pieces far away.
    Works on a 1/step size mask so plain Python stays fast."""
    w, h = part.size
    alpha = part.getchannel("A")
    small = alpha.reduce(step).point(lambda v: 1 if v else 0)
    sw, sh = small.size
    px = small.load()
    label = [[0] * sw for _ in range(sh)]
    comps = []  # (count, minx, miny, maxx, maxy, cells)
    for y0 in range(sh):
        for x0 in range(sw):
            if not px[x0, y0] or label[y0][x0]:
                continue
            idx = len(comps) + 1
            label[y0][x0] = idx
            q = collections.deque([(x0, y0)])
            cells = []
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < sw and 0 <= ny < sh and px[nx, ny] and not label[ny][nx]:
                            label[ny][nx] = idx
                            q.append((nx, ny))
            xs = [c[0] for c in cells]
            ys = [c[1] for c in cells]
            comps.append((len(cells), min(xs), min(ys), max(xs), max(ys), cells))
    if len(comps) < 2:
        return part
    main = max(comps, key=lambda c: c[0])
    mx, my = (main[3] - main[1]) * margin, (main[4] - main[2]) * margin
    box = (main[1] - mx, main[2] - my, main[3] + mx, main[4] + my)
    drop = Image.new("L", small.size, 0)
    dp = drop.load()
    for comp in comps:
        cx, cy = (comp[1] + comp[3]) / 2, (comp[2] + comp[4]) / 2
        far = not (box[0] <= cx <= box[2] and box[1] <= cy <= box[3])
        # a piece touching the cell edge was cut there — it belongs to the neighbouring pose
        cut = comp[1] == 0 or comp[2] == 0 or comp[3] == sw - 1 or comp[4] == sh - 1
        if comp is not main and (far or cut):
            for x, y in comp[5]:
                dp[x, y] = 255
    drop = drop.resize((sw * step, sh * step), Image.NEAREST).crop((0, 0, w, h)).filter(ImageFilter.MaxFilter(9))
    part = part.copy()
    part.putalpha(Image.composite(Image.new("L", (w, h), 0), alpha, drop))
    return part


def fit(img, size=OUT):
    box = img.getchannel("A").getbbox()
    if box is None:
        return None
    img = img.crop(box)
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, side - img.height))  # stand on the bottom edge
    return canvas.resize((size, size), Image.LANCZOS)


def build():
    art = {}
    for cat in CATS:
        poses = {}
        sheet = ROOT / cat / "sheet.png"
        if sheet.exists():
            for pose, part in split_sheet(prepare(sheet, SHEET_ALPHA[cat])).items():
                fitted = fit(drop_strays(part))
                if fitted is not None:
                    poses[pose] = fitted
        sit = ROOT / cat / "sit.png"
        if sit.exists():
            poses["sit"] = fit(prepare(sit, SIT_ALPHA))  # the standalone sitting art wins
        if "sit" not in poses:
            sys.exit(f"{cat}: no sitting art — put mobile/assets/cats/{cat}/sit.png")
        art[cat] = poses
    return art


def data_uri(img):
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def write_ts(art):
    lines = [
        "// GENERATED by mobile/scripts/make_cat.py — do not edit by hand.",
        "import type { CatColor, CatPose } from './catColors';",
        "",
        "export const CAT_IMAGES: Record<CatColor, Partial<Record<CatPose, string>>> = {",
    ]
    for cat, poses in art.items():
        lines.append(f"  {cat}: {{")
        for pose in POSES:
            if pose in poses:
                lines.append(f"    {pose}: '{data_uri(poses[pose])}',")
        lines.append("  },")
    lines.append("};")
    (MOBILE / "src" / "map" / "cat-image.generated.ts").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_preview(art):
    """3 rows (cats) x 5 columns (poses) on the map's warm background — how they'll look."""
    pad = 12
    sheet = Image.new("RGBA", (len(POSES) * (OUT + pad) + pad, len(CATS) * (OUT + pad) + pad), (237, 230, 216, 255))
    for r, cat in enumerate(CATS):
        for c, pose in enumerate(POSES):
            img = art[cat].get(pose)
            if img is not None:
                sheet.alpha_composite(img, (pad + c * (OUT + pad), pad + r * (OUT + pad)))
    sheet.save(Path(__file__).parent / "cats-preview.png")
    # One file per pose too, to look at each at full size (not shipped — the app uses the .ts).
    one = Path(__file__).parent / "cats-preview"
    one.mkdir(exist_ok=True)
    for cat in CATS:
        for pose, img in art[cat].items():
            img.save(one / f"{cat}-{pose}.png")


def self_test():
    # A fake sheet: five solid blobs in the expected layout, faint specks around, a soft glow.
    w, h = 900, 600
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    blobs = {"sit": (60, 60, 220, 250), "walk": (360, 60, 540, 250), "lie": (640, 120, 860, 250),
             "happy": (80, 360, 330, 560), "look": (560, 360, 760, 560)}
    for box in blobs.values():
        d.rectangle(box, fill=(240, 180, 120, 255))
    d.rectangle((300, 300, 302, 302), fill=(255, 0, 0, 30))  # faint speck
    d.rectangle((450, 290, 452, 292), fill=(255, 255, 0, 255))  # tiny opaque speck
    img = clean_alpha(img, 40)
    assert img.getpixel((301, 301))[3] == 0, "faint speck survived"
    assert img.getpixel((451, 291))[3] == 0, "tiny speck survived the opening"
    parts = split_sheet(img)
    for pose, part in parts.items():
        box = part.getchannel("A").getbbox()
        assert box is not None, f"{pose} is empty"
        bw, bh = box[2] - box[0], box[3] - box[1]
        ew, eh = blobs[pose][2] - blobs[pose][0] + 1, blobs[pose][3] - blobs[pose][1] + 1
        assert abs(bw - ew) <= 6 and abs(bh - eh) <= 6, f"{pose} got {bw}x{bh}, want ~{ew}x{eh}"
    # Opaque background gets flooded away but the shape stays.
    flat = Image.new("RGBA", (200, 200), (250, 248, 244, 255))
    ImageDraw.Draw(flat).ellipse((50, 50, 150, 150), fill=(120, 110, 100, 255), outline=(40, 40, 40, 255), width=3)
    flat = flood_background(flat)
    assert flat.getpixel((5, 5))[3] == 0 and flat.getpixel((100, 100))[3] == 255, "flat background not removed"
    assert fit(Image.new("RGBA", (10, 10), (0, 0, 0, 0))) is None, "empty part should be skipped"
    # A stray bit from the neighbouring pose (far from this cat) goes; decorations next to it stay.
    cell = Image.new("RGBA", (400, 300), (0, 0, 0, 0))
    dc = ImageDraw.Draw(cell)
    dc.rectangle((150, 150, 350, 280), fill=(240, 180, 120, 255))  # the cat
    dc.rectangle((360, 140, 372, 152), fill=(250, 200, 80, 255))  # sparkle right next to it
    dc.rectangle((10, 10, 22, 40), fill=(250, 200, 80, 255))  # neighbour's "!" in the far corner
    dc.rectangle((160, 290, 176, 299), fill=(200, 200, 220, 255))  # neighbour's tip cut off at the cell edge
    cell = drop_strays(cell)
    assert cell.getpixel((16, 25))[3] == 0, "far stray bit survived"
    assert cell.getpixel((168, 296))[3] == 0, "edge-cut bit of the neighbour survived"
    assert cell.getpixel((366, 146))[3] == 255, "nearby sparkle was removed"
    assert cell.getpixel((250, 200))[3] == 255, "the cat was damaged"
    # A cut-out whose corner is alpha 2 (not 0) is still a cut-out — don't flood it (the white cat's
    # fur blends into its glow and would be flooded away).
    import tempfile
    nearly = Image.new("RGBA", (100, 100), (250, 250, 250, 2))
    ImageDraw.Draw(nearly).ellipse((30, 30, 70, 70), fill=(252, 244, 232, 252))
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "nearly.png"
        nearly.save(p)
        assert has_alpha(p), "near-transparent corner should count as already cut out"
        opaque = Path(tmp) / "opaque.png"
        Image.new("RGB", (100, 100), (250, 248, 244)).save(opaque)
        assert not has_alpha(opaque), "opaque paper is not cut out"
    print("self-test ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        art = build()
        write_ts(art)
        if "--preview" in sys.argv:
            write_preview(art)
        print("wrote cat-image.generated.ts:", ", ".join(f"{c}({'/'.join(art[c])})" for c in art))
