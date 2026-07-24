import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import svgr from "vite-plugin-svgr";

export default defineConfig({
  // The app is served under /app (the marketing site owns the domain root).
  // `base` prefixes every built asset URL; `outDir` puts the build where those
  // URLs physically resolve (dist/app/* served at /app/*). See website plan §9.
  base: '/app/',
  build: { outDir: 'dist/app' },
  plugins: [
    // Must run before react() - it generates src/routeTree.gen.ts from src/routes.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    svgr(),
  ],
  resolve: {
    alias: {
      // Order matters: '@shared' must precede '@' or the shorter prefix wins.
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // Disable HMR/file-watching when DISABLE_HMR=true (e.g. during agent edits).
    hmr: process.env.DISABLE_HMR !== 'true',
    // Proxy API calls to the Express backend so the SPA talks to same-origin /api.
    proxy: {
      '/api': `http://localhost:${process.env.PORT || 8787}`,
    },
  },
});
