"""
Build the sky for Fly mode from the d3-celestial data (BSD-3-Clause, Olaf Frohn):
stars to magnitude 6 (Hipparcos), constellation figures and names, and the
Milky Way outline, all in equatorial J2000 coordinates.

    npm pack d3-celestial && tar xzf d3-celestial-*.tgz
    python3 scripts/build_sky.py package/data public/sky

Writes sky.json (stars, names, figures) and scripts/data/milkyway-outline.png (an equirectangular
brightness map: x = right ascension 0→360°, y = declination +90 → −90).
Needs Pillow. The output is committed; this only needs re-running to change it.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
load = lambda name: json.loads((src / name).read_text())

ZODIAC = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc']

stars = []
for f in load('stars.6.json')['features']:
    ra, dec = f['geometry']['coordinates']
    bv = f['properties'].get('bv')
    try:
        bv = round(float(bv), 2)
    except (TypeError, ValueError):
        bv = 0.6
    stars += [round(ra % 360, 3), round(dec, 3), round(float(f['properties']['mag']), 2), bv]

positions = {f['id']: f['geometry']['coordinates'] for f in load('stars.6.json')['features']}
names = []
for hip, n in load('starnames.json').items():
    p = positions.get(int(hip)) if hip.isdigit() else None
    if n.get('name') and p:
        names.append({'name': n['name'], 'ra': round(p[0] % 360, 3), 'dec': round(p[1], 3), 'hip': int(hip)})
mags = {f['id']: float(f['properties']['mag']) for f in load('stars.6.json')['features']}
names = [dict(n, mag=mags[n['hip']]) for n in names if mags.get(n['hip'], 9) < 1.6]
for n in names:
    del n['hip']

figures = {}
for f in load('constellations.lines.json')['features']:
    figures[f['id']] = [[[round(p[0] % 360, 2), round(p[1], 2)] for p in line] for line in f['geometry']['coordinates']]

constellations = []
for f in load('constellations.json')['features']:
    ra, dec = f['geometry']['coordinates']
    constellations.append({
        'id': f['id'],
        'name': f['properties']['name'],
        'ra': round(ra % 360, 2),
        'dec': round(dec, 2),
        'zodiac': f['id'] in ZODIAC,
        'lines': figures.get(f['id'], []),
    })

(out / 'sky.json').write_text(json.dumps({
    'source': 'd3-celestial 0.7.35 data (BSD-3-Clause, Olaf Frohn): Hipparcos stars to magnitude 6, IAU constellations, Milky Way outline. Equatorial J2000, degrees.',
    'stars': stars,
    'names': names,
    'constellations': constellations,
}, separators=(',', ':'), ensure_ascii=False))

# Milky Way: five nested brightness levels, summed, softened. Each ring is unwrapped
# in right ascension; rings that circle the sky are closed through the north pole,
# and a polygon's rings are combined even-odd, so the band between two such rings fills.
W, H = 2048, 1024
total = Image.new('L', (W, H), 0)
weights = {'ol1': 40, 'ol2': 45, 'ol3': 50, 'ol4': 55, 'ol5': 60}


def unwrap(ring):
    xs, prev = [], None
    for lon, lat in ring:
        x = lon % 360
        if prev is not None:
            while x - prev > 180:
                x -= 360
            while x - prev < -180:
                x += 360
        xs.append((x, lat))
        prev = x
    return xs


for f in load('mw.json')['features']:
    for poly in f['geometry']['coordinates']:
        mask = Image.new('1', (W, H), 0)
        for ring in poly:
            pts = [((x / 360) * W, ((90 - lat) / 180) * H) for x, lat in unwrap(ring)]
            if abs(pts[-1][0] - pts[0][0]) > W / 2:  # circles the sky: close via the north pole
                pts = pts + [(pts[-1][0], 0), (pts[0][0], 0)]
            layer = Image.new('1', (W, H), 0)
            d = ImageDraw.Draw(layer)
            for shift in (-2 * W, -W, 0, W, 2 * W):
                d.polygon([(x + shift, y) for x, y in pts], fill=1)
            mask = ImageChops.logical_xor(mask, layer)
        total = ImageChops.add(total, mask.convert('L').point(lambda v, w=weights[f['id']]: w if v else 0))
total = total.filter(ImageFilter.GaussianBlur(10)).resize((1024, 512), Image.LANCZOS)
total.save(Path('scripts/data/milkyway-outline.png'), optimize=True)
print(len(stars) // 4, 'stars;', len(names), 'names;', len(constellations), 'constellations')
