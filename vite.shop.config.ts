// sp4cetime.store (ADR-0019): its own small site, built to dist-shop/ and served by the
// Worker in shop/worker.ts (wrangler.store.jsonc). Shares src/core with sp4cetime.org.
// @ts-expect-error Node's types are not installed (the app needs none); Vite runs this file in Node.
import { copyFileSync, mkdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** The town list and the icon come from the main site's public/ (one copy in the repo). */
const shared = ['places.json', 'favicon.svg'];
const sharedPublic = (): Plugin => ({
  name: 'sp4ce-shared-public',
  buildStart() {
    mkdirSync('shop/public', { recursive: true });
    for (const f of shared) copyFileSync(`public/${f}`, `shop/public/${f}`);
  },
});

export default defineConfig({
  root: 'shop',
  publicDir: 'public',
  plugins: [react(), sharedPublic()],
  build: { outDir: '../dist-shop', emptyOutDir: true, target: 'es2022', sourcemap: false },
  server: { port: 5174 },
});
