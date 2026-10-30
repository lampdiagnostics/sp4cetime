# DECISIONS.md — Galactic Calendar / sp4cetime
## Session Progress Log

This file records key decisions, status updates, and progress from session to session.

---

### Session: 30 October 2026

**Status updates:**
- Domains secured and ready: Primary domain **sp4cetime.org** is prepared for deployment of the first working prototype on Cloudflare Pages. Parked domains: sp4cetime.com, sp4cetime.ai, sp4cetime.io, sp4cetime.store.
- Hosting path confirmed: Cloudflare Pages (not GoDaddy). DNS ready to point; GitHub auto-deploy planned.

**Visual & interaction decisions (updated from reference artwork):**
- On-screen representation: The Sun and its galactic path form a **straight central line** that slices through the middle of the viewport. Planets and their orbital/helical paths swirl around this central axis (matching the provided artwork.png reference).
- Default view on app open: The helix/spiral appears **still**. A background grid continuously moves **backwards** over the helix, creating the persistent illusion that the solar system is traveling forward through space.
- This default motion illusion is independent of user scrubbing; scrubbing still drives galactic rotation and time changes as previously specified.
- Earth remains at real orbital position for the current date; Moon at real phase. Both update on scrub.

**Architecture notes for prototype:**
- Prioritize rendering the central Sun path + swirling planetary helices with visible-range culling and basic LOD.
- Implement the animated background grid as part of the default (non-scrubbed) state.
- First prototype target: deployable to Cloudflare Pages on sp4cetime.org.

**Next priorities:**
1. Set up Cloudflare Pages project + GitHub connection for sp4cetime.org.
2. Implement Month-1 prototype core: infinite canvas, parametric helix (central line + swirling planets), default background grid animation, drag-to-scrub, 3–4 visual schemes.
3. Seed 3–5 example presentation paths.
4. Begin build-in-public and waitlist.

**Open items carried forward:**
- Full solar-lifetime range (± ~5 Byr) with performance.
- Theme system and marketplace data model.
- Attribution to original X post (@Geosophyy) on about/footer.
- Credit and link preserved in documentation.

---

*Previous sessions (summary through 28 October 2026):*  
See the main README.md for the full evolution, product definition, tech stack, roadmap, and original decisions. This DECISIONS.md is the living session-by-session record going forward.