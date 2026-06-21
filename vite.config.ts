import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import svgr from "vite-plugin-svgr";

export default defineConfig({
  plugins: [react(), tailwindcss(), svgr()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
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
