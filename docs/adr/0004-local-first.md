# ADR-0004: Local-first storage; no backend before Phase 5

Status: accepted · 2026-10-30 · supersedes Supabase-from-Month-4 in the original briefing

## Context

One part-time developer. Accounts, auth and a database are the most expensive features to build and maintain, and educators may store student data in timelines.

## Decision

- Timelines save to the browser (IndexedDB) and export/import as versioned `.sp4ce.json` files.
- Shareable read-only links (Phase 5) store JSON in a Cloudflare R2 bucket.
- Accounts and cloud sync move to year two unless beta users ask for them.

## Consequences

- No personal data on our servers: a privacy selling point.
- Users can lose data by clearing browser storage; the app must make export obvious.
