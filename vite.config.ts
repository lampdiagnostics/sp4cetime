/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
