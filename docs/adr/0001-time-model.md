# ADR-0001: Deep-time representation

Status: accepted · 2026-10-30

## Context

The canvas spans ~9.6 billion years and zooms to minutes. JavaScript `Date` covers only ±273,000 years. A double holding seconds loses 1-second resolution beyond ~285 million years; at 4.6 Gyr its smallest step is ~32 s, and screen maths (`(t − offset) × scale`) loses more.

## Decision

`Time = { day: integer days since 2000-01-01 00:00 UTC, sec: seconds in [0, 86400) }`.

- Integers are exact in a double to 9×10^15; the whole range is ~3.5×10^12 days.
- All screen maths is camera-relative: `x = width/2 + diffSeconds(t, center) / secondsPerPixel`.
- Calendar: proleptic Gregorian with astronomical year numbering (Hinnant's algorithms), valid for any integer year.
- Slow-varying models (orbital phase, galactic rotation) may use `toDaysApprox`; trails are computed as offsets from the camera centre.

## Consequences

- One second is resolvable 4.6 Gyr ago (tested).
- `Date` appears only at the edges (clock, astronomy-engine within ±3,000 years).
- Every new feature that stores time must store a `Time`, not a number.
