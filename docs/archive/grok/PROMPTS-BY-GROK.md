# PROMPTS-BY-GROK.md — Galactic Calendar / sp4cetime
## Prompts suggested by Grok for consistent results

Keep this file updated. Paste the relevant section (or the full file + README + DECISIONS) at the start of a new conversation when you want to continue or regenerate work.

---

### System / Role Framing (paste first when starting a new chat)

You are helping build Galactic Calendar (project name: sp4cetime), a free zoomable infinite-canvas tool for creating and presenting complex timelines on a scientifically grounded helical solar-system path. The visual foundation is the Sun’s galactic motion as a straight central line through the middle of the viewport, with planets swirling/helixing around it.Key constraints and decisions (as of 30 Oct 2026):Primary domain: sp4cetime.org (ready for Cloudflare Pages). Parked: .com, .ai, .io, .store.
Default view: helix appears still; background grid moves backwards to create the illusion of travel through space.
Tech: React + TypeScript, React Konva, Zustand/Jotai, Tailwind, Next.js App Router, Supabase, Cloudflare Pages.
MVP focus: free tool + presentation mode; monetize later via theme/path marketplace.
Credit: inspired by https://x.com/Geosophyy/status/2115404526002041035

Current source-of-truth documents: README.md (full briefing) and DECISIONS.md (session log).


---

### Month-1 Prototype Core (helix + default motion)

Build a Month-1 prototype for Galactic Calendar / sp4cetime.Requirements:Infinite zoomable/pannable canvas (React Konva).
Sun and its galactic path rendered as a straight central line slicing through the middle of the window.
Planets and their paths swirling/helixing around that central axis (start with Earth + Moon; others optional).
Default view on load: the helix itself is still; a background grid continuously moves backwards, creating the illusion of the solar system traveling forward through space.
Drag-to-scrub time; galactic background rotation proportional to drag velocity (1 full rotation ≈ 1 galactic year ≈ 230 Myr).
Earth at real orbital position for the current date; Moon at real current phase (update on scrub).
Adaptive ticks.
3–4 visual schemes (Scientific Realistic, Minimalist Line Art, Synthwave Neon, plus one more).
Ready to deploy to Cloudflare Pages on sp4cetime.org.

Output: working Next.js App Router code structure, key components, helix math notes, and any TODOs for LOD/culling.


---

### Landing Page / About Copy

Write landing-page and about-page copy for Galactic Calendar (sp4cetime.org).Tone: clear, slightly poetic but grounded, scientifically inspired, not hypey.
Must include:Tagline: “Map any timeline on the path the solar system is already traveling.”
Credit/attribution to the originating X post by @Geosophyy
.
Short explanation of the central-line + swirling-planets visual and the moving background-grid illusion.
Primary CTA for the free tool / waitlist.
Brief mention of presentation/slideshow mode and future marketplace (without over-promising).

Also produce a short footer attribution line and 3–5 sample X posts for build-in-public.


---

### Example Presentation Path (seed content)

Create a detailed example presentation path for the Galactic Calendar marketplace seed content.Topic: [choose or ask — e.g. “History of computing”, “Geological epochs”, “A personal life timeline”, “Space exploration milestones”].
Requirements:8–15 key events with approximate dates.
Suggested camera path / zoom levels that show both the helical solar-system context and the event details.
Notes on when the background grid / galactic rotation should be more or less prominent.
How the path would feel in presentation / fly-through mode.
Output as structured data (JSON-like) plus a short narrative description.



---

### Theme / Visual Scheme Sketch

Design the data structure and visual parameters for one built-in theme for Galactic Calendar.Theme: [Scientific Realistic | Minimalist Line Art | Synthwave Neon | Painterly Watercolor | Cyberpunk Dark | Soft Pastel Ethereal | Geometric Abstract | Vintage Engraving | High Contrast Monochrome | Particle Luminous].Include:Color palette (background, grid, Sun path, planetary trails, labels, UI).
Helix / trail rendering style (line weight, glow, opacity, particle density if any).
Background grid appearance and animation speed feel.
How Earth and Moon are rendered at different zoom levels.
Any special effects that stay performant on an infinite canvas.

Output as a JSON theme definition plus a short visual description.


---

### Decisions / Status Update

Update DECISIONS.md for the current session.Summarize:What was decided or changed.
New status (domains, prototype, content, hosting, etc.).
Open items and next priorities.
Any adjustments to the visual or interaction model.

Keep the same concise, dated-session format already established.


---

### How to use this file

1. Copy the System / Role Framing block + the specific prompt you need.
2. Optionally attach or paste the latest README.md and DECISIONS.md.
3. Add any new constraints or the exact next priority at the end.
4. After the session, update this PROMPTS.md with any prompts that worked especially well or any new reusable ones that emerged.

