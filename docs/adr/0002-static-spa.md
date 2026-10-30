# ADR-0002: Static single-page app (Vite + React), not Next.js

Status: accepted · 2026-10-30 · supersedes the Next.js App Router choice in the original briefing

## Context

The product is one interactive canvas plus some UI. It needs no server rendering and, until accounts exist, no server at all. Next.js on Cloudflare needs an adapter layer and adds build and runtime complexity.

## Decision

Vite + React + TypeScript, built to static files in `dist/`, served by Cloudflare (static assets, SPA fallback). No Workers, D1 or KV until a feature needs them.

## Consequences

- Deploys are a file upload; hosting is free at expected traffic.
- A marketing/landing page, if separate, is plain HTML in the same build.
- Revisit when shareable links or accounts arrive (Phase 5): add one Worker or R2 bucket, not a framework.
