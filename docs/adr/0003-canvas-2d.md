# ADR-0003: Plain Canvas 2D renderer, not React Konva

Status: accepted · 2026-10-30

## Context

The helix is thousands of procedurally sampled points re-computed every frame as the camera moves. Konva's scene graph is designed for persistent, draggable objects; it adds overhead and a dependency without helping here.

## Decision

A framework-free renderer in `src/core/render.ts`: `drawFrame(ctx, { cam, theme, now, gridOffsetPx })`. It is a pure function of its inputs. React owns only the UI chrome and the input handlers.

## Consequences

- No rendering dependency; easy to reason about and to test the maths behind it.
- Event markers and hit-testing (Phase 2) are written by hand: `layout()` exposes shared geometry for that.
- Move to WebGL only if a theme (e.g. particle effects) cannot hold 60 fps on Canvas 2D.
