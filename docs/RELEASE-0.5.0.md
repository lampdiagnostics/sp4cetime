# 0.5.0 release checklist

Everything to fix and polish before 0.5.0. After 0.5.0 the owner asks a few potential customers to use the site, and their feedback shapes 0.6.0.

**The goal of 0.5.0:** the first minute on sp4cetime.org should make people say "wow", and nothing should look broken. No big new features. Anything not needed for that goal moves to "After 0.5.0" at the bottom.

How to use this file: tick items as they're done (`- [x]`), with the date and the CHANGELOG version. New bugs go in section 1. When every box in sections 1–4 is ticked, tag `v0.5.0`.

---

## 1. Bugs (things that look or work wrong)

### Seen on screen
- [ ] **Labels overlap on the calendar:** "Earth", "Venus" and the "♏ Scorpio" sign label pile on top of each other when planets are close; "Sun" and "Sun in ♏ Scorpio" sit almost on top of each other. Labels need to move apart when they'd touch (wheel and calendar both; the Sun–Mercury touch on the wheel is the same bug).
- [ ] **Constellation names cut at the circle's edge:** "ittarius" and "RPIUS" are cut where the circle clips them. Move the name inside, or hide it when it doesn't fit.
- [ ] **Phone: the "BETA" badge is clipped** in the top-left box (it shows a half-moon shape), and on narrow phones the box cuts to "SP4CETIM…".
- [ ] **Phone: half the screen is empty** below the circle in the calendar view. Use the space (a bigger circle, or the date and the next event shown there).
- [ ] **Time shows as GMT** when the browser's time zone isn't known or the page is opened in a test browser; check that a normal visitor always sees their own local time and town.
- [ ] **The first flight of a path** (from wherever you are to its start) takes 10–15 s. Shorten it to 2–3 s.
- [ ] **Old saved paths** from before the four poses still show in ▷ Paths. Offer to clear them, or mark them "old".
- [ ] **Ground at eye height:** in Stand here / Starsigns, the ground can sit up to ~2 km below the eye at the horizon (flat facets on Earth's sphere).
- [ ] **Names vanish and fade back** when a presentation changes look, instead of cross-fading.

### Sky links and the gift
- [ ] **Headings that go stale:** a QR code made with "The sky right now" still says that years later. Use "The sky over Winnipeg, 6 Nov 2026" (or the buyer's words) as the default heading in ?gift.
- [ ] Decide: a "live" sky link (no date or time) that shows the sky at the moment it's opened, for the screensaver and for cards meant to be scanned again and again.

### Housekeeping
- [ ] DECISIONS.md status line still says 0.4.8; bring it to the current version.
- [ ] Merge the `watch-buttons` branch into `main`.

## 2. Make it pop (design pass)

The site is accurate and calm, but it opens on a flat diagram. 0.5.0 should open on something beautiful and obvious. Proposed, owner chooses:

- [ ] **A first view that moves:** open on the solar system turning (a slow fly-in from the stars to the planets, ~5 s) and then settle on today, instead of opening straight on the calendar. One tap or key skips it, and it never plays again on the same device.
- [ ] **One line that says what this is**, shown on first visit only: e.g. "Where every planet is, right now, and where it's going." It fades as soon as the visitor touches anything.
- [ ] **Depth and glow:** a soft glow on the Sun and planets, faint motion trails, and a deeper star field behind the circle, so the calendar reads as space and not as a chart.
- [ ] **Colour and type:** one accent colour used on purpose (now the gold, the green Now and the blue all compete); larger, lighter planet names; fewer thin lines on screen at once.
- [ ] **Watch buttons (0.4.9) finished:** every control opens its options as little buttons and sliders, starting with the speedometer (a speed slider plus direction, Live and pause), then Capture and Paths, then More (Time, Space, Display).
- [ ] **Small delights:** a sound-on-first-tap option, the Moon's phase drawn properly, a "you are here" mark for the visitor's town.
- [ ] **The share picture:** the preview image shown when sp4cetime.org is pasted into a message or social post (Open Graph image and description) should be a striking still of the site.
- [ ] **The welcome for sky links:** someone who scans a card's QR code should get a short, lovely arrival (their heading, then the sky), not the full app at once.

Before building, make 2–3 mock-ups of the first view and the calendar restyle for the owner to pick from.

## 3. Checks on real devices

- [ ] Mac (Safari and Chrome), Windows (Chrome, Edge, Firefox), iPhone, iPad, Android phone.
- [ ] ▶ Go on each: the recording with the device's own encoder, the .zip download on iOS.
- [ ] Package memory: 4K recordings on phones; small video by default on phones?
- [ ] Keys: Shift to present and Space to hide on Windows, Firefox and Safari.
- [ ] Touch: Capture tiles and watch buttons by thumb; no button smaller than 44 px.
- [ ] Speed: first view on screen in under 2 s on a mid-range phone; bundle budgets still green in CI.
- [ ] Accessibility basics: buttons have names a screen reader can say, the text has enough contrast, and nothing works only by colour.

## 4. Release steps

- [ ] `npm run check` passes; CHANGELOG 0.5.0 entry; version 0.5.0 in package.json and CLAUDE.md.
- [ ] Push (owner says "push"), CI and the Workers build green, sp4cetime.org checked live.
- [ ] Tag `v0.5.0` and a GitHub Release from the Mac; push the older tags `v0.4.0`, `v0.4.2`, `v0.4.5` at the same time.
- [ ] A short "what to try" note for the first testers, and a simple way for them to send feedback (a form or an email address).

---

## After 0.5.0 (moved out, for 0.6.0 or later)

Moved from the ROADMAP's 0.5.0 list so that 0.5.0 stays about polish. Feedback from the first testers decides the order.

- Stand here as its own instrument (house wedges on the sky, Placidus with honest labels).
- The spheres model, the viewer's skins, honest distance labels for galaxies.
- The money trail and opening sp4cetime.store with live payments (owner's bank and Stripe first).
- Live link / screensaver (`?live`), desktop widget.
- Phones: gyroscope looking, tap to travel.
- Hospitals first in the place search.
- Readout emails tested with Stripe's test events.
- Events and stories (the Library).
