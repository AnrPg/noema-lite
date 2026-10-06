"""svgkit — draw clean diagrams AND their regions in one go (docs/VISUAL.md).

    from svgkit import Diagram
    d = Diagram(800, 460)
    d.group('cp', 20, 20, 360, 200, 'Control plane', color='violet')      # region 'cp' (label tab) + 'cp-area'
    d.box('web', 40, 70, 150, 60, 'Web app', sub='UI, notebooks', color='violet', note='…')
    d.cyl('s3', 520, 300, 160, 110, 'Cloud storage', color='teal')
    d.arrow('web', 's3', label='writes', dashed=True)
    item = d.save(media_dir, 'platform', alt='…', credit='Drawn by noema-lite', license='own', src='part1')

Every shape that gets an id becomes a region with the exact geometry of the drawing, so
clickable / covered areas always line up. Text uses system fonts (pictures are shown as <img>).
"""
import os, json, math
from xml.sax.saxutils import escape

COLORS = {   # fill, stroke
    'violet': ('#efebff', '#7c5cff'), 'blue': ('#e1effe', '#3b82f6'), 'teal': ('#ddf6f3', '#12a5a0'),
    'green': ('#e3f7ea', '#2f9e44'), 'orange': ('#fff0e1', '#f08c00'), 'red': ('#fde8e8', '#e5484d'),
    'pink': ('#fde6f3', '#d6336c'), 'yellow': ('#fff6d6', '#e0a800'), 'gray': ('#f1f3f5', '#868e96'),
    'ink': ('#ffffff', '#343a40'),
}
FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"
INK, INK2 = '#1f2330', '#5b6172'
def fit(text, width, size, k=0.6, floor=10):
    """Largest font size ≤ size so the longest line fits in width (Helvetica-ish metrics)."""
    n = max(len(l) for l in str(text).split('\n')) or 1
    return max(floor, min(size, (width - 16) / (n * k)))

ITAL, DASH64, DASH65, ARROW = ' font-style="italic"', ' stroke-dasharray="6 4"', ' stroke-dasharray="6 5"', ' marker-end="url(#ah)"'


class Diagram:
    def __init__(self, w, h, title=None):
        self.w, self.h = w, h
        self.parts = []      # svg fragments in drawing order
        self.regions = []    # region dicts
        self.geo = {}        # id -> (x, y, w, h) for arrows
        if title: self.text(w / 2, 30, title, size=20, weight=700, anchor='middle')

    # ---------- primitives ----------
    def _region(self, rid, rect, label, **extra):
        if not rid: return
        x, y, w, h = rect
        r = {'id': rid, 'shape': 'rect', 'x': round(x, 1), 'y': round(y, 1), 'w': round(w, 1), 'h': round(h, 1), 'rx': 8}
        if label: r['label'] = label.replace('\n', ' ')
        r.update({k: v for k, v in extra.items() if v is not None})
        self.regions.append(r)

    def text(self, x, y, s, size=15, weight=500, anchor='start', color=INK, italic=False):
        lines = str(s).split('\n')
        dy = size * 1.22
        y0 = y - (len(lines) - 1) * dy / 2
        for i, ln in enumerate(lines):
            self.parts.append(f'<text x="{x:.1f}" y="{y0 + i * dy:.1f}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{color}"'
                              f'{ITAL if italic else ""} dominant-baseline="central">{escape(ln)}</text>')

    def box(self, rid, x, y, w, h, label, sub=None, color='blue', size=16, region=True, accept=None, note=None, q=None, options=None, dashed=False):
        f, s = COLORS[color]
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{f}" stroke="{s}" stroke-width="2"{DASH64 if dashed else ""}/>')
        size = fit(label, w, size, 0.62) if label else size
        if sub:
            ss = fit(sub, w, min(14, size - 3), 0.55)
            nl, ns = 1 + label.count('\n'), 1 + sub.count('\n')
            total = nl * size * 1.22 + ns * ss * 1.22 + 4
            top = y + (h - total) / 2
            self.text(x + w / 2, top + nl * size * 1.22 / 2, label, size=size, weight=700, anchor='middle')
            self.text(x + w / 2, top + nl * size * 1.22 + 4 + ns * ss * 1.22 / 2, sub, size=ss, weight=500, anchor='middle', color=INK2)
        elif label:
            self.text(x + w / 2, y + h / 2, label, size=size, weight=700, anchor='middle')
        if rid: self.geo[rid] = (x, y, w, h)
        if region and rid: self._region(rid, (x, y, w, h), label, accept=accept, note=note, q=q, options=options)

    def cyl(self, rid, x, y, w, h, label, sub=None, color='teal', size=16, accept=None, note=None, q=None):
        f, s = COLORS[color]; e = min(18, h * 0.16)
        self.parts.append(f'<path d="M{x},{y + e} v{h - 2 * e} a{w / 2},{e} 0 0 0 {w},0 v{-(h - 2 * e)}" fill="{f}" stroke="{s}" stroke-width="2"/>'
                          f'<ellipse cx="{x + w / 2}" cy="{y + e}" rx="{w / 2}" ry="{e}" fill="{f}" stroke="{s}" stroke-width="2"/>')
        cy = y + e + (h - e) / 2
        size = fit(label, w, size, 0.62)
        if sub:
            self.text(x + w / 2, cy - size * 0.5, label, size=size, weight=700, anchor='middle')
            self.text(x + w / 2, cy + size * 0.8, sub, size=fit(sub, w, min(14, size - 3), 0.55), anchor='middle', color=INK2)
        else: self.text(x + w / 2, cy, label, size=size, weight=700, anchor='middle')
        if rid: self.geo[rid] = (x, y, w, h); self._region(rid, (x, y, w, h), label, accept=accept, note=note, q=q)

    def doc(self, rid, x, y, w, h, label, color='gray', size=13, accept=None, note=None, q=None):
        f, s = COLORS[color]; c = min(14, w * 0.25)
        self.parts.append(f'<path d="M{x},{y} h{w - c} l{c},{c} v{h - c} h{-w} z" fill="{f}" stroke="{s}" stroke-width="1.8"/>'
                          f'<path d="M{x + w - c},{y} v{c} h{c}" fill="none" stroke="{s}" stroke-width="1.5"/>')
        self.text(x + w / 2, y + h / 2 + 2, label, size=fit(label, w - c / 2, size, 0.58), weight=600, anchor='middle')
        if rid: self.geo[rid] = (x, y, w, h); self._region(rid, (x, y, w, h), label, accept=accept, note=note, q=q)

    def group(self, rid, x, y, w, h, label, color='gray', size=15, note=None, accept=None, q=None, area=True):
        """Dashed container. Regions: `rid` = the label tab, `rid-area` = the whole container."""
        f, s = COLORS[color]
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{f}" fill-opacity=".45" stroke="{s}" stroke-width="2" stroke-dasharray="8 6"/>')
        tw = max(90, len(label) * size * 0.58 + 26)
        self.parts.append(f'<rect x="{x + 12}" y="{y - 14}" width="{tw}" height="28" rx="14" fill="#ffffff" stroke="{s}" stroke-width="2"/>')
        self.text(x + 12 + tw / 2, y, label, size=size, weight=700, anchor='middle', color=s)
        if rid:
            self.geo[rid] = (x, y, w, h)
            self._region(rid, (x + 12, y - 14, tw, 28), label, note=note, accept=accept, q=q)
            if area: self._region(rid + '-area', (x, y, w, h), label, note=note)

    def pill(self, rid, x, y, label, color='gray', size=13, w=None, note=None, accept=None, q=None):
        f, s = COLORS[color]; w = w or len(label) * size * 0.6 + 22; h = size + 14
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}" fill="{f}" stroke="{s}" stroke-width="1.6"/>')
        self.text(x + w / 2, y + h / 2, label, size=size, weight=700, anchor='middle')
        if rid: self.geo[rid] = (x, y, w, h); self._region(rid, (x, y, w, h), label, note=note, accept=accept, q=q)
        return w

    def line(self, pts, color='#495057', width=2, dashed=False, arrow=True, label=None, lsize=12, loff=(0, -10)):
        d = 'M' + ' L'.join(f'{px:.1f},{py:.1f}' for px, py in pts)
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"{DASH65 if dashed else ""}'
                          f'{ARROW if arrow else ""}/>')
        if label:
            (ax, ay), (bx, by) = pts[len(pts) // 2 - 1], pts[len(pts) // 2]
            self.text((ax + bx) / 2 + loff[0], (ay + by) / 2 + loff[1], label, size=lsize, weight=600, anchor='middle', color=INK2)

    def _edge(self, rid, toward):
        x, y, w, h = self.geo[rid]; cx, cy = x + w / 2, y + h / 2
        tx, ty = toward; dx, dy = tx - cx, ty - cy
        if dx == 0 and dy == 0: return cx, cy
        sx = (w / 2) / abs(dx) if dx else math.inf; sy = (h / 2) / abs(dy) if dy else math.inf
        k = min(sx, sy); return cx + dx * k, cy + dy * k

    def arrow(self, a, b, label=None, dashed=False, color='#495057', gap=4, **kw):
        """Straight arrow between two shapes (ids) or points."""
        ca = self._center(a); cb = self._center(b)
        pa = self._edge(a, cb) if isinstance(a, str) else a
        pb = self._edge(b, ca) if isinstance(b, str) else b
        L = math.hypot(pb[0] - pa[0], pb[1] - pa[1]) or 1
        pa = (pa[0] + (pb[0] - pa[0]) * gap / L, pa[1] + (pb[1] - pa[1]) * gap / L)
        pb = (pb[0] - (pb[0] - pa[0]) * (gap + 2) / L, pb[1] - (pb[1] - pa[1]) * (gap + 2) / L)
        self.line([pa, pb], color=color, dashed=dashed, label=label, **kw)

    def _center(self, a):
        if isinstance(a, str): x, y, w, h = self.geo[a]; return x + w / 2, y + h / 2
        return a

    def region(self, rid, x, y, w, h, label=None, **extra):
        """A region without drawing (e.g. a zone of a timeline)."""
        self._region(rid, (x, y, w, h), label, **extra)

    def raw(self, svg): self.parts.append(svg)

    # ---------- output ----------
    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" font-family="{FONT}">'
                '<defs><marker id="ah" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                '<path d="M0,0 L10,5 L0,10 z" fill="#495057"/></marker></defs>'
                f'<rect width="{self.w}" height="{self.h}" fill="#ffffff"/>' + ''.join(self.parts) + '</svg>')

    def save(self, media_dir, mid, alt, credit='Drawn by noema-lite (original diagram)', license='own', src=None, caption=None, keep=None):
        """Write <mid>.svg and return its media.json item (with regions). keep=[ids] limits the stored regions."""
        os.makedirs(media_dir, exist_ok=True)
        with open(os.path.join(media_dir, mid + '.svg'), 'w', encoding='utf-8') as f: f.write(self.svg())
        regs = [r for r in self.regions if keep is None or r['id'] in keep]
        item = {'id': mid, 'file': mid + '.svg', 'origin': 'plot' if isinstance(self, Plot) else 'drawn', 'alt': alt, 'credit': credit, 'license': license}
        if caption: item['caption'] = caption
        if src: item['src'] = src
        item['regions'] = regs
        return item


def write_registry(media_dir, items):
    """Merge items into media/media.json (same id → replaced), keeping other entries."""
    p = os.path.join(media_dir, 'media.json')
    reg = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {'format': 'noema.media/v1', 'items': []}
    byid = {it['id']: it for it in reg['items']}
    for it in items: byid[it['id']] = it
    reg['items'] = sorted(byid.values(), key=lambda it: it['id'])
    with open(p, 'w', encoding='utf-8') as f: json.dump(reg, f, ensure_ascii=False, indent=1)
    return p


class Plot(Diagram):
    """Function graphs (γραφικές παραστάσεις) with exact regions — e.g. "tap the maximum", "drag f, f′, f″ onto the curves".

        p = Plot(800, 500, xr=(-1, 5), yr=(-2, 6), title='f(x) = x² − 4x + 3', xlabel='x', ylabel='y')
        p.grid(); p.axes()
        p.curve('f', lambda x: x*x - 4*x + 3, color='blue', label='f', note='the parabola')
        p.point('vertex', 2, -1, label='Vertex (2, −1)', note='minimum: f′(2) = 0')
        p.zone('roots', 0.5, 3.5, label='between the roots: f(x) < 0')     # an x-interval as a region
    Data coordinates in, image coordinates out; every marked feature becomes a region.
    """
    CURVE = {'blue': '#3b82f6', 'red': '#e5484d', 'green': '#2f9e44', 'violet': '#7c5cff', 'orange': '#f08c00', 'teal': '#12a5a0', 'pink': '#d6336c', 'ink': '#343a40'}

    def __init__(self, w, h, xr, yr, title=None, xlabel='x', ylabel='y', margin=(64, 30, 46, 54)):
        super().__init__(w, h, title=title)
        self.xr, self.yr = xr, yr
        self.ml, self.mr, self.mb, self.mt = margin[0], margin[1], margin[2], margin[3] + (24 if title else 0)
        self.xlabel, self.ylabel = xlabel, ylabel

    def X(self, x): return self.ml + (x - self.xr[0]) / (self.xr[1] - self.xr[0]) * (self.w - self.ml - self.mr)
    def Y(self, y): return self.h - self.mb - (y - self.yr[0]) / (self.yr[1] - self.yr[0]) * (self.h - self.mb - self.mt)

    @staticmethod
    def ticks(a, b, n=8):
        span = b - a; raw = span / n; mag = 10 ** math.floor(math.log10(raw))
        step = next(s * mag for s in (1, 2, 2.5, 5, 10) if s * mag >= raw)
        t = math.ceil(a / step) * step; out = []
        while t <= b + 1e-9: out.append(round(t, 10)); t += step
        return out

    def grid(self, color='#eef0f4'):
        for x in self.ticks(*self.xr): self.parts.append(f'<line x1="{self.X(x):.1f}" y1="{self.Y(self.yr[0]):.1f}" x2="{self.X(x):.1f}" y2="{self.Y(self.yr[1]):.1f}" stroke="{color}" stroke-width="1"/>')
        for y in self.ticks(*self.yr): self.parts.append(f'<line x1="{self.X(self.xr[0]):.1f}" y1="{self.Y(y):.1f}" x2="{self.X(self.xr[1]):.1f}" y2="{self.Y(y):.1f}" stroke="{color}" stroke-width="1"/>')

    def axes(self, fmt=lambda v: f'{v:g}'):
        x0 = min(max(0, self.xr[0]), self.xr[1]); y0 = min(max(0, self.yr[0]), self.yr[1])
        self.line([(self.X(self.xr[0]), self.Y(y0)), (self.X(self.xr[1]) + 8, self.Y(y0))], color='#343a40', width=1.6)
        self.line([(self.X(x0), self.Y(self.yr[0])), (self.X(x0), self.Y(self.yr[1]) - 8)], color='#343a40', width=1.6)
        for x in self.ticks(*self.xr):
            if abs(x - x0) < 1e-9: continue
            self.parts.append(f'<line x1="{self.X(x):.1f}" y1="{self.Y(y0) - 4:.1f}" x2="{self.X(x):.1f}" y2="{self.Y(y0) + 4:.1f}" stroke="#343a40"/>')
            self.text(self.X(x), self.Y(y0) + 17, fmt(x), size=13, anchor='middle', color='#5b6172')
        for y in self.ticks(*self.yr):
            if abs(y - y0) < 1e-9: continue
            self.parts.append(f'<line x1="{self.X(x0) - 4:.1f}" y1="{self.Y(y):.1f}" x2="{self.X(x0) + 4:.1f}" y2="{self.Y(y):.1f}" stroke="#343a40"/>')
            self.text(self.X(x0) - 8, self.Y(y), fmt(y), size=13, anchor='end', color='#5b6172')
        self.text(self.X(self.xr[1]) + 2, self.Y(y0) - 14, self.xlabel, size=15, weight=700, anchor='end', italic=True)
        self.text(self.X(x0) + 12, self.Y(self.yr[1]) + 2, self.ylabel, size=15, weight=700, italic=True)

    def curve(self, rid, f, color='blue', label=None, note=None, q=None, n=400, xr=None, width=3, dashed=False, tag=None, tag_at=None):
        """Plot y = f(x). The region is a band around the curve's visible points (good for hotspot / drag)."""
        a, b = xr or self.xr; pts = []
        for i in range(n + 1):
            x = a + (b - a) * i / n
            try: y = f(x)
            except (ValueError, ZeroDivisionError): pts.append(None); continue
            pts.append((x, y) if self.yr[0] - 1e9 < y < self.yr[1] + 1e9 else None)
        col = self.CURVE.get(color, color); segs, cur = [], []
        for p in pts:
            if p is None or not (self.yr[0] <= p[1] <= self.yr[1]):
                if len(cur) > 1: segs.append(cur)
                cur = []
            else: cur.append(p)
        if len(cur) > 1: segs.append(cur)
        for sg in segs:
            d = 'M' + ' L'.join(f'{self.X(x):.1f},{self.Y(y):.1f}' for x, y in sg)
            self.parts.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{width}" stroke-linecap="round"{DASH64 if dashed else ""}/>')
        if tag and segs:
            x, y = tag_at if tag_at else segs[-1][-1]
            self.text(self.X(x) + 8, self.Y(y) - 12, tag, size=17, weight=800, color=col, italic=True)
        if rid and segs:
            # region: polygon band ±9 px around a thinned copy of the curve (precise enough to tell curves apart)
            P = [(self.X(x), self.Y(y)) for sg in segs for x, y in sg[::max(1, len(sg) // 40)]]
            up = [(px, py - 9) for px, py in P]; dn = [(px, py + 9) for px, py in reversed(P)]
            r = {'id': rid, 'shape': 'poly', 'points': [[round(px, 1), round(py, 1)] for px, py in up + dn]}
            if label: r['label'] = label
            r.update({k: v for k, v in (('note', note), ('q', q)) if v})
            if tag_at: r['anchor'] = [round(self.X(tag_at[0]), 1), round(self.Y(tag_at[1]), 1)]
            self.regions.append(r)

    def point(self, rid, x, y, label=None, note=None, q=None, color='ink', r=6, text=None):
        col = self.CURVE.get(color, color)
        self.parts.append(f'<circle cx="{self.X(x):.1f}" cy="{self.Y(y):.1f}" r="{r}" fill="{col}" stroke="#fff" stroke-width="2"/>')
        if text: self.text(self.X(x) + 10, self.Y(y) - 14, text, size=14, weight=700, color=col)
        if rid:
            reg = {'id': rid, 'shape': 'circle', 'cx': round(self.X(x), 1), 'cy': round(self.Y(y), 1), 'r': 16}
            if label: reg['label'] = label
            reg.update({k: v for k, v in (('note', note), ('q', q)) if v})
            self.regions.append(reg)

    def zone(self, rid, x1, x2, label=None, note=None, q=None, shade=None):
        """An x-interval (full plot height) — e.g. "tap where f is decreasing"."""
        if shade: self.parts.append(f'<rect x="{self.X(x1):.1f}" y="{self.Y(self.yr[1]):.1f}" width="{self.X(x2) - self.X(x1):.1f}" height="{self.Y(self.yr[0]) - self.Y(self.yr[1]):.1f}" fill="{shade}" fill-opacity=".25"/>')
        reg = {'id': rid, 'shape': 'rect', 'x': round(self.X(x1), 1), 'y': round(self.Y(self.yr[1]), 1), 'w': round(self.X(x2) - self.X(x1), 1), 'h': round(self.Y(self.yr[0]) - self.Y(self.yr[1]), 1), 'rx': 0}
        if label: reg['label'] = label
        reg.update({k: v for k, v in (('note', note), ('q', q)) if v})
        self.regions.append(reg)
