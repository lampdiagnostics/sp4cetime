# sp4cetime — Critique & 12-Month Plan to Production

Oct 30, 2026 · @Lamp Diagnostics

## Verdict

The vision is strong and the scope is mostly sensible, but the documents describe a product that does not exist yet as if it were "ready", and they skip the three hardest engineering problems: representing ±5 billion years in a browser, knowing where Earth and the Moon actually were outside a few thousand years, and drawing the helix honestly. Fix those on paper first, cut the stack to a static single-page app, and you can ship a credible public 1.0 on sp4cetime.org by **October 2027** with one part-time developer (about 15–20 hours a week) plus AI help, as long as the scope cuts below hold.

The short version of what changes:

- **Time model** — custom, not `Date` or plain floats. This is the foundation; get it wrong and everything above it breaks at zoom extremes.
- **Science** — real ephemeris only where it is valid (roughly 3000 BCE to 3000 CE), honest "schematic" mode beyond, and a disclosed exaggeration factor on the helix.
- **Stack** — Vite + React + plain Canvas 2D render core, deployed as static files to Cloudflare. No Next.js, no Konva, no backend until month 6.
- **Business** — free tool first, a small Pro tier before any marketplace. A creator marketplace is a year-two problem.
- **Docs** — move the source of truth into the Git repo, replace status claims with checkable facts.

## What the documents get right

- **A clear MVP pivot.** Repositioning from "pretty personal calendar" to "timeline + presentation tool" gives the product a job to do. Educators and presenters have a real need; calendar users already have Google Calendar.
- **Explicit non-goals.** No sync, no real-time collaboration, no native apps, no Gantt. This is the most valuable section in the README — keep it and enforce it.
- **Data-driven themes.** Treating a theme as data (palette, line weights, helix parameters) rather than code is the right call. It makes the theme editor and any future marketplace almost free.
- **Cloudflare over GoDaddy.** Correct. Static hosting on Cloudflare is free at your scale and fast worldwide.
- **Attribution to @Geosophyy.** Good practice, and it costs nothing.
- **A session log and reusable prompts.** The instinct to keep decisions written down is right; the format needs work (see below).

## Critical issues the documents miss

Five problems will decide whether the product works. None is mentioned in the Grok docs.

| # | Issue | Why it matters | Fix |
| --- | --- | --- | --- |
| 1 | **Time can't be a plain number or a `Date`** | JavaScript `Date` only covers about ±273,000 years. A double holding seconds from today loses 1-second precision past \~285 million years, and at ±5 Byr the smallest step is \~32 s. Screen math (`(t − offset) × scale`) loses even more. Minute ticks 3 billion years ago will jitter or vanish. | Own time type: `{ day: integer days from J2000, sec: 0–86400 }`. Integers are exact to 9×10^15, and 5 Byr is only 1.8×10^12 days. All rendering is **camera-relative**: subtract the camera time first, then scale. |
| 2 | **"Real Earth position and Moon phase" is only real for a few thousand years** | Planetary theories (VSOP87 and friends) are accurate for roughly a few millennia around today. Beyond \~50–100 Myr the solar system is chaotic and Earth's orbital phase is genuinely unknowable. A billion years ago the day was much shorter and the Moon closer. | Three honesty tiers, shown in the UI: **Ephemeris** (use a tested library such as `astronomy-engine`, \~±3,000 years), **Modelled** (mean orbits, secular trends), **Schematic** (illustrative, labelled so). Never show a precise Moon phase for 66 Ma. |
| 3 | **The helix in true proportion is almost a straight line** | In one year the Sun moves \~7.3 billion km, while Earth's orbit is \~0.94 billion km around. True pitch is about 8 orbit-circumferences per turn. The ecliptic is also tilted \~60° to the galactic plane, which is why the popular "vortex" animations were criticised by astronomers. | Add an explicit **exaggeration factor** and an "accurate geometry" toggle. Default to the artistic view, but say so on screen. This turns a credibility risk into a teaching feature. |
| 4 | **"Rotation proportional to drag speed" is underspecified** | If rotation accumulates from drag velocity, the same date can show different angles, and presentations won't replay identically. | Make every visual a **pure function of time**: `angle = 2π × (t − t0) / P_galactic`. Drag changes time; the picture follows. Store P = 230 Myr as a named, documented constant (published estimates span \~225–250 Myr). |
| 5 | **Dates in deep time have no standard format** | Users will type "44 BCE", "66 Ma", "4.54 Ga ± 0.05". Year 0 doesn't exist in BCE/CE; it does in astronomical numbering. | One internal representation, several input/output formats, and an **uncertainty** field on every event from day one. |

Also worth fixing in the spec:

- Name the reference frame. \~230 km/s is the Sun's speed around the galactic centre; relative to nearby stars it is \~20 km/s. Pick one and say which.
- The Sun also bobs through the galactic plane every few tens of millions of years. It's a nice, real detail for the galactic-scale view.
- A constantly moving background grid is a motion-sickness trigger. Respect `prefers-reduced-motion` and add a pause control.

## Tech stack: simplify it

The proposed stack has six moving parts the product doesn't need yet. The app is one interactive canvas; it should be built like one.

| Layer | Grok proposal | Recommended | Why |
| --- | --- | --- | --- |
| Framework | Next.js App Router | **Vite + React + TypeScript (static SPA)** | No server rendering is needed for a canvas app. Next.js on Cloudflare needs an adapter layer (OpenNext) and adds build and runtime complexity for no user benefit. The landing page can be plain static HTML in the same build. |
| Rendering | React Konva | **Plain Canvas 2D, in a framework-free `core/` package** | The helix is thousands of procedurally generated points per frame. Konva's scene graph is built for objects you drag around, not for re-sampling curves at 60 fps. A pure-TypeScript renderer is also testable without a browser. Move to WebGL only if a theme (Particle Luminous) needs it. |
| State | Zustand *or* Jotai | **Zustand** (pick one) | One store: camera, time, theme, document. Keep it out of the render loop. |
| Styling | Tailwind | Tailwind (fine) | Only for UI chrome around the canvas. |
| Backend | Supabase from Month 4 | **None until Month 6**, then Supabase *or* Cloudflare D1 + R2 | Local-first: save to IndexedDB, export/import a `.sp4ce.json` file. Shareable links can be read-only JSON on R2. Add accounts only when users ask for cross-device sync. |
| Payments | Stripe | **A merchant of record (Paddle or Lemon Squeezy)** when you charge | You're in Manitoba selling digital goods worldwide. A merchant of record handles GST/HST, PST, EU VAT and invoices for you. Stripe alone leaves that to you. |
| Astronomy | (not specified) | **`astronomy-engine`** for the ephemeris tier | Small, tested, MIT-licensed. Don't write your own ephemeris. |
| Testing | (not specified) | **Vitest** (unit + property tests) + **Playwright** (screenshot tests) | The math is the product; it needs tests more than the UI does. |
| Observability | PostHog/Plausible, Sentry | **Plausible + Sentry** | Privacy-friendly analytics fits an educator audience. |

One repo, three folders:

- `core/` — time type, camera, helix math, ephemeris tiers, LOD, renderer. No React, no DOM except a canvas handle.
- `app/` — React UI, store, editing, presentation mode.
- `content/` — themes and sample paths as JSON, validated by a schema (Zod).

## Product, scope and business

**The marketplace is the weakest part of the plan.** A two-sided marketplace needs buyers before sellers and sellers before buyers. Theme packs at $5–19 also sell poorly unless users already love the tool. Reorder it:

1. **Free tool** (now → launch): build the audience and learn what people make.
2. **Pro tier** (\~$5–8/month or \~$49/year), launched around month 9: starting with video/GIF export of presentations; unbranded embeds, private share links and extra themes come later. These are things presenters already pay for.
3. **Education licence** for schools and museums, if the beta shows demand.
4. **Creator marketplace**: year two, only if users are already sharing themes and paths for free.

**Other scope corrections:**

- **10 themes → 2 at launch.** Ship Scientific and Minimal Line Art; Synthwave follows after launch. Each extra theme is testing and art-direction time. The theme *format* matters more than the count.
- **Presentation mode is the product.** It belongs in Month 2–3, not as polish. Validate it with real users before building anything for sale.
- **Status inflation.** The README says the prototype is "ready for deployment" and DNS is "ready". No code exists yet. In a source-of-truth document, write only checkable facts: "sp4cetime.org registered at X; DNS not yet pointed."
- **Accessibility is missing.** A canvas is invisible to screen readers. Add a synchronised list view of events, full keyboard navigation, and the reduced-motion setting. Teachers will need this for school use.
- **Privacy.** Educators may make timelines with student names. Local-first storage is a selling point; say so.
- **Domains.** Five domains is fine, but redirect .com/.io/.ai to .org rather than parking them. Drop renewals you don't need; .ai is expensive.
- **Six-month roadmap is too tight** for one person with these features and the time-model work. The twelve-month plan below keeps the same order with realistic gates.

## Improving the three documents

The docs mix vision, spec, status and marketing in one place, and they repeat each other. Split them by purpose and put them in the Git repo.

| File | Purpose | What changes |
| --- | --- | --- |
| `README.md` | What it is, how to run it, how to deploy | Cut to one page. Move the business plan out. |
| `docs/SPEC.md` | The product spec, with **numbered requirements** (R1, R2…) and acceptance criteria for each | Replaces the "Current Product Definition". Add the time model, honesty tiers and exaggeration factor. |
| `docs/adr/NNNN-title.md` | One short Architecture Decision Record per decision: context, decision, consequences | Replaces DECISIONS.md. Start with ADR-0001 time model, 0002 SPA over Next.js, 0003 Canvas 2D over Konva, 0004 local-first. |
| `docs/PLAN.md` | The roadmap with phase gates | Replaces the 6-month roadmap. Update status only by ticking checkable items. |
| `docs/BUSINESS.md` | Business plan, pricing, metrics | Kept out of the engineering docs. |
| `CLAUDE.md` (or `AGENTS.md`) | Context for AI coding assistants: conventions, commands, where things live, what not to do | Replaces PROMPTS-BY-GROK.md. AI tools read it automatically, so you stop pasting. |

Smaller fixes:

- **PROMPTS-BY-GROK.md lost its formatting** — requirement lists are run together into single lines. Prompts that ask for "working code structure" in one shot also produce demo code, not production code. Ask for one module at a time, with tests.
- **Prose like "Previous sessions (summary through 28 October 2026)"** points to nothing. Git history is the session log once the code exists.
- **The X post URL** should be checked once and archived (screenshot + archive.org link), since posts get deleted.

## Simple-but-perfect engineering rules

"Simple" means few moving parts. "Perfect" means every part you keep is correct, tested and boring. Ten rules to hold the project to:

1. **Pure core, thin shell.** Time, camera, helix, ephemeris and LOD are pure functions in `core/`. The UI only calls them. Pure code is easy to test and easy for AI tools to change safely.
2. **Everything is a function of time.** No accumulated animation state. Given a time and a camera, the frame is fully determined. This makes presentations replay exactly and bugs reproducible.
3. **Camera-relative everything.** Never put an absolute deep-time value into screen math.
4. **Test the math hardest.** Unit tests with known values (Earth's position on a known date, Moon phase on a known full moon). Property tests across ±5 Byr: no NaN, monotonic ticks, smooth zoom. Screenshot tests for each theme.
5. **One schema for every file.** Documents, themes and paths are versioned JSON validated by Zod. Write a migration function the first time the format changes.
6. **Performance budget, enforced in CI.** 60 fps on a mid-range laptop and a 3-year-old phone; under \~250 KB initial JavaScript; first paint under 2 s.
7. **Trunk-based, always deployable.** Small commits to `main`, preview deploy per pull request, production deploy on merge. CI runs type-check, lint, tests and the bundle-size check.
8. **Few dependencies, each justified in an ADR.** Every library is a future upgrade chore.
9. **Honest UI.** The screen always shows which accuracy tier and exaggeration factor you are looking at.
10. **Ship to real users every phase.** Each phase ends with something live on sp4cetime.org and at least a few people using it.

## The 12-month plan to production

Six two-month phases take the project from first commit to a 1.0 launch by 29 October 2027, with July–August holding about a month of slack. At part-time pace each phase is roughly 130–170 hours, so the scope below is the minimum; anything extra moves to year two. Each phase ends with something live on sp4cetime.org and a gate; don't start the next phase until the gate passes.

&#91;embedded content: 12-month roadmap · 6 phases, 6 gates\]

Read it left to right, then down: the public beta lands at the end of June, which leaves the second half for sharing, revenue and launch.

1. **Foundations + core canvas (Nov–Dec 2026).** Repo, CI and deploys; the `Time` type and camera; adaptive ticks from minutes to billions of years; the central Sun line and Earth helix with LOD; Earth and Moon from `astronomy-engine` for the ephemeris tier; the background grid with reduced-motion support; one theme.
   - Gate: public prototype by 31 Dec 2026; zoom from 1 minute to 10 Byr with no jitter; 60 fps on a mid-range laptop.
2. **Timelines (Jan–Feb 2027).** Create, edit and delete events and ranges with uncertainty; deep-time date input (BCE, Ma, Ga); IndexedDB autosave; `.sp4ce.json` import/export with schema version; synced list view and keyboard navigation; waitlist and build-in-public posts begin.
   - Gate: 10 outside people each build a timeline without help.
3. **Presentation mode (Mar–Apr 2027).** Path editor (ordered stops with camera + time); smooth fly-through with eased zoom; auto-advance and clicker support; embeddable read-only viewer; 5 sample paths (geological epochs, life of the Sun, history of computing, space exploration, one personal timeline).
   - Gate: 8–10 target users (teachers, presenters) test it; most say they would use it for real.
4. **Honesty + polish (May–Jun 2027).** Accuracy tiers and exaggeration factor visible in the UI; a second theme (Minimal Line Art), with no theme editor until year two; performance budget and screenshot tests in CI; landing and about pages with the @Geosophyy credit.
   - Gate: public beta by 30 June 2027; no open crash bugs in Sentry.
5. **Sharing (Jul–Aug 2027).** Read-only share links stored on R2; no accounts or cloud sync yet (local-first covers it); privacy policy and terms. Use spare weeks here to absorb slips from earlier phases.
   - Gate: about 1 in 4 people who build a timeline share it at least once.
6. **Pro tier + launch (Sep–Oct 2027).** one Pro feature to start (video/GIF export) sold through a merchant of record; launch on Product Hunt plus outreach to teachers' communities and science communicators.
   - Gate: 1.0 launch by 29 Oct 2027 with the free tool stable and Pro purchasable.

What moves to year two: the theme editor, the third theme, accounts and cloud sync, further Pro features, the creator marketplace, real-time collaboration, native apps, and calendar sync.

## First two weeks (to 13 November 2026)

The goal: a "hello helix" live on sp4cetime.org with CI, and the time model decided in writing.

- [ ] Create the GitHub repo with `core/`, `app/`, `content/`, `docs/`
- [ ] Scaffold Vite + React + TypeScript (strict mode), Vitest, Playwright, ESLint, Prettier
- [ ] GitHub Actions: type-check, lint, test, build on every pull request
- [ ] Point sp4cetime.org DNS to Cloudflare; connect the repo for preview and production deploys
- [ ] Redirect the .com, .io and .ai domains to .org
- [ ] Write ADR-0001 (time model), 0002 (static SPA), 0003 (Canvas 2D), 0004 (local-first)
- [ ] Implement the `Time` type with exact add, subtract and compare; property tests across ±5 Byr
- [ ] Implement the camera (time-at-centre + seconds-per-pixel) with zoom-about-cursor
- [ ] Draw the central Sun line and one helix strand on Canvas 2D, camera-relative
- [ ] Spike: zoom from 1 minute to 10 Byr across the screen; confirm no jitter at both ends
- [ ] Write `CLAUDE.md` with conventions and commands
- [ ] Archive the @Geosophyy post and add the credit to the footer
- [ ] Deploy and send the link to 3 people
