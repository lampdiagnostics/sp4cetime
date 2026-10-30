# sp4cetime: The Galactic Calendar — Complete Project Briefing
## Status as of 30 October 2026

This document captures the full conversation history, decisions, specifications, and progress to date. It is intended as a self-contained handoff so a new conversation can continue from this exact point.

**Domain readiness:** sp4cetime.org is the primary domain and is ready for deployment of the first working prototype on Cloudflare Pages. The following domains are parked and pointed as needed: sp4cetime.com, sp4cetime.ai, sp4cetime.io, and sp4cetime.store.

---

### Origin

The idea was triggered by this X post:  
https://x.com/Geosophyy/status/2115404526002041035  

The post illustrated the Sun’s motion through the galaxy (~230 km/s) and Earth’s resulting helical path. The concept evolved from a pure visualization into a multi-scale zoomable canvas that uses that helix as the foundation for timelines and presentations.

**Credit:** Concept inspired by the galactic motion visualization shared by [@Geosophyy](https://x.com/Geosophyy/status/2115404526002041035). Include this attribution on the about page / landing footer.

---

### Evolution of the Idea (Conversation Summary)

1. Initial concept: zoomable calendar with helical solar-system art in the background, skewed to show Earth’s seasonal and daily cycles.
2. Request for a full project specification (.md), tech stack, go-to-market plan, and 10 sample X posts.
3. Major expansion:
   - Renamed **Galactic Calendar**.
   - Timeline scope = entire estimated main-sequence lifetime of the Sun (~4.6 Byr past to ~5 Byr future).
   - Default view centers on “today”.
   - Earth rendered at its real orbital position for the current date.
   - Moon rendered at its real current phase.
   - Timeline can be grabbed and dragged to scrub time; galactic map spins proportionally to drag speed (1 full rotation ≈ 1 galactic year ≈ 230 Myr).
   - 10 distinct visual schemes with demos, plus full support for user-created custom aesthetics/themes.
4. MVP repositioning: primarily a tool for describing complex timelines and creating custom paths that can be displayed in a Prezi-like slideshow/presentation mode, rather than a personal daily calendar. A light artistic calendar background mode remains a possible later feature.
5. Monetization refined to a **free core tool + paid content marketplace** model.
6. Hosting recommendation: Cloudflare Pages (not GoDaddy). Domain transfer / DNS setup added to the to-do list.
7. Visual reference refined from provided artwork: Sun and its galactic path form a straight central line through the middle of the viewport; planets and their orbital/helical paths swirl around this central axis.

---

### Current Product Definition

**Name:** Galactic Calendar (project: sp4cetime)  
**Tagline:** Map any timeline on the path the solar system is already traveling.  

**Primary use case (MVP):**  
Free zoomable infinite-canvas tool for creating and presenting complex timelines (Prezi-like guided navigation) on a scientifically grounded helical solar-system path. Users place events, build custom paths, and play them as guided fly-throughs.

**Secondary / later use case:**  
Light artistic background layer behind a usable personal calendar, or living wallpaper mode.

**Core visual and interaction principles:**
- Infinite zoomable/pannable canvas.
- Central horizontal path = solar system’s galactic motion, rendered as a straight central line slicing through the middle of the window (Sun and its path).
- Planets and their paths swirl/helix around this central axis (as shown in the reference artwork).
- Continuous helical rendering of Earth (and optional other bodies) with adaptive level-of-detail (LOD).
- Semantic zoom: centuries/galactic scales show broad coils; year/month scales show clear orbits and seasons; day/hour scales show rotation and day/night.
- Full solar-lifetime range (± ~5 billion years).
- Today is centered by default.
- Earth shown at its real orbital position for the current date; Moon shown at its real current phase. Both update when scrubbing.
- **Default view on app open:** The spiral/helix appears still (Sun path as central line, planets swirling around it). A background grid moves backwards over the helix, creating the continuous illusion of the solar system moving forward through space.
- Drag-to-scrub timeline; galactic map background rotates proportionally with drag velocity.
- 10 built-in visual schemes + user-created and shareable custom aesthetics (palettes, helix parameters, labeling style, Earth/Moon rendering, background treatment).
- Presentation / slideshow mode: guided or auto-advancing fly-through along a user-defined path, with proportional galactic rotation.
- Adaptive tick marks (years by default; centuries at extreme zoom-out; minutes at extreme zoom-in).

**10 built-in visual schemes (for reference):**
Scientific Realistic, Minimalist Line Art, Synthwave Neon, Painterly Watercolor, Cyberpunk Dark, Soft Pastel Ethereal, Geometric Abstract, Vintage Engraving, High Contrast Monochrome, Particle Luminous.

**Marketplace model (primary monetization):**
- Core canvas, basic schemes, personal timeline creation, and presentation mode are free.
- Revenue from paid content: premium theme packs, curated high-quality timeline paths, presentation-ready sequences.
- Later: user-created and sold themes/paths with revenue share.
- Seed marketplace with official content (the 10 schemes + 5–10 example paths).

**Explicit non-goals for first 6 months:**
- Full bidirectional calendar sync as the main product.
- Real-time multi-user collaboration.
- Native mobile apps (responsive web / PWA first).
- Heavy project-management features (dependencies, Gantt, resource loading).

---

### Tech Stack

- **Frontend:** React + TypeScript, React Konva (or Konva.js) for the infinite canvas, Zustand/Jotai, Tailwind CSS, Next.js (App Router).
- **Backend:** Supabase (Postgres + Auth + Storage) for users, saved timelines, themes, media, and marketplace.
- **Rendering:** Custom parametric helix with visible-range culling and LOD. Theme system is data-driven. Default view includes animated background grid for motion illusion.
- **Hosting:** Cloudflare Pages (recommended and ready). Free tier supports commercial use and has unlimited static bandwidth. Primary domain sp4cetime.org ready for connection.
- **Other:** PWA, PostHog or Plausible, Sentry, Stripe for content purchases.

**Key architecture notes:**
- World x-axis = time (or galactic distance). Screen transform = scale + offset.
- Visible-range culling + LOD on every view change.
- Events and paths on a separate layer.
- Galactic map rotation driven by the same time coordinate used for scrubbing.
- Marketplace content stored as structured data + assets and applied at load time.
- Default animation: background grid translates opposite to galactic motion direction.

---

### 6-Month Roadmap (Aggressive but Focused)

- **Month 1:** Core infinite canvas, parametric helix (central Sun path + swirling planets), adaptive ticks, basic Earth/Moon, drag-scrub + galactic rotation, default background grid animation, 3–4 schemes. First prototype deployable to Cloudflare Pages on sp4cetime.org.
- **Month 2:** Event creation/editing, custom path grouping, first presentation mode, theme system skeleton.
- **Month 3:** Remaining schemes, full LOD, performance across ±5 Byr, basic theme editor, marketplace data model.
- **Month 4:** Presentation polish, shareable links, auth + cloud save, landing page, first official premium paths/theme packs.
- **Month 5:** Closed beta, marketplace purchase flow (Stripe), analytics, soft launch prep.
- **Month 6:** Public web/PWA launch with free tool + seeded marketplace. Product Hunt and other launch platforms.

---

### Business Plan Highlights

**Problem:** Existing timeline and presentation tools lack a continuous, scientifically grounded visual metaphor and true multi-scale navigation. Calendar apps are functional but visually ordinary.

**Solution:** Free helical canvas for complex timelines and Prezi-like presentations. Monetize via premium content marketplace.

**Target users:** Educators, historians, researchers, storytellers, presenters, designers, and content creators.

**Monetization:**
- Free tool for acquisition.
- One-time purchases of theme packs and curated paths ($5–19 typical; larger bundles $29–49).
- Creator marketplace with revenue share later.
- Optional early lifetime content bundle.

**Estimated costs (6 months, lean):**
- AI/tooling subscriptions: ~$50–300 total.
- Domain + incidental: ~$10–50.
- Most cost is time, not cash. Hosting and Supabase stay free or very low until scale.

**Key metrics:** Timelines created/presented, WAU, content purchase conversion, marketplace GMV, 30/90-day retention.

---

### Hosting & Domain Recommendation

Do **not** use GoDaddy shared hosting or Website Builder.  
**Recommended and ready:** Primary domain sp4cetime.org (with .com, .ai, .io, .store parked). Register/transfer domains at Cloudflare Registrar if not already done, point DNS to Cloudflare Pages, connect GitHub for auto-deploy. This is free at expected early traffic levels and significantly better performance than GoDaddy. First working prototype is ready for deployment.

---

### Immediate Next Steps / To Do

1. Finalize name and secure domain — **DONE**: sp4cetime.org primary; others parked.
2. Transfer or point sp4cetime.org (and related domains) DNS to Cloudflare Pages — ready for connection.
3. Set up Cloudflare Pages project connected to GitHub for auto-deploy of the first prototype.
4. Build Month-1 prototype (helix with central Sun path + swirling planets + default background grid motion illusion + drag-scrub + 3 schemes).
5. Create 3–5 example presentation paths for the landing page and marketplace seed.
6. Open waitlist and begin build-in-public posts.
7. Validate presentation mode with 8–10 target users before Month 4.
8. Implement basic marketplace purchase flow (Stripe) by Month 5.
9. Credit the originating X post in the about page / landing footer.
10. Deploy first working prototype to sp4cetime.org on Cloudflare Pages.

---

### How to Continue in a New Conversation

Paste this entire document at the start of the new chat and say something like:

“Continue from this project briefing for Galactic Calendar. Current status is the complete specification above. Next priority is [whatever you want — e.g., Month-1 prototype details, landing page copy, first example path, etc.].”

This document is the single source of truth for all decisions made through 30 October 2026.