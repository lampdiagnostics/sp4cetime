# The nearest galaxies (public/sky/galaxies.json)

**Source:** the Updated Nearby Galaxy Catalog (UNGC): I. D. Karachentsev, D. I. Makarov and
E. I. Kaisina, *Updated Nearby Galaxy Catalog*, The Astronomical Journal 145, 101 (2013),
doi:10.1088/0004-6256/145/4/101. 869 galaxies within about 11 Mpc; tables 1 and 2 from CDS
VizieR, catalogue J/AJ/145/101 (https://cdsarc.cds.unistra.fr/ftp/J/AJ/145/101/), also at NASA
HEASARC as "neargalcat".

**Licence:** none is stated by the authors, CDS or HEASARC; the catalogue is published for
research and is used here, as in other planetarium software (Gaia Sky), with this credit.

**What is kept:** the nearest 500 with a distance: name, position (J2000), distance and its
method, linear diameter, morphological type, absolute B magnitude, tidal index Θ1 and main
neighbour. Built by `scripts/build_galaxies.py`; the raw tables stay in `scripts/data/`
(not served).

**What is modelled:** the discs' looks (tinted by type, face-on to the viewer: the catalogue
gives no position angles), the web's lines (each galaxy to its main neighbour, and the
shortest bridges joining the groups) and the expansion of space between groups (ΛCDM, or the
matter-only universe as a teaching option; src/core/cosmology.ts).
