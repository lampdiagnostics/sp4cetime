# ADR-0005: Accuracy tiers and visual exaggeration

Status: accepted · 2026-10-30

## Context

Planetary theories are accurate for a few thousand years around today. Beyond ~50–100 Myr Earth's orbital phase is unknowable (solar-system chaos), and in the deep past the day and month were shorter. At true scale the helix is nearly straight (pitch ≈ 8 orbit circumferences per turn at 230 km/s).

## Decision

- **Ephemeris** (|Δt| ≤ 3,000 yr): astronomy-engine (`SunPosition`, `MoonPhase`). Dependency justified: small, tested, MIT.
- **Modelled** (≤ 10,000 yr): mean longitude and mean synodic month.
- **Schematic** (beyond): same mean models, labelled illustrative; the HUD does not name a Moon phase.
- The current tier is always visible on screen.
- Orbit radius is drawn at a fixed screen size and the UI says "Orbit sizes exaggerated for clarity". An "accurate geometry" toggle is planned for Phase 4.

## Consequences

The product can make scientific claims without overreaching, which matters for the educator audience.
