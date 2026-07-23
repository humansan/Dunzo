// Copies landing page files into dist/ so they're served by Vercel.
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist', 'landing');
const distAssets = path.join(dist, 'assets');

await mkdir(distAssets, { recursive: true });

// Landing page files
await cp(path.join(root, 'landing', 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(root, 'landing', 'style.css'), path.join(dist, 'style.css'));
await cp(path.join(root, 'landing', 'script.js'), path.join(dist, 'script.js'));

// App logo (used in nav/footer)
await cp(path.join(root, 'src', 'assets', 'icon-invert2.png'), path.join(distAssets, 'icon-invert2.png'));
await cp(path.join(root, 'src', 'assets', 'icon.svg'), path.join(distAssets, 'icon.svg'));

// Screenshots for mockups
const screenshotsSrc = path.join(root, 'src', 'assets', 'screenshots');
const screenshotsDest = path.join(distAssets, 'screenshots');
if (existsSync(screenshotsSrc)) {
  await mkdir(screenshotsDest, { recursive: true });
  await cp(screenshotsSrc, screenshotsDest, { recursive: true });
}

console.log('✓ Landing page copied to dist/landing/');
