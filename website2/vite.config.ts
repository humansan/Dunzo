import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  // The marketing site owns the domain root, so it builds into the SAME dist/ the
  // app builds into, one level up: dist/* is served at / and dist/app/* at /app/*
  // (see ../vercel.json rewrites + ../vite.config.ts `base`). This build runs FIRST
  // in the root `npm run build` chain because emptyOutDir wipes dist/ wholesale -
  // the app build that follows writes dist/app afterwards.
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
