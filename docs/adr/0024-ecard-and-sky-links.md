# ADR-0024: The gift's e-card and sky links

Date: 6 November 2026 · Status: accepted

## Context

The gift edition (ADR-0023) sold a video and a PDF of the final view. The owner asked for the PDF to become an e-card that looks and opens like a real greeting card (folded in half from 8.5 × 11 in landscape): the heading and message over a picture on the front; a click opens it to the personalised star map; another click closes it on the back, with the sp4cetime logo and a QR code that takes the person to their own tour on sp4cetime.org, to stop and look around (and, the owner hopes, stay).

## Decision

- **One self-contained HTML file** (`src/core/ecard.ts`, pure): pictures as data: URLs, the logo and QR code as inline SVG, a few lines of script for the clicks (front → open spread → back → front), CSS 3D for the fold, `prefers-reduced-motion` respected. It opens offline, from an email attachment or an Etsy download, on a phone or a computer. **Printing** it gives two landscape Letter pages (outside: back | front; inside: left | right) to print double-sided and fold.
- **Pictures from the tour itself**: the front is the view a moment after landing in the field, the star map the final wheel, both taken from the views alone (`viewJpeg`: no captions or boxes), popped like the videos.
- **Sky links** (`src/core/skyLink.ts`): the tour is rebuilt from what makes it (local date and time, latitude and longitude to 3 decimals, the IANA zone, the place's name, the house system, an optional heading), not shipped as a path file. A link is under 200 characters: a QR code of version 8 or less, easy to scan when printed small. The site opens the tour at its start in Presentation mode with a welcome (`src/app/skyTour.ts`, the same steps as the ✶ Starsigns dialog).
- **Our own QR encoder** (`src/core/qr.ts`), byte mode, level M, versions 1–20, after Project Nayuki's reference design: no new dependency (rule 8), like the PDF and MP4 writers. Unit tests check the standard's capacities, alignment positions, format and version bits and its Reed–Solomon worked example; generated codes were decoded by OpenCV's QR reader during development.

## Consequences

- The free package keeps its PDF; the gift package has the e-card instead.
- Anyone can make a sky link by hand; that is fine: the tour is free on the site anyway.
- Later: the e-card on sp4cetime.store (the self-serve gift), a sending date (e-card by email on the day), a choice of front picture.
