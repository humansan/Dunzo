/**
 * Renders every marketing route to a static HTML file, after `vite build`.
 *
 * Why: the site is a client-rendered SPA, so the shipped HTML is an empty <div id="root">.
 * Google renders JS eventually; Bing does so unreliably and GPTBot / PerplexityBot /
 * ClaudeBot largely not at all. Baking the markup in also gives each route its own
 * <title>, description and canonical, which a single shared index.html cannot.
 *
 * No headless browser is involved — the app is SSR-safe (see entry-server.tsx), so this
 * is react-dom/server plus string substitution against the template Vite just emitted.
 *
 * Adding a route: add it to HEADS in src/seo.ts AND to ROUTES below. vercel.json no
 * longer has an SPA catch-all, so a route missing from ROUTES 404s in production while
 * working fine in `vite dev`.
 *
 * See docs/seo/SEO_IMPLEMENTATION_PLAN.md phase 2.
 */
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const SSR_OUT = path.resolve(__dirname, '.ssr');

/** Route → output path relative to dist/. Keys must exist in HEADS. */
const ROUTES = {
  '/': 'index.html',
  '/features': 'features/index.html',
  // Vercel serves this with a real 404 status for anything not on disk.
  '/404': '404.html',
};

/* 1 ─ SSR bundle. outDir/emptyOutDir are overridden because vite.config.ts points them
 *     at ../dist with emptyOutDir:true — inheriting that would delete the client build
 *     this script is about to read. copyPublicDir:false for the same reason. */
await build({
  build: {
    ssr: 'src/entry-server.tsx',
    outDir: SSR_OUT,
    emptyOutDir: true,
    copyPublicDir: false,
    minify: false,
  },
  logLevel: 'warn',
});

// Windows rejects bare absolute paths in dynamic import(); it needs a file:// URL.
const { render, HEADS, canonicalFor } = await import(
  pathToFileURL(path.join(SSR_OUT, 'entry-server.js')).href
);

/* 2 ─ The client build's index.html is the template: it already carries the hashed
 *     script/style tags, the font preconnects, the OG defaults and the JSON-LD. */
const templatePath = path.join(DIST, 'index.html');
if (!fs.existsSync(templatePath)) {
  throw new Error(`prerender: ${templatePath} not found — run vite build first.`);
}
const template = fs.readFileSync(templatePath, 'utf8');

/** Escape for use inside a double-quoted HTML attribute. */
const attr = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Replace a single tag matched by `re`. Uses a function replacement throughout: the
 * rendered markup and the titles contain `&` and `$`, which are special in a string
 * replacement argument and would otherwise corrupt the output silently.
 */
const sub = (html, re, replacement) => {
  if (!re.test(html)) throw new Error(`prerender: template has no match for ${re}`);
  return html.replace(re, () => replacement);
};

for (const [route, outFile] of Object.entries(ROUTES)) {
  const head = HEADS[route];
  if (!head) throw new Error(`prerender: no HEADS entry for "${route}" (see src/seo.ts)`);

  const canonical = canonicalFor(head);
  const title = attr(head.title);
  const description = attr(head.description);

  let html = template;
  html = sub(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = sub(
    html,
    /<meta name="description" content="[\s\S]*?" \/>/,
    `<meta name="description" content="${description}" />`,
  );
  html = sub(
    html,
    /<link rel="canonical" href="[\s\S]*?" \/>/,
    `<link rel="canonical" href="${canonical}" />`,
  );
  html = sub(
    html,
    /<meta property="og:url" content="[\s\S]*?" \/>/,
    `<meta property="og:url" content="${canonical}" />`,
  );
  html = sub(
    html,
    /<meta property="og:title" content="[\s\S]*?" \/>/,
    `<meta property="og:title" content="${title}" />`,
  );
  html = sub(
    html,
    /<meta property="og:description" content="[\s\S]*?" \/>/,
    `<meta property="og:description" content="${description}" />`,
  );
  html = sub(
    html,
    /<meta name="twitter:title" content="[\s\S]*?" \/>/,
    `<meta name="twitter:title" content="${title}" />`,
  );
  html = sub(
    html,
    /<meta name="twitter:description" content="[\s\S]*?" \/>/,
    `<meta name="twitter:description" content="${description}" />`,
  );

  // Google reads WebSite/Organization from the domain root only; on any other route it
  // is noise, so the block marked data-root-only is stripped everywhere but "/". The
  // unmarked SoftwareApplication block describes the product and stays on every route.
  if (route !== '/') {
    const rootOnly = /\s*<script type="application\/ld\+json" data-root-only>[\s\S]*?<\/script>/;
    if (!rootOnly.test(html)) {
      throw new Error('prerender: data-root-only JSON-LD block not found — see index.html');
    }
    html = html.replace(rootOnly, '');
  }

  if (head.noindex) {
    html = sub(html, /<\/head>/, '  <meta name="robots" content="noindex" />\n  </head>');
  }

  html = sub(html, /<div id="root"><\/div>/, `<div id="root">${render(route)}</div>`);

  const dest = path.join(DIST, outFile);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  console.log(`prerendered ${route.padEnd(10)} → dist/${outFile}  (${(html.length / 1024).toFixed(1)} kB)`);
}

fs.rmSync(SSR_OUT, { recursive: true, force: true });
