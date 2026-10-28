#!/usr/bin/env python3
"""Gate the pages-v2 set against the store rules that get listings flagged.
Run after build.py. Exits non-zero on any failure.

  - exact sizes, RGB (no alpha), PNG, under the stores' 8 MB file cap
  - caption + alt-text lint: words both stores reject (ranking / award / price /
    CTA / competitor names), plus cross-platform words (no "Android" on Apple,
    no "iPhone" on Play — Apple 2.3.10, Play "things to avoid")
  - alt text present and at most 140 characters (Play's limit)
  - Play: taglines under 20% of the image (Google's featuring guideline)
  - counts: Apple 1–10 per device size; Play 4–8 phone screenshots (8 is
    Play's maximum, 4 at 1080px+ is the featuring minimum)
"""
import json, os, re, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(os.path.join(HERE, 'pages-v2', 'meta.json')))
fails = []

SIZES = {'apple': (1320, 2868), 'play': (1440, 2560)}
COUNTS = {'apple': (1, 10), 'play': (4, 8)}
MAX_BYTES = 8 * 1024 * 1024
BANNED_BOTH = [
    '#1', 'no. 1', 'number one', 'best', 'top', 'new', 'free', 'discount', 'sale', 'off',
    'download', 'install', 'try now', 'popular', 'award', 'editor', 'choice', 'app of the',
    'million', 'users', 'rated', 'stars', '★', 'splitwise', 'tricount', 'settle up app',
]
BANNED = {
    'apple': BANNED_BOTH + ['android', 'google', 'play store', 'pixel', 'galaxy'],
    'play': BANNED_BOTH + ['iphone', 'ios', 'apple', 'app store', 'ipad'],
}

def words(text):
    return re.sub(r'[^a-z0-9#★+. ]', ' ', text.lower())

for m in meta:
    if not m.get('alt'):
        fails.append(f'{m["id"]}: missing alt text')
    elif len(m['alt']) > 140:
        fails.append(f'{m["id"]}: alt text is {len(m["alt"])} chars (> 140)')
    copy = words(m['headline'] + ' ' + m.get('alt', ''))
    for store, size in SIZES.items():
        if store not in m:
            continue
        path = os.path.join(HERE, m[store])
        im = Image.open(path)
        name = os.path.relpath(path, HERE)
        if im.format != 'PNG':
            fails.append(f'{name}: format {im.format} != PNG')
        if im.size != size:
            fails.append(f'{name}: size {im.size} != {size}')
        if im.mode != 'RGB':
            fails.append(f'{name}: mode {im.mode} != RGB (no alpha allowed)')
        if os.path.getsize(path) > MAX_BYTES:
            fails.append(f'{name}: {os.path.getsize(path) / 1e6:.1f} MB (> 8 MB)')
        for w in BANNED[store]:
            if re.search(r'(?<![a-z0-9])' + re.escape(w) + r'(?![a-z0-9])', copy):
                fails.append(f'{name}: caption or alt text contains banned word "{w}" for {store}')
    if 'play' in m and m['play_text_fraction'] > 0.20:
        fails.append(f'{m["play"]}: tagline covers {m["play_text_fraction"]:.0%} of the image (> 20%)')

counts = {store: sum(store in m for m in meta) for store in SIZES}
for store, (lo, hi) in COUNTS.items():
    if not lo <= counts[store] <= hi:
        fails.append(f'{store}: {counts[store]} pages, needs {lo}–{hi}')

if fails:
    print('QA FAIL:')
    [print(' -', f) for f in fails]
    sys.exit(1)
print(f'QA OK: {counts["apple"]} apple + {counts["play"]} play pages; sizes exact, RGB, < 8 MB, '
      'captions and alt text clean, taglines < 20%')
