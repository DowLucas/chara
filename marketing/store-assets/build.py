#!/usr/bin/env python3
"""Compose the store screenshot sets from manifest.json.

  Apple (pages-v2/apple, 1320x2868, iPhone 6.9"): one real capture per page in
  Apple's official iPhone 17 Pro Max bezel — never tilted, copy above it, the
  phone centred and large enough to read. Play (pages-v2/play, 1440x2560, 9:16): the
  same capture as a frameless rounded UI card at its native 1080px width. One
  continuous receipt ribbon (ribbon.py) runs behind the whole set, so adjacent
  pages join up in the store's carousel. Run: python3 build.py && python3 qa.py
"""
import json, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import ribbon

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
F_HEAD = os.path.join(REPO, 'app/assets/fonts/SNPro-SemiBold.ttf')
LOGO = os.path.join(REPO, 'app/assets/chara-logo.png')

# name -> (background, text, accent)
PALETTE = {
    'bone':  ((240, 229, 204), (45, 31, 26), (178, 52, 46)),
    'brick': ((172, 48, 42), (247, 240, 222), (240, 205, 140)),
    'ink':   ((45, 31, 26), (240, 229, 204), (240, 205, 140)),
    'moss':  ((78, 96, 46), (247, 240, 222), (240, 205, 140)),
}

BEZEL_SCREEN = (75, 66, 1320, 2868)   # Apple's bezel PNG: screen cutout at this offset
SCREEN_RADIUS = 170
STATUS_H = 145   # fills the screen exactly with a 1080x2228 capture
APPLE = (1320, 2868)
PLAY = (1440, 2560)   # 9:16; the 1080px capture sits on it unscaled

# ---------- background ----------

def background(size, name):
    """Flat brand colour with paper grain; the ribbon (ribbon.py) is laid on top."""
    im = Image.new('RGB', size, PALETTE[name][0])
    noise = Image.effect_noise(size, 18).convert('L')
    return Image.blend(im, Image.merge('RGB', (noise, noise, noise)), 0.045).convert('RGBA')

# ---------- helpers ----------

def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m

def drop_shadow(canvas, layer, xy, blur=60, offset=(0, 40), alpha=120):
    sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    a = layer.getchannel('A').point(lambda v: v * alpha // 255)
    sh.paste((20, 12, 8, 255), (xy[0] + offset[0], xy[1] + offset[1]), a)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh)
    canvas.alpha_composite(layer, xy)
    return canvas

def load_logo(width):
    lg = Image.open(LOGO).convert('RGBA')
    lg.putdata([(r, g, b, 0) if r > 235 and g > 235 and b > 235 else (r, g, b, a)
                for (r, g, b, a) in lg.getdata()])
    return lg.resize((width, round(width * lg.height / lg.width)), Image.LANCZOS)

def is_dark(rgb):
    r, g, b = rgb[:3]
    return 0.299 * r + 0.587 * g + 0.114 * b < 128

# ---------- screen content ----------

def draw_status_bar(img, dark):
    d = ImageDraw.Draw(img)
    fg = (245, 240, 230) if dark else (45, 31, 26)
    d.text((132, 46), '9:41', font=ImageFont.truetype(F_HEAD, 54), fill=fg)
    x = img.width - 132
    d.rounded_rectangle((x - 82, 58, x, 98), radius=10, outline=fg, width=4)
    d.rounded_rectangle((x - 76, 64, x - 6, 92), radius=6, fill=fg)
    d.rounded_rectangle((x + 4, 70, x + 10, 86), radius=3, fill=fg)
    # Signal bars + wifi in iOS's shapes, drawn at 4x and scaled down for smooth
    # edges. Wifi is three filled bands (pie-slice centre) fanning +-45deg.
    S, left, top = 4, x - 220, 58
    m = Image.new('L', (130 * S, 40 * S), 0)
    md = ImageDraw.Draw(m)
    for i, h in enumerate((13, 20, 27, 34)):
        bx = i * 14
        md.rounded_rectangle((bx * S, (38 - h) * S, (bx + 9) * S, 38 * S), radius=2 * S, fill=255)
    cx = 94
    for r0, r1 in ((28, 37), (15, 24), (0, 11)):   # outermost first: each erase clears only its own hole
        md.pieslice(((cx - r1) * S, (38 - r1) * S, (cx + r1) * S, (38 + r1) * S), 225, 315, fill=255)
        if r0:
            md.pieslice(((cx - r0) * S, (38 - r0) * S, (cx + r0) * S, (38 + r0) * S), 225, 315, fill=0)
    img.paste(fg, (left, top), m.resize((130, 40), Image.LANCZOS))

def capture(path):
    return Image.open(os.path.join(HERE, path)).convert('RGB')

def screen_image(path):
    cap = capture(path)
    w, h = BEZEL_SCREEN[2], BEZEL_SCREEN[3]
    top = cap.getpixel((cap.width // 2, 20))
    scr = Image.new('RGB', (w, h), top)
    body = cap.resize((w, round(cap.height * w / cap.width)), Image.LANCZOS)
    scr.paste(body.crop((0, 0, w, min(body.height, h - STATUS_H))), (0, STATUS_H))
    draw_status_bar(scr, is_dark(top))
    return scr

_bezel = None
def framed_phone(path, bezel_path, width):
    global _bezel
    if _bezel is None:
        _bezel = Image.open(os.path.join(HERE, bezel_path)).convert('RGBA')
    x, y, w, h = BEZEL_SCREEN
    phone = Image.new('RGBA', _bezel.size, (0, 0, 0, 0))
    phone.paste(screen_image(path), (x, y), rounded_mask((w, h), SCREEN_RADIUS))
    phone = Image.alpha_composite(phone, _bezel)
    return phone.resize((width, round(phone.height * width / phone.width)), Image.LANCZOS)

def ui_card(path, width, radius=48):
    cap = capture(path)
    cap = cap.resize((width, round(cap.height * width / cap.width)), Image.LANCZOS)
    card = Image.new('RGBA', cap.size, (0, 0, 0, 0))
    card.paste(cap, (0, 0), rounded_mask(cap.size, radius))
    ImageDraw.Draw(card).rounded_rectangle((0, 0, cap.width - 1, cap.height - 1),
                                           radius=radius, outline=(45, 31, 26, 90), width=3)
    return card

# ---------- copy ----------

def draw_copy(canvas, page, scale, x0, with_logo):
    """Left-aligned headline with *accent* lines, shrunk if a line would outrun
    the page margins. Returns (text bbox area, bottom y)."""
    _, ink, accent = PALETTE[page['bg']]
    d = ImageDraw.Draw(canvas)
    y = round(150 * scale)
    area = 0
    if with_logo:
        logo = load_logo(round(130 * scale))
        canvas.alpha_composite(logo, (x0, y))
        y += logo.height + round(56 * scale)
    lines = page['headline'].split('\n')
    size = round(132 * scale)
    hf = ImageFont.truetype(F_HEAD, size)
    widest = max(d.textlength(line.strip('*'), font=hf) for line in lines)
    room = round((APPLE[0] - 200) * scale)
    if widest > room:
        size = int(size * room / widest)
        hf = ImageFont.truetype(F_HEAD, size)
    for line in lines:
        acc = line.startswith('*') and line.endswith('*')
        text = line.strip('*')
        bb = d.textbbox((0, 0), text, font=hf)
        d.text((x0 - bb[0], y - bb[1]), text, font=hf, fill=accent if acc else ink)
        area += (bb[2] - bb[0]) * (bb[3] - bb[1])
        y += round(size * 1.1)
    return area, y

# ---------- layout: one large phone (Apple) or card (Play) under the copy ----------

APPLE_PHONE_W = 1160   # screen ~1040px wide: the UI reads at close to native size
PLAY_CARD_W = 1080    # the capture's native width: no resampling of the UI

def apple_layout(canvas, page, top, width):
    p = framed_phone(page['capture'], CFG['bezel'], width)
    drop_shadow(canvas, p, ((APPLE[0] - p.width) // 2, top))

def play_layout(canvas, page, top, width):
    c = ui_card(page['capture'], width)
    drop_shadow(canvas, c, ((PLAY[0] - c.width) // 2, top), blur=40, offset=(0, 28))

# ---------- main ----------

def render(pages, store):
    """Render a store's whole set: copy first (to learn where each phone
    starts), then one ribbon through all pages, then copy and phones on top."""
    size = APPLE if store == 'apple' else PLAY
    W, H = size
    scale = W / APPLE[0]
    copy = []
    for page in pages:
        layer = Image.new('RGBA', size, (0, 0, 0, 0))
        area, bottom = draw_copy(layer, page, scale, round(100 * scale), page['id'] == 'hero')
        copy.append((layer, area, bottom))
    gap = round(60 * scale + 0.1 * W)   # room for the ribbon between headline and phone
    tops = [bottom + gap for _, _, bottom in copy]
    tape = ribbon.Ribbon(tops, size)
    layout = apple_layout if store == 'apple' else play_layout
    # One size for the whole set: the largest that keeps the lowest-starting
    # phone whole, so no page cuts off the bottom of the UI (tab bar, buttons).
    if store == 'apple':
        max_w, (bw, bh) = APPLE_PHONE_W, Image.open(os.path.join(HERE, CFG['bezel'])).size
    else:
        max_w, (bw, bh) = PLAY_CARD_W, capture(pages[0]['capture']).size
    width = min(max_w, (H - max(tops) - round(90 * scale)) * bw // bh)
    out = []
    for k, (page, (layer, area, _)) in enumerate(zip(pages, copy)):
        canvas = background(size, page['bg'])
        ribbon.compose(canvas, tape, k)
        canvas.alpha_composite(layer)
        layout(canvas, page, tops[k], width)
        out.append((canvas.convert('RGB'), area))
    return out

CFG = json.load(open(os.path.join(HERE, 'manifest.json')))

STORES = {'apple': APPLE, 'play': PLAY}

def main():
    meta = {}
    for store, size in STORES.items():
        out = os.path.join(HERE, 'pages-v2', store)
        os.makedirs(out, exist_ok=True)
        for old in os.listdir(out):
            os.remove(os.path.join(out, old))
        pages = [p for p in CFG['pages'] if p.get(store, True)]   # "play": false = App Store only
        for idx, (page, (im, area)) in enumerate(zip(pages, render(pages, store)), 1):
            name = f'{idx:02d}-{page["id"]}-{im.width}x{im.height}.png'
            im.save(os.path.join(out, name), optimize=True)
            m = meta.setdefault(page['id'], {'id': page['id'],
                                             'headline': page['headline'].replace('*', ''),
                                             'alt': page['alt']})
            m[store] = os.path.relpath(os.path.join(out, name), HERE)
            m[f'{store}_index'] = idx
            if store == 'play':
                m['play_text_fraction'] = area / (size[0] * size[1])
            print(f'{store} {name}')
    meta = sorted(meta.values(), key=lambda m: m['apple_index'])
    json.dump(meta, open(os.path.join(HERE, 'pages-v2', 'meta.json'), 'w'), indent=2, ensure_ascii=False)
    for store, size in STORES.items():
        pages = sorted((m for m in meta if store in m), key=lambda m: m[f'{store}_index'])
        th = 700; tw = round(size[0] * th / size[1])
        sheet = Image.new('RGB', ((tw + 12) * len(pages) + 12, th + 24), (120, 110, 100))
        for k, m in enumerate(pages):
            sheet.paste(Image.open(os.path.join(HERE, m[store])).resize((tw, th), Image.LANCZOS),
                        (12 + k * (tw + 12), 12))
        sheet.save(os.path.join(HERE, 'pages-v2', f'sheet-{store}.jpg'), quality=88)

if __name__ == '__main__':
    main()
