"""
A schematic face-on map of the Milky Way for Fly mode's whole-galaxy view
(public/sky/galaxy.jpg). It is a model, not a photograph: nobody has seen our
galaxy from outside.

Model (kpc, galactic plane seen from the north galactic pole, Sgr A* at the centre):
- Sun 8.178 kpc from the centre, toward galactic longitude 180° from Sgr A*.
- Four logarithmic spiral arms, pitch 12° (Vallée 2017: 12–13°), trailing the
  galaxy's clockwise rotation. At the Sun's azimuth they lie at ~10.0 (Perseus),
  ~7.2 (Sagittarius–Carina), ~5.1 (Scutum–Centaurus) and ~3.7 kpc (Norma, which
  continues outward as the Outer arm at ~14 kpc).
- The Orion Spur, a short arm segment through the Sun.
- A central bar (half-length ~4.5 kpc, ~30° from the Sun–centre line) and bulge.
- An exponential disc (scale length ~3 kpc) fading out by ~16 kpc.

Image: 1536 × 1536 px covering ±20 kpc; x to the right = galactic +y (toward l = 90°),
y up = galactic −x... see `GALAXY_IMAGE` in src/fly/galaxy.ts for the exact mapping.
Here: column = (Y + 20) / 40 · N, row = (X + 20) / 40 · N, where (X, Y) are
galactocentric coordinates along the galactic x and y axes (the Sun is at X = −8.178).

    python3 scripts/build_galaxy.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

N = 1536
HALF = 20.0  # kpc
R_SUN = 8.178
PITCH = np.radians(12.0)
K = np.tan(PITCH)

rng = np.random.default_rng(230)
c = (np.arange(N) + 0.5) / N * 2 * HALF - HALF
Y, X = np.meshgrid(c, c)  # rows: X (galactic x), columns: Y (galactic y)
R = np.hypot(X, Y)
PHI = np.arctan2(Y, X)  # azimuth about the north galactic pole
PHI_SUN = np.pi  # the Sun is at X = −8.178, Y = 0


def arm_light_of(a_at_sun, width, start=2.6, end=16.5, fade=1.2):
    """Light of a log spiral arm passing a_at_sun kpc at the Sun's azimuth, fading in and out smoothly."""
    total = np.zeros(R.shape)
    for n in range(-3, 4):
        r_arm = a_at_sun * np.exp(K * (PHI - PHI_SUN + 2 * np.pi * n))
        taper = np.clip((r_arm - start) / fade, 0, 1) * np.clip((end - r_arm) / (fade * 2), 0, 1)
        d = np.abs(R - r_arm) * np.cos(PITCH)
        total = np.maximum(total, taper * (np.exp(-((d / width) ** 2)) + 0.25 * np.exp(-((d / (width * 2.7)) ** 2))))
    return total


def noise(scale_px, amount):
    n = rng.random((N, N))
    img = Image.fromarray((n * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(scale_px))
    a = np.asarray(img).astype(float) / 255
    a = (a - a.mean()) / (a.std() + 1e-9)
    return 1 + amount * a


disc = np.exp(-R / 3.2) * np.clip((17 - R) / 4, 0, 1)
arms = np.zeros_like(R)
for a, w in [(10.0, 1.0), (7.16, 1.0), (5.13, 1.0), (3.67, 0.9)]:
    arms += w * arm_light_of(a, 0.45)
# Orion Spur: a short segment through the Sun, from ~7.4 to ~9.4 kpc.
arms += 0.55 * arm_light_of(R_SUN, 0.3, start=7.2, end=9.6, fade=0.5)

clumps = np.clip(noise(2.2, 0.45), 0.3, None) * np.clip(noise(12, 0.3), 0.4, None)
arm_light = np.clip(arms, 0, None) * clumps * np.exp(-R / 7.5)

# Bar and bulge: an elongated Gaussian 30° from the Sun–centre line (near end toward l > 0).
ang = np.radians(30)
u = X * np.cos(ang) + Y * np.sin(ang)
v = -X * np.sin(ang) + Y * np.cos(ang)
bar = np.exp(-((u / 3.6) ** 2 + (v / 1.1) ** 2))
bulge = np.exp(-((R / 1.1) ** 2))

warm = 1.6 * bulge + 0.9 * bar + 0.5 * disc
cool = 1.25 * arm_light + 0.45 * disc * np.clip(noise(8, 0.3), 0.3, None)
rgb = np.stack([
    0.95 * warm + 0.70 * cool,
    0.80 * warm + 0.78 * cool,
    0.55 * warm + 1.00 * cool,
], axis=-1)
rgb = np.clip(rgb / np.percentile(rgb, 99.7), 0, 1) ** 0.85
img = Image.fromarray((rgb * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
out = Path('public/sky/galaxy.jpg')
img.save(out, quality=86, optimize=True, progressive=True)
print(out, out.stat().st_size)
