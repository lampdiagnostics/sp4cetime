"""
The nearest 500 galaxies for Fly mode (public/sky/galaxies.json), from the Updated
Nearby Galaxy Catalog (Karachentsev, Makarov & Kaisina 2013, AJ 145, 101; 869 galaxies
within about 11 Mpc), as NASA's HEASARC serves it (table "neargalcat", tables 1 and 2 of
the paper joined). docs/SPHERES.md §9, ADR-0021.

Download (the cloud workspace cannot reach the archive):

    https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_neargalcat.tdat.gz

unzip it into scripts/data/heasarc_neargalcat.tdat, then

    python3 scripts/build_galaxies.py [path/to/heasarc_neargalcat.tdat] [--count 500]

Kept per galaxy (rounded to what the eye can use): name, RA and Dec (degrees, J2000),
distance (Mpc) and how it was measured, linear diameter (kpc), morphological type
(RC3 T), absolute B magnitude, the tidal index Θ1 and the main neighbour ("main
disturber"). Positions, groups (Θ1 > 0: inside the neighbour's sphere of influence) and
the web are worked out in src/core/galaxies.ts, where they are tested. The Milky Way
itself is left out (it is the root of the numbers).

Licence: HEASARC marks the table public (table_security = public); the authors are
credited in public/sky/CREDITS-galaxies.md and NOTICE.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = ROOT / "scripts" / "data" / "heasarc_neargalcat.tdat"


def read_tdat(path: Path):
    """HEASARC TDAT: a <HEADER> naming the fields in order (line[1] = …), then '|'-separated rows."""
    text = path.read_text(encoding="utf-8", errors="replace")
    head, _, data = text.partition("<DATA>")
    m = re.search(r"^line\[1\]\s*=\s*(.+)$", head, re.M)
    if not m:
        raise SystemExit(f"{path}: no 'line[1] =' field list")
    fields = m.group(1).split()
    rows = []
    for line in data.splitlines():
        line = line.strip()
        if not line or line.startswith("<END>"):
            continue
        rows.append(dict(zip(fields, (c.strip() for c in line.split("|")))))
    return rows


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tdat", nargs="?", default=str(DEFAULT))
    ap.add_argument("--count", type=int, default=500)
    a = ap.parse_args()
    out = []
    for r in read_tdat(Path(a.tdat)):
        name = r.get("name", "")
        if re.sub(r"[^a-z]", "", name.lower()) in ("milkyway", "galaxy"):
            continue
        d, ra, de = num(r.get("distance")), num(r.get("ra")), num(r.get("dec"))
        if not d or d <= 0 or ra is None or de is None:
            continue
        rnd = lambda x, k: None if x is None else round(x, k)
        typ = num(r.get("morph_type"))
        out.append([
            name,
            round(ra, 4),
            round(de, 4),
            round(d, 3),
            r.get("distance_method", ""),
            rnd(num(r.get("linear_diameter")), 2),
            None if typ is None else int(typ),
            rnd(num(r.get("abs_bmag")), 1),
            rnd(num(r.get("tidal_index_1")), 1),
            r.get("neighbor_galaxy_name") or None,
        ])
    out.sort(key=lambda x: x[3])
    out = out[: a.count]
    doc = {
        "source": "Updated Nearby Galaxy Catalog (Karachentsev, Makarov & Kaisina 2013, AJ 145, 101), via NASA HEASARC (neargalcat)",
        "columns": ["name", "ra", "dec", "distMpc", "method", "diameterKpc", "type", "absB", "theta1", "neighbour"],
        "rows": out,
    }
    path = ROOT / "public" / "sky" / "galaxies.json"
    path.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False))
    far = out[-1][3] if out else 0
    print(f"{len(out)} galaxies out to {far} Mpc ({far * 3.2616:.1f} million light years) → {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
