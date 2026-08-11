/**
 * Converts the marketing site's screenshots to WebP.
 *
 * Run manually, not from the build: the inputs change only when screenshots are
 * retaken, and re-encoding 50 MB of PNG on every deploy would be pure waste. The .webp
 * outputs are committed alongside the code that references them.
 *
 *   node scripts/optimize-media.mjs            # write .webp next to each source
 *   node scripts/optimize-media.mjs --prune    # then delete sources that have a .webp
 *   node scripts/optimize-media.mjs --dry-run  # report what would happen, touch nothing
 *
 * Settings were calibrated against s5_crop.png (the densest table text on the site):
 * at width 2048 / quality 80 the UI text is indistinguishable from the PNG at 1:1, and
 * the worst offender (s16.png) drops from 8.3 MB to ~416 kB.
 *
 * 2048px is deliberate, not arbitrary: the widest layout slot is max-w-5xl (1024 CSS
 * px), so 2048 is exactly what a 2x display consumes. Anything above that is invisible.
 *
 * See docs/seo/SEO_IMPLEMENTATION_PLAN.md phase 3.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'website2/public');

const MAX_WIDTH = 2048;
const QUALITY = 90;

const PRUNE = process.argv.includes('--prune');
const DRY = process.argv.includes('--dry-run');

/**
 * Never convert these. Every one is consumed by something that does not negotiate
 * content type the way an <img> does:
 *   og.png            — link-preview scrapers; many still have no WebP support at all
 *   logo.png          — <img> in the navbar/footer, but also the OG-image fallback source
 *   favicon-*, icon-* — favicons; browser and crawler support for WebP icons is uneven
 */
const KEEP = /^(og|logo|favicon-\d+|icon-\d+|apple-touch-icon)\.png$/i;

/** Everything under media/, plus the hero backdrop that sits at the public root. */
const targets = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(png|jpe?g)$/i.test(e.name) && !KEEP.test(e.name)) targets.push(full);
  }
};
walk(path.join(PUBLIC, 'media'));
targets.push(path.join(PUBLIC, 'background.jpg'));

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' kB';

let before = 0;
let after = 0;
let converted = 0;
let skipped = 0;

for (const src of targets) {
  const dest = src.replace(/\.(png|jpe?g)$/i, '.webp');
  const srcSize = fs.statSync(src).size;
  before += srcSize;

  // Idempotent: leave alone anything already converted from an unchanged source.
  if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) {
    after += fs.statSync(dest).size;
    skipped++;
    continue;
  }

  const buf = await sharp(src)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toBuffer();

  if (!DRY) fs.writeFileSync(dest, buf);
  after += buf.length;
  converted++;
  console.log(
    `${DRY ? 'would write' : 'wrote'}  ${kb(srcSize)} → ${kb(buf.length)}  ` +
      `(-${Math.round((1 - buf.length / srcSize) * 100)}%)  ${rel(dest)}`,
  );
}

console.log(
  `\n${converted} converted, ${skipped} already current` +
    `\n${(before / 1024 / 1024).toFixed(1)} MB → ${(after / 1024 / 1024).toFixed(1)} MB` +
    `  (-${Math.round((1 - after / before) * 100)}%)`,
);

/* --prune is a separate pass, and separate on purpose: convert, eyeball the site, then
 * delete. The sources are committed, so `git checkout` brings them back either way. */
if (PRUNE) {
  let freed = 0;
  let removed = 0;
  for (const src of targets) {
    const dest = src.replace(/\.(png|jpe?g)$/i, '.webp');
    if (!fs.existsSync(dest)) {
      console.warn(`kept (no .webp): ${rel(src)}`);
      continue;
    }
    freed += fs.statSync(src).size;
    removed++;
    if (!DRY) fs.rmSync(src);
  }
  console.log(`\n${DRY ? 'would delete' : 'deleted'} ${removed} source files, freeing ${(freed / 1024 / 1024).toFixed(1)} MB`);
}
