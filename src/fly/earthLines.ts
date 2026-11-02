/**
 * Earth's line skin: coastlines, big lakes and country borders as light lines on the globe,
 * the first of the planetary skins (docs/SPHERES.md). Data: Natural Earth (public domain),
 * built by scripts/build_earth_lines.py into public/textures/earth-coast.bin and
 * earth-borders.bin. Loaded the first time the lines are wanted.
 *
 * In Earth's own frame (as the texture and the graticule): x toward longitude 0 on the
 * equator, y toward 90° east, z north.
 */

import * as THREE from 'three';

const DEG = Math.PI / 180;

/** Little-endian int16 lines (n, then n pairs of lon, lat scaled to ±32767) → segment positions on a sphere of radius r. */
export function parseLines(buf: ArrayBuffer, r: number): Float32Array {
  const v = new DataView(buf);
  const out: number[] = [];
  let i = 0;
  const at = (k: number): [number, number, number] => {
    const lon = (v.getInt16(k, true) * 180) / 32767, lat = (v.getInt16(k + 2, true) * 90) / 32767;
    const c = Math.cos(lat * DEG);
    return [r * c * Math.cos(lon * DEG), r * c * Math.sin(lon * DEG), r * Math.sin(lat * DEG)];
  };
  while (i + 2 <= v.byteLength) {
    const n = v.getInt16(i, true);
    i += 2;
    if (n < 2 || i + n * 4 > v.byteLength) break;
    let prev = at(i);
    for (let k = 1; k < n; k++) {
      const p = at(i + k * 4);
      out.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
      prev = p;
    }
    i += n * 4;
  }
  return new Float32Array(out);
}

/** The lines as a group to hang on Earth's mesh (unit radius); empty until the files arrive. */
export function earthLines(base: string): THREE.Group {
  const group = new THREE.Group();
  // Just above the ground (about 6 km), under the graticule.
  const R = 1.001;
  const add = (file: string, opacity: number): void => {
    fetch(`${base}textures/${file}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(parseLines(buf, R), 3));
        const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false });
        group.add(new THREE.LineSegments(g, m));
      })
      .catch(() => {
        /* no lines: the photograph still shows the coasts */
      });
  };
  add('earth-coast.bin', 0.55);
  add('earth-borders.bin', 0.28);
  return group;
}
