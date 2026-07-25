import { defineConfig } from 'astro/config';

// The marketing site owns the domain root and builds into the SAME dist/ that the
// app builds into, one level up: dist/landing/* is served at / and dist/app/* at
// /app/* (see vercel.json rewrites + vite.config.ts `base`). Astro only cleans its
// own outDir, so this does not disturb the app build that runs before it.
//
// `format: 'directory'` emits /features/index.html rather than /features.html, which
// is what the vercel.json rewrites target.
export default defineConfig({
  outDir: '../dist/landing',
  build: { format: 'directory' },
  // TODO(phase 7): set `site` to the production origin so canonical URLs and
  // sitemap.xml resolve absolutely.
});
