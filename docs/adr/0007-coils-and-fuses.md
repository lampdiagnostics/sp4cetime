# ADR-0007: Coils at every zoom, fuses, and the two grids

Status: accepted · 2026-10-30 · replaces the level-of-detail bands in ADR-0006

## Context

Coils sampled at fixed screen pixels shimmered: when an orbit spans only a few pixels, the samples land at different points on the orbit every frame, giving moiré and lines that change thickness. Below 4 px per orbit the coils were replaced by flat bands, so the spiral disappeared when zoomed out.

## Decision

**Anchored sampling.** Coil sample k sits at mean anomaly 2πk/N: the same points on the orbit every frame. Panning or live time only slides those points; their shape never changes. One orbit of points is computed per frame and reused by lookup. The centre anomaly is computed from day and second separately (`meanAnomalyAt`), so it stays smooth billions of years out.

**Readable minimum pitch.** Each coil is drawn at its true pitch (period ÷ seconds per pixel) or a minimum of 18 px × (period / Mercury's period)^⅓, whichever is wider. The two meet continuously, so zooming never jumps. Slower planets keep wider coils. Bodies stay at their true orbital phase at the centre time; only the spacing between turns is widened, and the screen says "Coils widened to stay readable at this zoom" whenever that happens. The Moon's coil has a 9 px minimum.

**Fuses.** The Sun and every body are drawn as a burning tip with a glowing trail along its own path behind it: about a third of a turn, at most 170 px. It brightens and thickens toward the body and uses additive light on dark themes. The tip breathes gently with real time. No randomness, so nothing flickers.

**Two grid overlays.** The time grid sits on the time ticks. The space grid is fixed to points along the Sun's galactic path, measured from its J2000.0 position. In live mode both sweep past the Sun at the same real rate. Spacing runs from km to AU to light years and is stated in a legend. Steps finer than double precision allows at that distance are skipped, so lines never jitter.

**Present moment.** The view opens live at the present, shown in GMT.

## Consequences

- Coil shape is stable under any camera motion (tested: identical consecutive frames while zooming).
- At wide zooms the coil spacing is a readability device, not physics, and is always labelled.
