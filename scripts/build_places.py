"""
Build the place list for the Starsigns dialog: towns and cities with their centres and
time zones, so "Winnipeg" is taken at the middle of town and a local birth time can be
turned into UTC (0.4.0).

  public/places.json   [[name, region, country code, latitude, longitude, zone index, population], …]
                       plus the tables of zones and country names

Towns without a zone in the source take the zone of the nearest town in the same country.

Source: Natural Earth 1:10m populated places (public domain), https://www.naturalearthdata.com,
via github.com/nvkelso/natural-earth-vector (geojson/ne_10m_populated_places.geojson):

    python3 scripts/build_places.py <ne_10m_populated_places.geojson>

The output is committed; re-run only to change it. Read by src/core/places.ts.
"""
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text())
import math

feats = [f['properties'] for f in data['features']]
known = [p for p in feats if p.get('TIMEZONE')]


def nearest_zone(p):
    # A town without a zone in the source takes the zone of the nearest town in the same country that has one.
    same = [q for q in known if q.get('ADM0_A3') == p.get('ADM0_A3')] or known
    lat, lon = math.radians(p['LATITUDE']), math.radians(p['LONGITUDE'])

    def d(q):
        la, lo = math.radians(q['LATITUDE']), math.radians(q['LONGITUDE'])
        return math.acos(max(-1, min(1, math.sin(lat) * math.sin(la) + math.cos(lat) * math.cos(la) * math.cos(lon - lo))))

    return min(same, key=d)['TIMEZONE']


zones, zi = [], {}
countries = {}
rows = []
for p in feats:
    tz = p.get('TIMEZONE') or nearest_zone(p)
    if tz not in zi:
        zi[tz] = len(zones)
        zones.append(tz)
    cc = p.get('ISO_A2') or p.get('ADM0_A3') or ''
    if cc in ('-99', None):
        cc = p.get('ADM0_A3') or ''
    countries.setdefault(cc, p.get('ADM0NAME') or '')
    name = p.get('NAME') or p.get('NAMEASCII')
    region = p.get('ADM1NAME') or ''
    rows.append([name, region, cc, round(p['LATITUDE'], 4), round(p['LONGITUDE'], 4), zi[tz], int(p.get('POP_MAX') or 0)])
rows.sort(key=lambda r: -r[6])
out = {'source': 'Natural Earth 1:10m populated places (public domain)', 'zones': zones, 'countries': countries, 'places': rows}
Path('public/places.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(len(rows), 'places', len(zones), 'zones', Path('public/places.json').stat().st_size, 'bytes')
