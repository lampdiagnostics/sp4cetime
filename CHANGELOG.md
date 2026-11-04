# Changelog

Versions carry a leading zero until the public launch, which will be 1.0.

## 0.4.3 — unreleased

- **Barycentre, a teaching option (off by default; Elements › Teaching options)**: the 230 km/s straight line belongs to the solar system's centre of mass, and the Sun wobbles around it, pulled mostly by Jupiter and Saturn (up to about 2.2 solar radii, on roughly 12- and 20-year beats). With it on, the barycentre is marked and its straight line drawn thin and dashed beside the Sun, and the Sun's line and every path wobble around it, in the calendar and in Fly. Seen from Earth (Centre: Earth) the wobble cancels out, as it truly does. Modelled from the four giant planets' mean orbits (within 1% of a solar radius of astronomy-engine's barycentre, 1800–2050); points remember it. It is heavier to draw, so it sits apart from the everyday elements under **Teaching options**, a new group for truer pictures that need a word of explanation; while off it costs nothing.
- **Elements opens fully on screen**: its list is anchored to the right of its button, so it no longer runs off the right edge (the last items were cut off).
- **✶ Starsigns, a brisker and calmer video** (owner, 4 November 2026):
  - **One sweep round the sky**, the pattern for every Starsigns path: from the Sun's group, always turning east, stopping **2 seconds at each planet or group of planets**, every body once. It used to turn the short way between views, so after a big gap it swung back west over sky it had done (past the Sun again, before Pluto); now a wide gap gets pass-through points that keep the turn eastward. A test checks the pattern on random dates and places.
  - **The field is an outline**: the ground and the trees are one flat colour, **solid black at night and solid dark green by day** (following the Sun at the place, blended through twilight), instead of shaded grass and trees.
  - **A soft white-noise bed throughout** the path instead of crickets and distant traffic (and instead of silence in space).
  - **The final view is less busy**: the wheel and its planets sit on a half-dark disc, the planets larger with a dark ring and their own glow, the wheel's lines at full strength; behind them **only the zodiac's own constellations shine faintly through** (the rest of the sky dimmed, other figures and names gone), and the paths and grids step aside.

## 0.4.2 — 2026-11-04

- **Videos made for X** (ADR-0020). X turned down a one-minute Starsigns video recorded at "Small, for X": the browser's recorder makes files with a changing frame rate and, for graphics, no sound track, and X refuses both. Videos are now encoded by the browser's own encoders (WebCodecs) and packed by our own MP4 writer (`src/core/mp4.ts`, no dependency): **H.264 High profile, 4:2:0, a constant 30 frames a second** (a slow screen frame is shown twice, never skipped, so time in the video stays true), a keyframe every 2 seconds, **AAC-LC stereo sound at 48 kHz, always there** (what you hear, or silence; silent frames written by us where the browser has no AAC encoder), the index at the front ("fast start"). **Video size › For X** (was "Small, for X", 720p at 2 Mbit/s) is now **1080p** within the screen's shape at about 12 Mbit/s; Hi-res stays up to 4K for big screens. Checked with ffprobe: `h264 High yuv420p 1920x1080 30/1 progressive`, `aac LC 48000 stereo`, decoding without an error. Browsers without WebCodecs fall back to the old recorder, now with the sound track too. README "Posting on X" has the checklist and an FFmpeg line for any file X still refuses.
- **Recordings pop.** While a video records, the views are drawn at the video's own resolution (no longer the softer one a slow screen may have dropped to) and a little brighter (about 18%), with a touch more contrast and colour (in Bright, the ink darker instead). Names and boxes stay as they are.
- **GIFs keep their thin lines and their timing.** Constellation lines, spirals and orbits are thickened before the GIF is shrunk (by a third of the shrink on each side, so text stays text) and made to pop like videos; 800 px wide (was 640) at 20 frames a second (was 15); each frame stays on screen as long as really passed, so motion keeps its true speed; frames are compressed in a worker so the view keeps moving smoothly while recording; a new view or look gets a palette of its own instead of the first frame's.
- **✶ Starsigns, heard and landed:**
  - **Absolute silence in space**: on the flight to Earth and floating over it.
  - **A gentle fall to the ground** (eight seconds; height falls by equal factors, the last metres slowly, the spot below you all the way), looking down at where you will stand, then up to the sky: **you land in a grassy field ringed by trees** that hide the lowest part of the sky (an illustration, not the place's real ground). Standing there you hear **crickets chirping and traffic far off** (made from numbers in `src/core/ambience.ts`: no recordings).
  - **The field drops away from under your feet** as the planet goes see-through, falling faster and faster until it is gone, in silence, and the whole zodiac rings the view.
  - **Each body is looked at once.** The path stopped at the Sun twice: facing it first, then again when the Sun's group of planets came round. The planets' views now start with the Sun's group, from where the first view already looks, and go once round the zodiac.
- **Paths can be heard:** a point may carry a sound (`"sound": "field"`), and a chart may stand on the ground (`"ground": true`). Older files read as before.

- **Colour Mode, ultra-vivid.** A new palette after the city at sunset in "chasing" by @hi_personality: deep cobalt night, hot pink and signal red, orange and gold, electric blue and violet. The Sun's line is hot red-pink with a stronger glow, the Milky Way runs from electric blue to hot pink, and every planet keeps its own colour. Only the look changes, never where anything is. Credited under ? How to.
- **Calendar: no more racing Moon mark.** With time sped up, the "☾ Moon in …" mark on the sky (where the Moon is seen from Earth) raced across the screen. The Moon's sign now goes into the Moon's own name on its path ("Moon in ♑︎ Capricorn"), and the little circle around the Sun's sign mark is gone; "☉ Sun in …" stays under the Sun.
- **✶ Starsigns: the real zodiac behind the final wheel.** The last view looks at the ecliptic's south pole, so the wheel used to sit over the southern polar constellations, with the zodiac's own stars 90° away, out of view. A planisphere lens now folds the sky around that pole, as on a printed star wheel, so each zodiac constellation (Gemini, Cancer, Leo …) sits behind its stretch of the wheel. Longitudes stay true, latitudes are squeezed, and the lens is labelled under the wheel; the sky eases into it and back out. The sky's own sign lines, horizon and house names step aside there, since the wheel already shows them. The constellations sit about one sign from the signs of the same name: that is precession, and true.
- **The plan for 0.5.0, written down** (docs only): the spheres model (docs/SPHERES.md: the tree of spheres from the universe down to atoms, spheres that never turn and skins that do, every child carried by a skin of its parent, the viewer and loading only what can be seen, precedents from OpenSpace to Kerbal Space Program), the ~500 nearest galaxies joined by a web ruled in light years, and **the expanding universe**: a skin of the universe sphere that stretches the space between groups of galaxies over time (ΛCDM), inspired by a clip by Astronomy Today (@astronomytodayy).

## 0.4.0 — 2026-11-02

✶ Starsigns on sp4cetime.org, free; sp4cetime.store built, waiting for live payments (README.md "Opening sp4cetime.store"; ADR-0018, ADR-0019). The instrument's "Stand here" (ground view with house wedges, a transparent planet) moves to 0.5.0.

- **Signs from the equinox of the date you are looking at.** The zodiac was drawn from the equinox of the year 2000; the equinox slides west about 50″ a year (precession), so by now every sign label was 0.37° off, and in ancient times whole signs off. The sign lines, the sign names and each body's "in ♏ Scorpio" now use the equinox of the viewed date, in the calendar and in 3D.
- **The maths for houses** (`src/core/houses.ts`): the true tilt of Earth's axis on the date, sidereal time, the Ascendant and the Midheaven, Whole Sign and Equal houses; checked against Meeus's worked examples and astronomy-engine (within about an arcsecond). The Astrology dialog, video and PDF come next.
- **Earth's first surface skin:** coastlines, big lakes and country borders as light lines on the globe in 3D (Natural Earth, public domain), glowing faintly on the night side. **Elements › Coastlines and borders** turns them off; path points remember the choice.
- **✶ Starsigns** (top right; on phones in ☰ More › Display). It opens on **now and here** (this device's time, and the largest town in its time zone; ⌖ uses the exact location if you allow it), so **▷ Go** works at once. **Place** is a completer like a transit app's (type, then arrows and Tab or Enter, or a tap; larger towns first); **Lat** and **Lon** fill in when a place is chosen, and typing them fills in the nearest town and its time zone. A blank time means noon. The table gives each body's sign, degree and house, by number and name ("9 · Travel and learning").
- **▷ Go flies the free Starsigns path** in four steps: above Earth's north pole facing the Sun, the zodiac around you; turning to as few views as hold all the planets, each picked out in turn (a soft pulsing ring, its sign and degree); down to the place, looking straight up at the zodiac and the houses, the sky blue or black for that hour; then up, Earth dropping away, until the zodiac is a wheel around it, the Ascendant on the left as on the printed chart, every body picked out with its house. **▷ Go + ◉ Capture** records it as a video (watermarked, as every capture).
- **Free, with no prices on sp4cetime.org** (owner, 2 November 2026): the path (▷ Go), its video (hold ▶ Go › ◉ Record, in the dialog), **⤓ The card**, the inside of a birthday card on one page (the wheel and every sign and house, 5 × 7 in or A6, print and fold), and **⤓ The path (.json)**. **✶ Customize** leads to sp4cetime.shop (coming soon: cards and videos for birthdays, a new baby, a wedding or this very moment, with names and artwork). A **☕ Buy us a coffee!** button appears once its Stripe link is set.
- **Houses on the sky** (3D): with a Starsigns chart on, the place's horizon, the house boundaries and numbers, ASC and MC; each planet's label gives its degree and house. Far out, the **chart wheel** around Earth. Near the ground, **the sky's colour follows the Sun** (blue by day, through twilight, to black), stars and names on top. Elements › Starsigns houses turns the chart off.
- **Fixed: Earth was turned the wrong way for dates before 2000** (by up to 180°: night where day should be). Earth's pole sits so close to the sky's pole that its reported direction flips; the spin is now counted from a fixed reference, within 0.05° of astronomy-engine from 1600 to 2400.
- **Fixed: a flight that only turns the view** (same place, new direction) could put the camera at NaN for a moment (a turn about a zero-length axis).
- **sp4cetime.store** (ADR-0019; built and tested in Stripe's sandbox, opening once payments go live): a shop for things made from the sky of a moment. **Starsigns card** (US$3.99: the occasion and names on the front, your message on the back, the sky inside), **Wedding pack** (US$19.99: one design for every guest, Letter and A4, plus a table sheet), **Sky calendar** (US$5.99: twelve months of the Moon's phase and sign, planets changing sign and turning, your day marked), **Screensaver** (US$1.99: an animated page that works offline, and desktop pictures in three sizes), **Phone background** (US$0.99). Each has a live, watermarked preview; a cart; Stripe Checkout; your files are made in your browser right after paying. **Starsigns readouts** by email, every week or month (US$3.99 a readout): the sky now laid over your chart. **Astrologers we like**, linked from the shop and every readout.
- **☕ Buy us a coffee!** beside each free download in ✶ Starsigns (the video, the card, the path token), pay what you like through Stripe; shown once the live link is set. **⤓ The path (.json)** is now **⤓ Path token (.json)**. **✶ Customize** carries your moment and place to sp4cetime.store.
- **▶ Go** in the ✶ Starsigns dialog: one green button, gently pulsing. **Tap** and the path just begins. **Touch and hold** (or right-click, or ↓) for **◉ Record**, which flies the path recording a video; the recording's length shows beside **■ Stop** at the bottom of the screen, and it stops by itself at the end of the path. It replaces the dialog's separate Go and Go + Capture buttons. **◉ Capture** stays at the bottom as before.
- **✶ Starsigns at the top** on phones too (beside Now and Fly), no longer under ☰ More; its ✶ twinkles (it stays still if you ask for reduced motion).
- **"A first tour" taken down**: the 7-point example path is gone from Examples; the Present menu has no examples for now.
- **The Starsigns path in four poses** (owner, 3 November): on top of the world facing the Sun; around the sky, each body picked out; down at the place looking up, now with the constellations; and last, still standing at the place, **the planet drops away beneath your feet** (see-through) and the whole zodiac rings the view with every planet, laid out as on the printed card (it used to fly out and put Earth in the middle of the wheel). **No text panel at the top** any more: the view speaks for itself (captions are still read out to screen readers); while a path plays itself, the bottom shows only ■ Stop.
- **Computers take the phones' compact layout** (owner, 3 November): the date at the top left; ● Now, ✦ Fly and the twinkling ✶ at the top right; ◉ Capture and ☰ More at the bottom; More opens one compact box at a time under Time, Space and Display (a panel's width at the bottom right on a wide screen).
- **Starsigns, closer to the sky** (owner, 3 November): at the place you stand in a field at ground level, facing the highest point of the zodiac with the ground along the bottom of the view (names below the horizon no longer show through the ground); then the ground drops away to the whole zodiac, where every body is now a disc in its own colour on the ring (the Sun largest), not just a name. No Milky Way direction marks in the path.
- **Recordings skip the planet-by-planet highlights** (owner, 3 November): ◉ Record holds each view a little longer instead (more when more planets are in it) and moves on; playing the path live still picks out each one.
- **Video size** in ◉ Capture (owner, 3 November): **Hi-res, for desktop screens** (up to 4K, high bit rate) or **Small, for X** (720p, about 2 Mbit/s, roughly 15 MB a minute). It applies to every recording, ✶ Starsigns' ◉ Record too, and is remembered. Replaces "Sharp video".
- **✶ Starsigns, simpler** (owner, 3 November): **✶ Create Path** (it was ▶ Go) saves the path and opens ▷ Present with it chosen; its **▷ Present** button runs it by itself (arrow keys take over point by point). Two buttons beside it: **⤓ Download package** (it flies your sky while recording, then downloads one .zip with the PDF, 8.5 × 11 in landscape; the video, hi-res or small for X; and the path token) and **☕ Buy me a coffee**. No explanations in the dialog.
- **Round or full stays as you set it**: remembered between visits, and never changed by a path or a presentation (only the ◯/▭ button changes it).
- **The scale legend** (the bar with its km) sits at the bottom right corner above ☰ More, on every screen.
- **The ✶ Starsigns dialog is shorter** (owner, 3 November): no table of signs and houses (the path shows them in the sky and the card prints them); only the house system is chosen there.
- **Fixed: names changing size for a moment** when a presentation moved to a new look: the cross-fade's picture of the old screen now leaves the names out (its drawing of them never quite matched); the new names fade in.
- **Fixed: a planet's name vanishing when another is close by on screen** (Neptune beside Saturn): crowded names in 3D now move to a free line just below or above instead of being hidden.
- **◉ Capture and ▷ Present are two buttons** (owner, 3 November), each with its own menu.
- **Starsigns pauses over each view; nothing is picked out or pulses** (owner, 3 November): each group of planets is named with its signs and held a little longer the more it holds; the whole zodiac is held for ten seconds. Path points can now carry how long to stay when playing by themselves.
- **The Starsigns path keeps everything you have chosen** (owner, 3 November): time marks, spirals, orbits, grids, constellations, planets, round or full, and the controls stay as set in the menus; the path changes only the houses on the sky, the body picked out and Earth see-through at the end (and leaves out the Milky Way direction marks).
- **Fixed: the time marks (every 10 seconds) were missing after a Starsigns run.** Playing a path saved its clean look (no time grid, spirals or orbits) over your own settings. A presentation's look is now borrowed: your settings come back when it stops, and nothing it changes is saved. Browsers already affected get the time grid, spirals, orbits and planets back once.
- **◯ Round / ▭ Full at the top right** on every screen (it was under ☰ More); phones can now switch to the round window too (they still open full screen).
- **Fixed: names switching between capitals and lower case** when a presentation moved on, and in screenshots and videos: pictures of the screen now draw names exactly as shown (capitals and letter spacing), and the chart wheel's planet discs too.
- **Fixed: names flickering as each planet was picked out.** Picking out the next body made the whole screen cross-fade from a snapshot whose labels were drawn in another size and case; now only the highlight moves. The picked-out name fades up instead of jumping in size.
- **Keys** (owner, 3 November): **Space** hides the controls, then all text, then brings everything back (as H), in every view; **Elements** has **Controls** and **Text and labels** tick boxes to do the same on a phone. **Shift** on its own presents: one tap plays the path by itself, the next stops it; any arrow key takes over (→ next, ← back) until Shift plays on from that point. In 3D, **R** flies up and **F** down (Space and Shift no longer fly); **Ctrl** goes faster.
- **Domains:** sp4cetime.com, sp4cetime.io and sp4cetime.ai (and their www.) now redirect to sp4cetime.org (Cloudflare Bulk Redirects, permanent, keeping the path).
- **Stripe, in its sandbox:** the shop's products and prices (lookup keys `card`, `wedding`, `calendar`, `screensaver`, `phone`, `readout_week`, `readout_month`) and a pay-what-you-like coffee link; Stripe accepted the shop's checkout and subscription requests as sent. Live payments wait for the owner's bank and Stripe account.
- Docs: the 0.4.0 plan (✶ Starsigns free on sp4cetime.org; customising on sp4cetime.shop; a coffee button by Stripe) and the payment options (ADR-0018); version and tag notes brought up to date.

## 0.3.1 — 2026-11-02

Phones first: a clear opening screen and game-style touch controls.

- **A clear screen on phones and short windows.** The only buttons are **● Now** and **✦ Fly** (Calendar while flying) at the top, and **◉ Capture** and **☰ More** at the bottom; the date sits at the top left as text. **☰ More** opens everything else, one compact box at a time, under three tabs: **Time** (zoom, speed, ▶ Play / ❚❚ Pause), **Space** (Go to, planets, centre, elements) and **Display** (theme, Calendar / Fly / Galaxy). It remembers whether you left it open. Computers are unchanged.
- **Touch, as in phone games.** In Fly and the galaxy: a thumb stick appears wherever your thumb lands on the left half of the screen (push up to fly forward, down to back away, sideways to slide); drag anywhere else to look around; pinch apart to fly forward, together to back away; slide two fingers to move sideways, up or down. A short hint shows on arrival. In the calendar: drag to turn (as before), pinch to resize, twist two fingers to turn, slide two fingers sideways to move through time and up or down to zoom time. Each two-finger gesture does one thing until you let go.
- **Tap empty space** to hide or show the controls (or close ☰ More if it is open).
- **H hides the controls** (then the labels, then brings them back), in every view, replacing the space bar. The space bar did two different things in Fly (hide, or fly up while steering with the mouse), which surprised people; now Space always flies up in Fly, as in games, and never presses a button you last clicked with the mouse (so it can't advance a path by accident).

## 0.3.0 — 2026-11-01 (public beta)

Paths through time and space: presentations made from the map itself, Prezi-style. Go anywhere, press Return, and fly from point to point. Also: smooth video recording, smoother drawing on ordinary computers, and everything the public beta on sp4cetime.org needs.

- **Smooth videos.** Recordings were choppy (about 12 frames a second with stalls); now they are an even 30. Each frame goes to the encoder as it is drawn; the boxes' picture is refreshed only when a box changes (the clock, once a second) and copies only the styles that show; hidden names are skipped. Video is 1080p by default; tick **Sharp video (up to 4K)** in the Capture menu for more detail on a powerful computer.
- **Smooth on more devices.** The calendar and the 3D view lower their drawing resolution while frames are slow and raise it again when there is room (a steady 30 frames a second, as in Safari's Low Power Mode, is left alone). The picture is the same, only a little softer on a slow device.
- **How sure the positions are** is shown again, in the top-left box: *Ephemeris: real positions* (within 3,000 years of today), *Modelled: mean orbits* (to 10,000 years) or *Schematic* (beyond), for the moment in the middle of the view.
- **Beta**: a Beta label; *About this beta* in ? How to (what it is, how sure it is, privacy: no accounts, no cookies, no tracking of you, anonymous page counts by Cloudflare Web Analytics; feedback to hello@sp4cetime.org); a link preview picture for posts; caching and safety headers for the site; no source maps published.
- Removed what was left of features already gone: √ fit in 3D, the dial windows' plumbing, unused styles.
- **Fixed before launch** (from an independent review): two quick presses during a flight into 3D could leave the camera at the wrong point; leaving 3D or touching the controls mid-flight could leave a presentation stuck on "flying…" (now any click or scroll stops the flight where it is, and the next press flies back to the point); stopping mid-flight left time frozen while the controls said it was running; Return and Space now press a button chosen with the keyboard (Tab), as on any web page; **◀ ▶ buttons** beside Stop and a **+ Point** button while making a path, so phones and touch screens can present and make paths; a video or GIF that a browser refuses no longer leaves the Capture button stuck; the drawing resolution holds still while recording; uploaded paths are kept to values the app can show, control characters are dropped from names and captions, and an upload never replaces a saved path or poses as an example.
- **Phones and small windows**: the boxes stack without overlapping (title box and view buttons at the top, time and speed above Capture, space and view above those; the view buttons scroll sideways); a phone held sideways gets compact boxes.
- **Open source.** The code is Apache 2.0 (keep the NOTICE; credit "Based on sp4cetime"), the documentation and example paths CC BY 4.0, and the name sp4cetime a trademark (LICENSE, NOTICE, LICENSE-docs.md, TRADEMARK.md, AUTHORS.md).

- **Make a path with Return.** Go to any place in the map (any moment, any view: the calendar, Fly or the whole galaxy) and press Return. A dialog asks you to name the path; what is on screen becomes START. Travel anywhere (another time, another place, another view, another look) and press Return again: the dialog adds the view as POINT 1, then POINT 2 and so on, each with an optional caption. Tick "Stop making the path after this point" and it becomes END (or press Finish beside Capture). Esc cancels; "Discard path" throws the path away (it asks twice).
- **A point is exactly what is on screen**: the view, the moment, how time is running (speed, direction, playing or paused), the calendar's turn, size and zoom, the 3D camera (where you are, which way you look, how wide the view is), the theme, round or full window, which planets and elements are drawn, and whether the boxes and names are showing.
- **Present** (◉ Capture · ▷ Present, bottom centre): choose a saved path and Present. The view *flies* from point to point and never cuts. **Return** or **→** goes on, **←** goes back, **Esc** stops. A press during a flight heads straight on. After you look around at a point (drag, scroll, fly, change something), the next press first flies you back to the point; the press after that goes on.
- **Flights through time** zoom out until both moments fit, glide, and zoom back in (the smooth zoom-and-pan of van Wijk and Nuij), so a jump of billions of years is as easy to follow as a jump of an hour, and the view arrives exactly.
- **Flights through space** in Fly mode and the galaxy journey to the point's camera: turning to face a new body and closing in by equal factors of distance, warping past light speed when the scale changes enormously, gliding among the galaxies.
- **Between the calendar and 3D**, the flight goes to where the two already match (the calendar's own view in 3D, turned the same way) and cross-fades there. A big jump in time in 3D goes by way of the calendar, so deep time is seen passing instead of the planets spinning into a blur.
- **Changes of look dissolve**: a new theme, the round or full window, elements and boxes appearing or going fade over from a picture of the old look as the flight begins.
- **Each point's box** (top centre) names the point (START, POINT 2, END), says where it is in the path, shows its caption large, and describes its view, moment, position and the direction it faces (in arcs). It is in captures, so recording a presentation (V) records the captions and every transition, cross-fades included.
- **Paths are small files.** **⤓ Download** saves a path as a light, readable `.sp4ce.json` file (its name and, for each point, the view, moment, place and mode; a 7-point path is about 4 KB). **⤒ Upload** reads one back (it says plainly what is wrong with a file that is not a path), to present it or **✎ Continue** adding points. No account needed; this browser also keeps a copy of each path, saved after every point. The same format will carry the Library's stories later.
- **An example path**, *A first tour*, comes with the app (Examples in the Present menu): from a minute to the Sun's whole life, Earth and the Moon, Saturn, the whole galaxy, and home. Continue it to make your own copy.
- ? How to explains paths. Version numbers in the docs now all use the 0.x names (the old `v1.0` tag is gone; `v0.1.0` marks the same release).

## 0.2.0 — 2026-10-31

Three views with one set of controls, three looks everywhere, a galaxy made of stars with its black hole and neighbours, true scale only, and capture.

In short: Calendar first, ✦ Fly and ◎ Galaxy; Dark, Bright and Colour everywhere; click a name to fly there; Minecraft-style flying where W goes where you look; the whole galaxy in 3D with the Fermi bubbles, the Sun's whole-life orbit, Sgr A* and the Local Group; the zodiac behind the Sun and each body's sign; geocentric calendar; strobe; scale bar; ▶ Play · Speed · ❚❚ Pause; Capture (P, G, V) with a watermark; one scale, true. The lines below are newest first; a later line replaces an earlier one where they disagree (several round windows, Play inside Capture, √ fit and the S screenshot key were tried and removed).

- **Space grid scale bar.** “Space grid · 2,000 km between lines” is now drawn as a scale bar in the bottom-right box: two of the grid's brown dashed lines, exactly as far apart as they are on screen, joined by a bar, with the distance written above. In Fly mode the bar is as long as the grid's spacing looks at the Sun's line. (Out in the galaxy, the light-year ruler keeps its sentence.)
- **One scale: true.** √ Fit and Linear are gone, and so is the Scale menu. Fly mode and the galaxy are at true scale (true distances, sizes and sunlight), so every planet is seen from Earth against the sign and the stars it is really in (√ fit, by pulling the planets in toward the Sun, had shifted them: on 1 November 2026 Neptune, at 2° Aries, was drawn in Pisces). The calendar draws the orbits in their true proportions and orientation, sized by pinch and scroll (tying their size to the 230 km/s path, as its old True scale did, would put them far off screen at most time zooms).
- **▶ Play · Speed · ❚❚ Pause** sit together in the bottom-right box: the Speed menu (Live by default) chooses speed and direction and holds time still; ▶ Play runs it, ❚❚ Pause stops it.
- **Capture, simplified**, straight to Downloads: P a screenshot (S stays flying backward in Fly mode); G a 5-second GIF (time plays while it records, then pauses); V a video, until V again or a click on its running time (shown on the button).
- **Captures read the views back reliably**: each view is tested, and one that draws empty into another canvas (as some browsers do with a 3D or GPU canvas) is read pixel by pixel instead; the boxes are painted in one by one, so nothing but a box can cover the view.
- **Capture records what is on screen**: the views, every name, and the boxes and window tabs too when they are showing (press the space bar first to leave them out). The page's HTML is painted in from a styled copy, refreshed about once a second while recording. The ◉ Capture button now sits with the eye at the bottom centre, stays on screen (dimmed) when everything else is hidden, and is never in a capture. Every screenshot, GIF and video carries a watermark, “@sp4cetime.org”, bottom right, unless it is turned off in the menu.
- **◉ Capture** (top right, every view): a screenshot at full resolution (PNG, key P); an animated, looping GIF of 3 to 12 seconds, 480 to 800 px wide, 15 frames a second; or a video at the screen's full resolution (up to 4K wide, 30 or 60 fps, MP4 where the browser can, else WebM) until you stop it (key V), for screen savers. Only the picture and its names are recorded (Fly mode's HTML names and markers are painted in), never the boxes; hide them with the space bar while recording and a red badge stays on screen to stop. The GIF encoder is our own (median-cut palette, LZW), so no dependency was added.
- **Fly anywhere.** W now flies the way you look (it moved level with "up" before, so anything above or below your horizon, even by a few degrees, was passed by: Venus seen from Mercury never grew). A and D still slide level; Space and Shift rise and sink. Clicking a body's name is now a journey there: you turn to face it, the distance falls by equal factors (fast across the gaps, slow at the end), following the body as it moves, and you arrive just above its north pole; it takes 1.8 to 7 seconds, longer for longer trips.
- **Every chosen body keeps its spiral while Spirals is on.** Fly: coils were cut after a fixed number of turns (about 250), so fast ones (Mercury, the Moon) stopped in space while slow ones ran on; now each turn gets as many points as it needs where it is on screen, so every coil runs all the way out to the vanishing point. Calendar: tiny paths are no longer skipped; a band seen edge-on is drawn as a line instead of vanishing; Centre: Earth keeps every path a coil while Earth's yearly wiggle is followed (a band can't follow it and sat off the planet), and the Sun's mirrored band is drawn the right way up.
- **Strobe** (Elements › Strobe, calendar): the whole solar system's pose freezes behind the present so many times a year (1 to 24, slider or exact number; 5.2 to start), after Techartist's dancer worldline. Poses are taken at fixed moments, so they stay put while time runs. Each body's frozen positions are joined by straight lines: whole numbers draw still polygons (5: pentagons), in-between numbers turn a little each lap. Each pose's bodies are joined from the Sun outward, faintly. Older poses fade. Click a frozen pose to go back to that moment; time runs on from there.
- **How to** opens in the middle of the screen (never off it), with a × to close, and lists all the inspirations and credits.
- **Calendar, Fly, Galaxy.** The calendar opens first. **✦ Fly** and **◎ Galaxy** (top right) take you into 3D, and so does clicking a name in the calendar (the Sun, a planet or the Moon): you fly to just above that body's north pole (0.4 radii up), standing upright and facing the Sun: the body curves away at your feet at the bottom of the view and the Sun is near the top. (Above the Sun you face Earth.) In Fly mode, back away past 1,000 AU from the Sun and you warp out to the whole galaxy; zoom in on the galaxy (or fly at the Sun, or click it) and you warp back to the solar system. **Calendar** returns to the calendar. "Stay over one spot" is gone; Geostationary orbit is still exactly geostationary.
- **Galaxy labels**: only the Sun's path is named (the Sun now, −100 / −50 / +50 Myr, the orbit), on a backing in the path's colour so they read over the stars. The arm, Sgr A* and Fermi-bubble labels are gone.
- **The Sun's line is the thickest line**, in the calendar and in Fly mode (about twice the planets' paths).
- **Thicker paths in Fly mode**: spirals and orbits are drawn with a width on screen like the calendar's (about 1.5× the theme's trail width; orbits a little thinner, the Moon's spiral thinner still), so they stand apart from the 1 px constellation lines and time and space grids.
- **Trackpad, calendar**: scroll or pinch now makes the solar system larger or smaller (down to a tenth of the fit); Shift + scroll or pinch zooms time; sideways scroll still moves through time; dragging turns it, as before. On a touch screen, pinching resizes too.
- **Trackpad and mouse, Fly and Galaxy**: dragging turns you around what you are looking at, as dragging turns the calendar; scroll looks around; pinch widens or narrows the view without moving you; Shift + scroll or pinch zooms time, as in the calendar. The body dragging turns you around is the most prominent one near the middle of the view (else the nearest), kept in place on screen, like turning a globe; far out it is the galaxy's centre. This replaces Q/E roll; the Option key is no longer used. Moving is W A S D (and R/F). Reset view restores the normal 60° view and levels you.
- Dragging no longer catches on names in Fly mode (a press on a name is a click only if let go in place), and dragging or double-clicking never highlights text on screen.
- **Every visit opens the same way**: the calendar, in the round window, in Dark Mode, with the Sun in the centre, even after a reload, zoomed to a minute across. TIME now has Hour and Week too (Minute, Hour, Day, Week, Month, Years, Century, Galactic year, Sun's life). The planets, overlays and scale you chose are still remembered.
- **Centre: Earth is geocentric** (calendar): Earth's path becomes the straight line, the Sun's path coils around it (Earth's coil turned inside out), and every planet's path has Earth's motion taken away, so the planets loop back in retrograde as seen from Earth. Centre now offers only the Sun or Earth. (Fly mode stays as it is: there retrograde loops appear on their own, because your own path feels straight.)
- **VIEW** heading over the Planets, Scale and Centre menus; the Planets menu no longer has the Orbits and Names boxes (Orbits is under Elements).
- **The space grid's spacing** ("Space grid · 2 million km between lines", or the galaxy's light-year ruler) is shown in the bottom-right box instead of over the picture, in place of "1 px ≈ …". The Reset view button is gone.
- **Instructions** are in a "? How to" pop-up instead of always on screen.
- **Dots mark distant bodies** in Fly mode: a body smaller than a few pixels gets a small filled dot in the colour of its path, centred on where it is, beside its name (hidden when a nearer body is in front).
- **Looking around in Fly mode stays put**: dragging now turns your view where you stand (as scrolling and steering with the mouse do), so the sky and every body turn together and nothing changes sign; it no longer swings you around the body you were looking at.
- **Title box**: the title, the date and the time; in Fly and the galaxy also your position (latitude and longitude on a sphere you choose: the nearest body, the Sun or the galaxy; distance in its radii; x, y, z; cruise speed). The calendar's viewing moment, accuracy and Moon phase are gone.
- **Space bar**: the first press hides every box, the title box included; the second hides all labels too; the third brings everything back.
- **Elements** drop-down (bottom left): Spirals, Orbits, Time grid, Space grid, Constellations, Zodiac and Galaxy marks, each on or off.
- **Coils run to the vanishing point** in Fly mode: each body's path is drawn out along the line until, in perspective, it has shrunk below half a pixel, so looking down the line into the past or future they all converge on one point instead of stopping in space.
- **Shrinking the solar system** in the calendar works again (pinch or scroll out below the fit; it was stuck at the fit size). It always zooms about the Sun; the bodies' dots keep their size.
- **The Moon's sign**: the calendar's sky marks where the Sun and the Moon are on the zodiac seen from Earth now, with the sign each is in ("☾ Moon in ♋︎ Cancer"), when Zodiac is on.
- **Bodies don't vanish up close**: a night side (above a pole in winter, say) is faintly lit and its grid shows, and a body that fills the view keeps its name on screen.
- **SPACE, TIME and SPEED are drop-down menus.** SPEED runs time forward or back at normal speed, or a minute, hour, day, week, month, year, decade or century each second, or pauses it. TIME: Minute, Hour, Day, Week, Month, Year, Decade, Century, Galactic year, Sun's life ("Years" is gone).
- **True scale no longer loses the planets**: at true scale the orbits are drawn at the same kilometres per pixel as the Sun's path, and the path's kilometres per pixel are set by the time zoom (along the path only, time is distance: 230 km each second). At the new default of a minute across, 1 px is 11.5 km, so the planets were millions of pixels off screen. Choosing True scale now zooms time out until the chosen orbits fill the window, and any body beyond the window, in any scale, gets a small arrow at the window's edge pointing toward it, with its name (click it to fly there).
- **The zodiac behind the Sun**: the calendar's sky is turned so that the default view shows the Sun's current sign behind it (Scorpio, at the end of October), as seen from Earth; turning the view turns the sky from there. In Fly mode each body's name says which sign it is in, seen from where you are (stand on Earth and look around).
- **Flying like Minecraft**: click the 3D view to steer with the mouse (Esc lets go). You never roll and look at most straight up or down; W A S D fly level, Space up, Shift down, Ctrl faster (R and F also go up and down). Up is the up of wherever you arrived, or set by Reset view.
- **The black hole and the neighbours**: Sgr A* at the galaxy's centre (4.15 million suns; a black shadow ringed with light, seen from close by), which you can fly to; flying near the galaxy no longer pulls you back to the Sun (only flying straight at it, or clicking it, does). Andromeda, Triangulum, the Magellanic Clouds, M32 and M110 are placed at their real positions, distances and tilts, their looks modelled. The black hole and each neighbour are labelled (the black hole, far too small to see from afar, is shown as a marker that grows to its true size as you approach); click a name to fly over there and have a look.
- **The light-year ruler** in the galaxy view now has ticks across the Sun's path and a label at each 10,000 light years.
- **The Sun's whole life around the galaxy**, in the galaxy view: its path from its birth 4.6 billion years ago to 5 billion years from now, about 42 turns, as thin overlapping loops, with the last 100 million years highlighted. It is not a circle: the Sun bobs up and down through the disc (20.8 pc above the midplane now, rising at 7.25 km/s, an ~85 Myr period, so ±102 pc) and swings in and out between about 8.1 and 9.1 kpc from the centre (it moves 11.1 km/s inward and 12.24 km/s faster than circular), on a ~163 Myr cycle against ~230 Myr per turn, so the loops never close. The disc's midplane is drawn 20.8 pc below the Sun. A model, run unchanged over the Sun's life. The calendar and Fly mode keep the Sun's line straight.
- **Space grid in km again**: in the calendar the space grid is spaced in kilometres (1, 2 or 5 × a power of ten) and says so once: "Space grid · 2 million km between lines". Fly mode shows it the same way: no labels on the lines, the same statement near the top.
- **The galaxy's ruler is in light years**: marks every 10,000 light years along the Sun's highlighted path (about 13 million years of travel apart, where time and distance meet), with the statement near the top, replacing the −100 / −50 / +50 Myr labels.
- **Fly mode's grids are a ruler** along the Sun's line, moving in real time and not to scale with the bodies: its lines stay a visible distance apart wherever you are, and TIME sets their units. At Minute the ruler is marked every 10 seconds and drifts by quickly; at Day it is marked in hours and barely seems to move. Nothing else in the picture changes.
- **The whole coil is always there** in Fly mode: each body's path is drawn as far into past and future as the window can show from where you are (enough samples for every turn), not by the TIME buttons. Back away and more turns come into view.
- **Controls grouped as SPACE, TIME and SPEED**: places (Solar system, Earth & Moon, …) under SPACE on the left; zoom presets (Minute … Sun's life) under TIME and rates (Pause … 1 day/s) under SPEED on the right. The Space + / − selector is gone (Option-scroll and [ ] still zoom space in the calendar; Reset view resets it).
- **The same controls in every view**, in the same corners: Spirals, Orbits, grids, Constellations, Zodiac and Galaxy marks; planet picker; scale; centre; zoom presets; time speed; Go to; theme; round or full window. In the calendar, Constellations, Zodiac and Galaxy marks draw on its sky, and time speed (Pause, Live, 1 min/s … 1 day/s) runs the present faster, with the Sun still marking it. Fly mode's lens selector is gone. In 3D, √ fit pulls the planets in toward the Sun as the calendar does (sizes stay true; linear and true are real distances).
- **The galaxy is made of stars**: 90,000 points placed by the map, thin in the disc and crowded in the bulge, golden at the centre and blue-white in the arms with red glowing nebulae, over a faint haze and the dust lane. Nothing is drawn outside it: intergalactic space is empty.

- **Dark Mode, Bright Mode, Colour Mode** (formerly Scientific, Minimal Line Art and Synthwave Neon). The same three now apply in the calendar, in Fly mode and in the whole-galaxy view, and you can switch them from Fly mode too. Saved settings carry over.
- **Bright Mode's sky is a negative**: stars and the Milky Way are dark ink on paper, darker where the sky is brighter, like a printed star chart. They were nearly invisible before; now they read clearly in the calendar, in Fly mode and on the whole galaxy.
- **Labels no longer show through planets.** Star, constellation, zodiac, galaxy-mark and grid labels hide behind any body (and Saturn's rings) in front of them, and planet names hide behind nearer bodies. Sky labels also step aside rather than sit on a bright star, and hide if there is no room.
- **The warp.** Back away from the solar system in Fly mode (or press ◎ Galaxy) and, at 1,000 AU from the Sun, you speed up past light speed (the speed is shown, in light speeds) until the whole galaxy lies in front of you, seen from the side you were heading toward (never quite edge-on). Zoom back in toward the galaxy (to within 7 kpc of its disc), fly straight at the Sun, or click "☉ The Sun now", and you warp back to the solar system. Distance changes by equal factors in equal steps, so the sky, the planets' paths and the galaxy cross-fade continuously. With reduced motion the jump is instant.
- **The Sun's path around the galaxy** is drawn over the whole-galaxy view, highlighted so it can be followed from above, below or any angle: the whole orbit faintly, the last 100 million years brightening toward the Sun, the next 50 million years dashed ahead, marks every 50 Myr. It is a circular model (230 km/s at 8.178 kpc, one orbit ≈ 218 Myr) and says so.
- **The galaxy is 3D.** Instead of a flat picture it is a volume with a real thickness, as measured for the Milky Way and seen in edge-on spirals: a thin disc (~300 pc scale height) and a thick disc (~900 pc), a puffed-up bulge and bar at the centre, a slight flare at the edge, and a thin dust layer that shows as a dark lane edge-on. Fly round it from any side.
- **Fermi bubbles**: the two gamma-ray lobes standing ~25,000 light years above and below the centre, drawn as faint shells brighter at their edges, in each theme's colour, and labelled. The look follows NASA's illustrations of the bubbles: glowing magenta lobes with bright rims over a vivid galaxy (golden core, bluer arms) in Dark Mode.
- The **Whole galaxy** destination now looks from 25° above the plane on the Sun's side (42 kpc out), so the thickness, the bulge and the bubbles show.
- **Bright Mode in Fly** now draws stars exactly as the calendar does (solid ink dots of the same size and strength), and constellation and zodiac lines show their true theme colours.
- Fly mode's panels follow the theme: dark panels with light text in Dark and Colour, light panels with dark text in Bright.

## 0.1.0 — 2026-10-30

The instrument is complete: the calendar, Fly mode, the real sky and the galaxy. This release adds no new features; it makes the project self-explaining so work can continue in a fresh conversation, with any AI model or person.

- **README.md**: what sp4cetime is, where it is going (truthful instrument → Library of stories → sharing → Pro → year-two options), how to run and use it, layout, accuracy, deploy, credits.
- **DECISIONS.md** (new): every decision with its reason and record: product and business, architecture, science and geometry, the owner's interaction preferences, process, known limits.
- **CLAUDE.md**: model-agnostic working context: code map, rules, conventions, how to work with the owner, ready-to-paste prompts for starting new conversations, and a definition of done. **AGENTS.md** points other tools to it.
- Tagged `v0.1.0` in git.

## 0.0.16 — 2026-10-30

- The calendar's sky now matches Fly mode exactly: the same perspective lens (60° top to bottom) looking the same way, instead of a whole-sky disc that bent the Milky Way into a ring. It still turns with the solar system.
- **Whole galaxy**: a new ◎ Galaxy button in the calendar (and a Fly destination) shows the Milky Way from 40 kpc above, with Sgr A*, the spiral arms and the Sun marked. Scroll or fly in and out continuously from there to the solar system: the outside view fades in beyond ~300 light years from the Sun, and the sky seen from the Sun fades out. The galaxy is a schematic model (no one has photographed it from outside).
- Stars in the calendar are larger, with more difference between bright and faint, as in Fly mode.

## 0.0.15 — 2026-10-30

- The calendar now has the real sky behind it: the Milky Way and the naked-eye stars on a whole-sky disc. It turns exactly with the solar system when you rotate the view. The direction the Sun is travelling (galactic longitude 90°, in Cygnus) is to the right, like the future.
- Fly mode's controls are easier to read: bright text on darker panels whatever theme the calendar uses, and buttons that are on are clearly highlighted. Fly mode always draws with a dark theme.
- On light themes the calendar's sky is drawn as faint ink, like a star chart.

## 0.0.14 — 2026-10-30

A truer sky, and real surfaces.

- The Milky Way is now drawn from a photograph: star clouds, the bright bulge around the centre, and dark dust lanes such as the Great Rift, with the Magellanic Clouds.
- **Galaxy marks**: the galactic equator, the Galactic Centre (Sgr A*, in Sagittarius), the Anticentre (in Taurus/Auriga), and the two halfway points, l 90° in Cygnus (the direction the Sun is travelling) and l 270° in Vela.
- Stars are larger, and bright stars stand out much more from faint ones, with a soft halo.
- Earth and the Moon show their real surfaces (low-resolution NASA-based maps), lit by the Sun, with day and night where they really are. Point at a place to read its latitude and longitude.
- Image credits in `public/textures/CREDITS.md`.

## 0.0.13 — 2026-10-30

The real sky.

- Fly mode's background is now the real sky as seen from the solar system, on a sphere at infinity all around you, like a planetarium dome that covers every direction: the ~5,000 stars visible to the eye (Hipparcos, to magnitude 6) at their true brightness and colour, the Milky Way, and the brightest stars named.
- **Constellations**: all 88 figures and names. **Zodiac**: the ecliptic, the zodiac band 8° either side, the twelve 30° signs from the March equinox, and the twelve zodiac constellations highlighted in gold. The signs and the constellations no longer line up (precession has shifted them by almost a whole sign), and both are shown. Toggle each with the new buttons.
- "Turn with …" is now "Stay over one spot on …", with an explanation on hover.
- Sky data: d3-celestial (BSD-3-Clause), built by `scripts/build_sky.py` into `public/sky/` and loaded only in Fly mode.

## 0.0.12 — 2026-10-30

Spheres and arcs.

- Every place is now measured as an arc position on a sphere, in degrees, minutes and seconds: the galaxy (centred on Sgr A*, the central black hole), the Sun, and each planet and the Moon (turning with them, so longitude and latitude are geographic). Choose the sphere in Fly mode's "Position on" menu; it also shows your distance in that sphere's radii and x, y, z.
- Point at any body in Fly mode to read the latitude and longitude under the pointer.
- Body labels show the angle each body fills from where you are, instead of a distance.
- The space grid is marked in arcs of the Sun's circle around the galactic centre (seconds, minutes, degrees), labelled with the Sun's galactic longitude seen from Sgr A*. The calendar's distance read-out uses the same arcs.
- Every Fly destination now opens in front of the body, its north up, with the Sun in view. Geostationary orbit sits exactly in Earth's equatorial plane; Saturn's view is raised so the rings show.
- Real shapes are noted as variation from the perfect sphere (Earth flattened 1/298, Saturn 1/10).

## 0.0.11 — 2026-10-30

The calendar, in 3D.

- Fly mode now opens on the **Solar system** view: the Sun in the centre, the future to the right, just like the calendar.
- **Spirals**, **Orbits**, **Time grid** and **Space grid** work in Fly mode too, with the same toggles (shared with the calendar). Spirals are each body's true path through space as the Sun travels at 230 km/s, passing exactly through where each body is now; the Sun's own line runs through the middle.
- Time and space grid lines stand across the Sun's line and flow past as time runs, labelled with dates and with distance travelled since 2000.
- Spirals and orbits follow your planet choices and the Moon setting from the calendar.
- Names no longer pile up when bodies are close together on screen.

## 0.0.10.1 — 2026-10-30

- Fix: Fly mode could hang on "Loading the solar system" in the dev server. Three.js is now pre-bundled when the server starts.
- If Fly mode ever fails to load, it now says why and offers Reload or a way back to the calendar.

## 0.0.10 — 2026-10-30

Fly mode.

- New **✦ Fly** button: float in the solar system in 3D, with true sizes, distances and sunlight. It opens at geostationary orbit, turning with Earth, with Earth and the Moon in view.
- The Moon shows its real phase and every planet is lit by the Sun from where it really is; night sides are dark.
- Drag to look, W A S D to move, R / F up and down, Q / E roll, Shift for speed, scroll or pinch to move forward. Speed scales with your height, so approaching anything feels the same.
- Click any name to turn and face it. The lens buttons (Wide, ×3, ×12, ×60, or Z / X) magnify like a telescope: from geostationary orbit at ×60 the Moon fills the view, showing its real phase.
- Jump to Low Earth orbit, Earth & Moon, the Moon (Earthrise), Mars, Jupiter, Saturn (with its rings) or the Sun.
- Time runs live, or paused, or at 1 minute, 1 hour or 1 day per second. "Turn with" keeps you over the same spot (geostationary at Earth).
- Three.js loads only when you open Fly mode; the calendar is as light as before.
## 0.0.9 — 2026-10-30

Even lines.

- Spirals, the Moon's path and orbit circles are drawn as single, even lines: the same thickness and brightness all the way round, from any view, snapped to whole screen pixels so they render cleanly on Retina displays.

## 0.0.8 — 2026-10-30

One view change at a time.

- Each trackpad or wheel gesture does exactly one thing (zoom, move through time, space zoom, turn or roll), chosen when the gesture starts and held until it ends. Diagonal swipes no longer mix zooming with scrolling through time.
- Rotation drags lock to turning or rolling.
- Zooming always holds the Sun where it is on screen, including the zoom presets, so it can no longer leave the screen.

## 0.0.7 — 2026-10-30

Edge to edge, and rotation both ways.

- Spirals and paths now run from screen edge to edge at every zoom and never break up or disappear when zoomed in.
- Removed the centre line and hollow "ghost" circles shown when looking ahead or back.
- Drag empty space to rotate the solar system in both directions: up/down rolls about the line of travel, sideways turns it (with the time axis foreshortened to match). Grab the Sun to move it, or its line to slide through time.
- When centred on a planet, the grids are centred on it.

## 0.0.6 — 2026-10-30

Simple, stable paths.

- Spirals always use their true spacing and fixed sample points, so they no longer shift or glitch while zooming.
- Where turns crowd closer than a few pixels, the spiral fades into a shaded band: a soft tube that is brightest where the planet spends its time.
- New Orbits button: the orbit circles are optional, like the spirals.
- Grab the Sun to move it anywhere on the canvas; the grids stay centred on it. Reset view puts it back.

## 0.0.5 — 2026-10-30

Space zoom.

- Zoom into space separately from time: Option/Alt + scroll, the [ and ] keys, or the Space − / + buttons (up to 5,000×). "Fit" returns.
- Centre the view on any planet: everything in space shifts so that body sits where the Sun was; the time grid does not move.
- Paths are sampled adaptively: anchored coarse points, refined to ~2.5 px on screen and skipped off screen, so they stay smooth however far you zoom.
- The Moon moves to its real distance from Earth once zoomed in far enough.

## 0.0.4 — 2026-10-30

The Sun is now.

- The Sun and every body always burn at the present moment; the time and space grids flow past them in real time. A grid line labelled 02:55:00 crosses the Sun when the clock reads 02:55:00 GMT.
- Dragging sideways looks ahead or back by an exact offset that keeps flowing with time; a cursor with hollow markers shows each body at the viewed moment. "Back to now" returns.
- The separate dashed "Now" line is gone. The top-left panel shows the present date and GMT clock, plus "Viewing …" when looking away.

## 0.0.3 — 2026-10-30

Stable spirals, burning fuses, two grids.

- Spirals for every chosen body run into past and future at every zoom. Samples are anchored to fixed points on each orbit, so coils no longer shimmer or change thickness. Very dense coils are drawn at a readable minimum width, labelled on screen. Spirals can be switched off.
- The Sun, planets and Moon burn like fuses: a bright tip with a glowing, fading trail along each path.
- Time grid and space grid are separate overlays, both on by default. The space grid is fixed in space, so in live mode it sweeps past the Sun exactly like the time grid; a legend gives its spacing (km, AU, light years).
- Opens live at the present moment; clock shown in GMT.
- 49 tests; clock labels now include the date when a view spans more than a day.

## 0.0.2 — 2026-10-30

Spatial model, live time, round window.

- All eight planets and Pluto from JPL Keplerian elements, checked against astronomy-engine (≤ 0.2°). Pick any set from the Planets menu; Moon, orbit rings and names are optional.
- Orbits drawn in their true 3D orientation relative to the Sun's galactic motion (orbital axis ~30° from the direction of travel). Drag up/down (or ↑/↓, or Shift+scroll) to turn the view around the line of travel; the time axis never moves.
- Wireframe orbit rings around the Sun at the centre time.
- Orbit scale modes: √ fit, linear, and true scale against distance travelled.
- Live mode: the present stays at the centre and the axis flows past at one second per second. Dragging sideways leaves live mode; Now returns to it.
- Grid lines now sit exactly on the axis ticks, with nested minor lines; the old random grid drift is gone.
- Ticks down to single seconds.
- Distance axis: distance the Sun travels from where it is now, in km, AU and light years.
- Round window with controls in the four corners (toggle to full screen). Zoom presets fit the window.
- 41 tests.

## 0.0.1 — 2026-10-30

First prototype (Phase 1 groundwork).

- Deep-time `Time` type: exact to the second across the Sun's whole life.
- Camera with camera-relative maths, zoom about the cursor, clamped to the Sun's lifetime.
- Adaptive ticks from minutes to billions of years, calendar-aligned.
- Central Sun line, Earth helix (front/back depth), Moon helix, level-of-detail band when orbits are too dense.
- Earth position and Moon phase from astronomy-engine within ±3,000 years; mean orbits and schematic tiers beyond, labelled on screen.
- Galactic background that turns once per galactic year (230 Myr) as you scrub.
- Moving background grid, paused automatically for `prefers-reduced-motion`, with a manual pause.
- Three data-driven themes: Scientific, Minimal Line Art, Synthwave Neon.
- Drag, wheel, pinch and keyboard controls; zoom presets; phone layout.
- 26 unit and property tests; CI workflow; Cloudflare static deploy config.
