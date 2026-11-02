"""
Build Earth's line skin for Fly mode: coastlines, big lakes and country borders as light
lines on the globe (0.4.0, the first of the planetary skins).

  public/textures/earth-coast.bin    coastlines (Natural Earth 1:50m) and lakes (1:110m)
  public/textures/earth-borders.bin  land borders between countries (Natural Earth 1:110m)

Source: Natural Earth (public domain), https://www.naturalearthdata.com, via
github.com/nvkelso/natural-earth-vector (geojson/). Download the four files named below
into one folder, then:

    python3 scripts/build_earth_lines.py <folder>

Lines are simplified (Douglas–Peucker, 0.03°, about 3 km) to keep the files small.
Format (little-endian int16): for each line, the number of points n, then n pairs
(longitude × 32767/180, latitude × 32767/90). Read by src/fly/earthLines.ts.
The outputs are committed; re-run only to change them.
"""
import json
import struct
import sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path('public/textures')
TOL = 0.03


def lines_of(name):
    data = json.loads((src / f'{name}.geojson').read_text())
    for f in data['features']:
        g = f['geometry']
        if g is None:
            continue
        c = g['coordinates']
        if g['type'] == 'LineString':
            yield c
        elif g['type'] == 'MultiLineString':
            yield from c
        elif g['type'] == 'Polygon':
            yield from c
        elif g['type'] == 'MultiPolygon':
            for p in c:
                yield from p


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = (dx * dx + dy * dy) ** 0.5
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L > 0 else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def write(path, names):
    buf = bytearray()
    total = 0
    for name in names:
        for line in lines_of(name):
            pts = simplify([(float(x), float(y)) for x, y, *_ in line], TOL)
            for start in range(0, len(pts) - 1, 30000):
                part = pts[start:start + 30001]
                if len(part) < 2:
                    continue
                buf += struct.pack('<h', len(part))
                for x, y in part:
                    buf += struct.pack('<hh', round(max(-180, min(180, x)) * 32767 / 180), round(max(-90, min(90, y)) * 32767 / 90))
                total += len(part)
    path.write_bytes(bytes(buf))
    print(path, total, 'points', len(buf), 'bytes')


write(out / 'earth-coast.bin', ['ne_50m_coastline', 'ne_110m_lakes'])
write(out / 'earth-borders.bin', ['ne_110m_admin_0_boundary_lines_land'])
