"""
Build Fly mode's photographic maps (all equirectangular, 2:1):

  public/textures/earth.jpg      NASA Blue Marble (public domain), via the three-globe
                                 package's example image (npm pack three-globe).
  public/textures/moon.jpg       Solar System Scope moon map (CC BY 4.0, from NASA LRO
                                 data), via github.com/homer-jay/solar-system-textures.
  public/sky/milkyway.jpg        Solar System Scope Milky Way (CC BY 4.0), same source.
                                 Galactic coordinates: centre (l = 0) in the middle,
                                 l increasing to the left, b = +90 at the top.

    python3 scripts/build_textures.py <earth-blue-marble.jpg> <moon.jpg> <stars_milky_way.jpg>

The source Milky Way image has north at the bottom and stars baked in; this flips it,
removes point stars (the app draws its own from the catalogue), stretches the glow and
blends in the d3-celestial outline. Needs Pillow and NumPy; run build_sky.py first. The outputs are committed; re-run only to change them.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

earth_src, moon_src, mw_src = map(Path, sys.argv[1:4])
tex = Path('public/textures')
sky = Path('public/sky')
tex.mkdir(parents=True, exist_ok=True)

Image.open(earth_src).convert('RGB').resize((2048, 1024), Image.LANCZOS).save(tex / 'earth.jpg', quality=82, optimize=True, progressive=True)
Image.open(moon_src).convert('RGB').resize((1024, 512), Image.LANCZOS).save(tex / 'moon.jpg', quality=85, optimize=True, progressive=True)

# Milky Way: the photo's light-and-dark pattern (dust lanes, star clouds), blended with
# the smooth d3-celestial outline (scripts/data/milkyway-outline.png, equatorial) reprojected
# into galactic coordinates, so faint outer parts still show.
photo = ImageOps.flip(Image.open(mw_src).convert('L'))  # source has galactic north at the bottom
photo = photo.filter(ImageFilter.MedianFilter(5))  # take out point stars
p = np.asarray(photo).astype(float)
p = np.asarray(Image.fromarray(p.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(float)
p = np.clip((p - 2.6) / 15.0, 0, 1) ** 0.75  # the source is very dark: drop its noise floor, stretch the rest

H, W = p.shape
l = (0.5 - (np.arange(W) + 0.5) / W) * 2 * np.pi  # l increases to the left
b = (0.5 - (np.arange(H) + 0.5) / H) * np.pi
L, B = np.meshgrid(l, b)
g = np.stack([np.cos(B) * np.cos(L), np.cos(B) * np.sin(L), np.sin(B)], axis=-1)
EQ_TO_GAL = np.array([
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.4448296300, 0.7469822445],
    [-0.8676661490, -0.1980763734, 0.4559837762],
])
e = g @ EQ_TO_GAL  # galactic → equatorial (row vectors times the matrix = transpose applied)
ra = np.degrees(np.arctan2(e[..., 1], e[..., 0])) % 360
dec = np.degrees(np.arcsin(np.clip(e[..., 2], -1, 1)))
outline = np.asarray(Image.open('scripts/data/milkyway-outline.png').convert('L')).astype(float) / 255
oh, ow = outline.shape
o = outline[np.clip(((90 - dec) / 180 * oh).astype(int), 0, oh - 1), np.clip((ra / 360 * ow).astype(int), 0, ow - 1)]
mix = np.clip(0.7 * p + 0.45 * o * (0.6 + 0.4 * p), 0, 1)
Image.fromarray((mix * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)).save(sky / 'milkyway.jpg', quality=90, optimize=True)
print('done')
