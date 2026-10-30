/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pre-bundle Three.js when the dev server starts. Otherwise it is first seen
  // when Fly mode opens, and re-bundling mid-session can stall that load.
  optimizeDeps: {
    include: ['three'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Fly mode (Three.js) is a separate, on-demand chunk with its own budget in CI.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
