# ADR-0023: The gift edition (title card and soundtrack)

Date: 5 November 2026 · Status: accepted

## Context

The Starsigns tour is free on sp4cetime.org and stays free (DECISIONS: paid tiers sell output, polish and privacy, never a truer picture). The owner sells made-to-order tours on Etsy (shop AstrologyTours, CA$4.99) and later on sp4cetime.store. A paid tour has to be more than the free one: a gift, ready to send.

## Decision

- **A title card** at the start of the ▶ Go video: a heading ("Happy 36th, Sam!"), a message (up to 160 characters) and the moment and place, centred on the view, held 5 s and faded over 1 s in ten steps. It is a page box (`.gift-card`) drawn into the recording with the others (capture.ts `pageBoxes`), so the video holds exactly what was on screen.
- **A soundtrack** under the whole tour, faded out over the last view: the sky hum (as free), three moods made from numbers in `src/core/ambience.ts` (Calm, Music box, Deep space: 32 s seamless loops, about −20 dB, nothing to license), or the customer's own audio file (the owner checks they may use it). A second channel in `sound.ts` (`playSoundtrack`, `stopSoundtrack`) feeds the same master the recorder listens to.
- **Where:** the Gift section shows in the ✶ Starsigns dialog only at `sp4cetime.org/?gift`, where the owner makes orders. The public dialog is unchanged. The code is open (Apache 2.0) like everything else; the paid part is the service.
- **Not in a path point** (rule 16): the card and the music belong to one recording, like the capture controls, not to a view.

## Consequences

- Each Etsy order: open sp4cetime.org/?gift, fill in the customer's details and gift, ▶ Go, upload the package's MP4 and e-card (ADR-0024; the PDF until 0.4.8) to the order. The full routine, the three listings and the subscription: README.md "Where things are sold".
- Videos must still upload to X as they are (ADR-0020): the soundtrack is part of the one AAC track. Headless Chromium has no AAC encoder, so cloud checks measure the sound at the output instead; check a real recording on the Mac.
- Later: the card's text in the PDF, the gift on sp4cetime.store as a product, an e-card sent on the day.
