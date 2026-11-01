"""One continuous receipt ribbon that runs behind every page of a store set.

The path is laid out in strip coordinates (page k spans x = k..k+1 page
widths), so the ribbon leaving page k's right edge is exactly the ribbon
entering page k+1's left edge — the set reads as one picture in the store's
carousel. It rides in the band between the headline and the phone, tucking
behind each phone's top edge, and every other seam it dives down the gutters
behind the phones and climbs back up on the next page.

The tape is drawn, not generated: a flat paper band with ink edges, printed
rows across its width, the occasional half twist that shows the blank back,
and a soft shadow. Rendered at 2x and downsampled.
"""
import math, random
from PIL import Image, ImageDraw, ImageFilter

PAPER = (253, 250, 243)
PAPER_BACK = (242, 235, 220)
INK = (74, 44, 34)
PRINT = (150, 138, 126)
SS = 2  # supersampling

def _catmull_rom(pts, step):
    """Dense points along a Catmull-Rom spline through pts, roughly `step` apart."""
    out = []
    p = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        n = max(2, int(math.dist(p1, p2) / step))
        for j in range(n):
            t = j / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t
                                    + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
                                    + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3) for c in (0, 1)))
    out.append(pts[-1])
    return out

def _control_points(tops, W, H, rw):
    """The tape rides just above each phone's top edge (tops[k]), half tucked
    behind it mid-page. Every other seam it dives down the gutters behind the
    phones and climbs back up on the next page; the other seams it crosses high."""
    n = len(tops)
    ride = lambda k: tops[k] - 0.55 * rw          # centreline just above the phone
    pts = [(-0.3 * W, ride(0) + 0.3 * rw)]
    for k in range(n):
        x = k * W
        pts += [(x + 0.2 * W, ride(k)), (x + 0.5 * W, tops[k] - 0.1 * rw), (x + 0.8 * W, ride(k) - 0.15 * rw)]
        if k == n - 1:
            break
        s = (k + 1) * W
        if k % 2 == 0:
            # dive: down the right gutter, across the seam behind both phones, back up
            dip = max(tops[k], tops[k + 1]) + 0.22 * H
            pts += [(s - 0.06 * W, tops[k] + 0.08 * H), (s, dip), (s + 0.06 * W, tops[k + 1] + 0.08 * H)]
        else:
            pts.append((s, min(ride(k), ride(k + 1)) - 0.25 * rw))
    pts.append(((n + 0.3) * W, ride(n - 1) + 0.3 * rw))
    return pts

class Ribbon:
    def __init__(self, tops, page_size, seed=11):
        """tops[k]: the y where page k's phone (or card) starts."""
        W, H = page_size
        self.W, self.H = W * SS, H * SS
        self.width = 0.1 * W * SS
        pts = [(x * SS, y * SS) for x, y in _control_points(tops, W, H, 0.1 * W)]
        self.path = _catmull_rom(pts, step=2 * SS)
        # half twists at irregular intervals along the tape (arc length)
        rnd = random.Random(seed)
        arc, total = [0.0], 0.0
        for a, b in zip(self.path, self.path[1:]):
            total += math.dist(a, b)
            arc.append(total)
        self.arc = arc
        self.twists = []
        t = rnd.uniform(0.6, 1.0) * self.W
        while t < total:
            self.twists.append(t)
            t += rnd.uniform(1.3, 2.2) * self.W

    def _twist(self, s):
        """cos of the tape's roll angle at arc length s: 1 flat face-up, -1 face-down."""
        flips = 0
        span = 0.35 * self.W
        for t in self.twists:
            if s >= t + span / 2:
                flips += 1
            elif s > t - span / 2:
                u = (s - (t - span / 2)) / span
                return math.cos(math.pi * (flips + u))
            else:
                break
        return math.cos(math.pi * flips)

    def render(self, k):
        """(ribbon RGBA, shadow L) for page k, at page size. Drawn with a margin
        so the blurred, offset shadow has no hard edge at the seams."""
        P = round(self.width)
        x0 = k * self.W - P
        size = (self.W + 2 * P, self.H + 2 * P)
        layer = Image.new('RGBA', size, (0, 0, 0, 0))
        mask = Image.new('L', size, 0)
        d, md = ImageDraw.Draw(layer), ImageDraw.Draw(mask)
        reach = self.width * 2
        unit = self.W / 1320   # 1px at a 1320-wide page, in render pixels
        edge_w = max(2, round(2.2 * unit))
        row_gap = 26 * unit
        prev = None
        for i in range(len(self.path) - 1):
            (ax, ay), (bx, by) = self.path[i], self.path[i + 1]
            if max(ax, bx) < x0 - reach or min(ax, bx) > x0 + size[0] + reach:
                prev = None
                continue
            dx, dy = bx - ax, by - ay
            ln = math.hypot(dx, dy) or 1
            nx, ny = -dy / ln, dx / ln
            c = self._twist(self.arc[i])
            half = self.width / 2 * max(0.05, abs(c))
            front = c > 0
            a = (ax - x0, ay + P)
            l1, r1 = (a[0] + nx * half, a[1] + ny * half), (a[0] - nx * half, a[1] - ny * half)
            if prev is None:
                prev = (l1, r1)
                continue
            l0, r0 = prev
            light = 0.97 + 0.03 * (-nx * 0.6 - ny * 0.8)
            base = PAPER if front else PAPER_BACK
            fill = tuple(min(255, round(v * light * (0.94 + 0.06 * abs(c)))) for v in base)
            quad = [l0, l1, r1, r0]
            d.polygon(quad, fill=fill + (255,))
            md.polygon(quad, fill=255)
            d.line([l0, l1], fill=INK + (255,), width=edge_w)
            d.line([r0, r1], fill=INK + (255,), width=edge_w)
            # printed rows across the width, face-up only; placed and shaped by
            # their position along the tape, so they match across a seam
            row = int(self.arc[i + 1] // row_gap)
            if front and abs(c) > 0.7 and row != int(self.arc[i] // row_gap):
                rows = random.Random(row)
                span = half * 0.72
                t = -span
                for frac in (rows.uniform(0.25, 0.6), rows.uniform(0.1, 0.35)):
                    e = min(span, t + 2 * span * frac)
                    d.line([(a[0] + nx * t, a[1] + ny * t), (a[0] + nx * e, a[1] + ny * e)],
                           fill=PRINT + (255,), width=max(2, edge_w - 1))
                    t = e + 2 * span * rows.uniform(0.06, 0.12)
                    if t >= span:
                        break
            prev = (l1, r1)
        shadow = Image.new('L', size, 0)
        off = (round(10 * unit), round(18 * unit))
        shadow.paste(mask.filter(ImageFilter.GaussianBlur(16 * unit)), off)
        box = (P, P, P + self.W, P + self.H)
        out = (self.W // SS, self.H // SS)
        return (layer.crop(box).resize(out, Image.LANCZOS),
                shadow.crop(box).resize(out, Image.LANCZOS))

def compose(canvas, ribbon, k, strength=0.28):
    """Lay page k's slice of the ribbon (and its shadow) onto canvas in place."""
    tape, shadow = ribbon.render(k)
    dark = Image.new('RGBA', canvas.size, (30, 18, 10, 255))
    canvas.paste(dark, (0, 0), shadow.point(lambda v: round(v * strength)))
    canvas.alpha_composite(tape)
