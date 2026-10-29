#!/usr/bin/env python3
"""Turn raw emulator screenshots (1080x2400) into the captures/<name>-ui.png
files build.py frames: drop the Android status bar and gesture pill.

The scan screen gets one more step: the emulator's camera feed is a virtual
3D room, so the feed is replaced with a real table photo
(backgrounds/scan-table.png) and a rendered receipt, then the app's own
overlay (close, shutter, gallery and document buttons) is lifted back on top
from the raw capture. The frame corners and hint text are redrawn with the
app's colour and font.

  python3 prepare-captures.py captures/raw
"""
import os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
F_MONO = os.path.join(REPO, 'app/assets/fonts/JetBrainsMono-Regular.ttf')
F_MONO_BOLD = os.path.join(REPO, 'app/assets/fonts/JetBrainsMono-Medium.ttf')

# Below the status bar, just under the tab-bar labels: 1080x2228, which fills the
# bezel's screen exactly under build.py's drawn iOS status bar (STATUS_H).
TOP, BOTTOM = 88, 2316
CREAM = (240, 229, 204)         # colors.paper — the scanner overlay colour
INK = (45, 31, 26)

# Scanner overlay geometry in the raw 1080x2400 capture.
FRAME = (173, 675, 908, 1628)   # outer corners of the four brackets
BRACKET_ARM, BRACKET_W = 72, 8
HINT_Y = 1700                   # vertical centre of the hint line
BUTTONS = [((111, 162), 68), ((540, 2166), 97), ((747, 2166), 67), ((903, 2166), 67)]

RECEIPT = [
    ('center', 'TRATTORIA LUCA', 'big'),
    ('center', 'Via Roma 12 · Table 4', None),
    ('center', '28/10/2026        20:41', None),
    ('rule',),
    ('row', '1 Margherita', '14.50'),
    ('row', '1 Carbonara', '16.50'),
    ('row', '1 House red 1/2 L', '17.00'),
    ('row', '1 Tiramisu', '7.50'),
    ('row', '1 Sparkling water', '4.00'),
    ('rule',),
    ('row', 'SUBTOTAL', '59.50'),
    ('row', 'TAX 8.15%', '4.85'),
    ('total', 'TOTAL USD', '64.35'),
    ('rule',),
    ('row', 'VISA **** 4821', '64.35'),
    ('center', 'GRAZIE!', None),
]

def receipt(width=560, scale=2):
    """A thermal till receipt as RGBA, torn top and bottom edges."""
    W = width * scale
    pad = 34 * scale
    f = ImageFont.truetype(F_MONO, 27 * scale)
    fb = ImageFont.truetype(F_MONO_BOLD, 34 * scale)
    lh = round(27 * scale * 1.55)
    big = lambda r: r[0] == 'total' or r[-1] == 'big'
    height = lambda r: lh // 2 + 8 * scale if r[0] == 'rule' else round(lh * (1.4 if big(r) else 1))
    H = pad * 2 + sum(height(r) for r in RECEIPT)
    paper = Image.new('RGBA', (W, H), (250, 248, 241, 255))
    d = ImageDraw.Draw(paper)
    ink = (52, 46, 44, 255)
    y = pad
    for r in RECEIPT:
        if r[0] == 'rule':
            for x in range(pad, W - pad, 14 * scale):
                d.line((x, y + lh // 4, x + 7 * scale, y + lh // 4), fill=ink, width=2 * scale)
        else:
            font = fb if big(r) else f
            if r[0] == 'center':
                d.text(((W - d.textlength(r[1], font=font)) / 2, y), r[1], font=font, fill=ink)
            else:
                d.text((pad, y), r[1], font=font, fill=ink)
                d.text((W - pad - d.textlength(r[2], font=font), y), r[2], font=font, fill=ink)
        y += height(r)
    # thermal-paper unevenness plus a soft light falloff away from the window (upper left)
    rnd = random.Random(7)
    shade = Image.new('L', (W, H), 0)
    sd = ImageDraw.Draw(shade)
    for _ in range(40):
        yy = rnd.randrange(H)
        sd.line((0, yy, W, yy + rnd.randrange(-20, 20)), fill=rnd.randrange(4, 10), width=rnd.randrange(2, 8) * scale)
    falloff = Image.linear_gradient('L').resize((W, H)).point(lambda v: v // 16)
    shade = Image.composite(falloff, shade.filter(ImageFilter.GaussianBlur(6 * scale)), falloff)
    paper = Image.composite(Image.new('RGBA', (W, H), (60, 45, 30, 255)), paper, shade)
    # torn edges
    mask = Image.new('L', (W, H), 255)
    md = ImageDraw.Draw(mask)
    tooth = 16 * scale
    for edge_y, sign in ((0, 1), (H, -1)):
        pts = [(0, edge_y)]
        for i, x in enumerate(range(0, W + tooth, tooth)):
            pts.append((x, edge_y + sign * (tooth // 2 if i % 2 else 0)))
        pts.append((W, edge_y))
        md.polygon(pts, fill=0)
    paper.putalpha(mask)
    return paper.resize((width, round(H / scale)), Image.LANCZOS)

def cover(im, size):
    sc = max(size[0] / im.width, size[1] / im.height)
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
    x, y = (im.width - size[0]) // 2, (im.height - size[1]) // 2
    return im.crop((x, y, x + size[0], y + size[1]))

def scan_composite(raw):
    feed = cover(Image.open(os.path.join(HERE, 'backgrounds', 'scan-table.png')).convert('RGB'), raw.size)
    # a camera feed sits darker than a stock photo; it also lets the cream overlay read
    feed = feed.point(lambda v: round(v * 0.8)).convert('RGBA')
    rc = receipt(width=640).rotate(-2.5, resample=Image.BICUBIC, expand=True)
    cx, cy = (FRAME[0] + FRAME[2]) // 2, (FRAME[1] + FRAME[3]) // 2
    x, y = cx - rc.width // 2, cy - rc.height // 2
    shadow = Image.new('RGBA', feed.size, (0, 0, 0, 0))
    shadow.paste((30, 18, 8, 255), (x + 14, y + 22), rc.getchannel('A').point(lambda v: v * 110 // 255))
    feed.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(16)))
    feed.alpha_composite(rc, (x, y))
    # the app's round controls, lifted from the real capture
    for (bx, by), r in BUTTONS:
        m = Image.new('L', raw.size, 0)
        ImageDraw.Draw(m).ellipse((bx - r, by - r, bx + r, by + r), fill=255)
        feed.paste(raw, (0, 0), m.filter(ImageFilter.GaussianBlur(1)))
    d = ImageDraw.Draw(feed)
    l, t, rgt, b = FRAME
    a, w = BRACKET_ARM, BRACKET_W
    rect = lambda x0, y0, x1, y1: d.rectangle((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), fill=CREAM)
    for (px, py, dx, dy) in ((l, t, 1, 1), (rgt, t, -1, 1), (l, b, 1, -1), (rgt, b, -1, -1)):
        rect(px, py, px + dx * a, py + dy * w)
        rect(px, py, px + dx * w, py + dy * a)
    hint = 'Frame the receipt and tap to capture'
    hf = ImageFont.truetype(F_MONO, 36)
    tw = d.textlength(hint, font=hf)
    bb = d.textbbox((0, 0), hint, font=hf)
    d.text(((raw.width - tw) / 2, HINT_Y - (bb[1] + bb[3]) / 2), hint, font=hf, fill=CREAM)
    return feed.convert('RGB')

def main(raw_dir):
    out = os.path.join(HERE, 'captures')
    for name in sorted(os.listdir(raw_dir)):
        stem, ext = os.path.splitext(name)
        if ext != '.png':
            continue
        raw = Image.open(os.path.join(raw_dir, name)).convert('RGB')
        if stem == 'scan':
            raw = scan_composite(raw)
        path = os.path.join(out, f'{stem}-ui.png')
        raw.crop((0, TOP, raw.width, BOTTOM)).save(path)
        print(os.path.relpath(path, HERE))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'captures', 'raw'))
