#!/usr/bin/env node
// Architectural import boundaries. Fails the build when a module imports across a
// layer it isn't allowed to, or reaches into a feature's internals.
//
// The layering, lowest to highest:
//
//   shared/ (repo root)   client + server contract. Imports nothing from src/.
//   src/common            feature-agnostic UI + hooks + utils. Knows nothing about Todos.
//   src/theme             styling tokens and recipes.
//   src/lib               transport, cache, auth, app-wide data.
//   src/features/*        product features. May import lower features only.
//   src/app               shell, router. Only routes/ and main.tsx may import it.
//   src/routes            thin route wiring. May import anything.
//
// Every documented exception is listed in EXCEPTIONS and printed as known debt.
// Run: node scripts/check-boundaries.mjs   (wired into `npm run lint`)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src');

// ── Policy ───────────────────────────────────────────────────────────────────

// Which feature may import which other features. Anything not listed is denied.
const FEATURE_DEPS = {
  tasks: [],                                            // the base domain
  trackers: [],
  stopwatch: [],
  auth: [],
  xp: ['tasks'],
  calendar: ['tasks'],
  planner: ['tasks'],
  settings: ['tasks'],
  stats: ['tasks', 'xp'],
  daily: ['tasks', 'calendar', 'planner', 'trackers', 'xp'],
};

// The only paths outside code may import a feature through. '' means the barrel.
const ENTRY_POINTS = {
  tasks: ['', 'model', 'api', 'fields', 'chips', 'collection-picker'],
  planner: ['', 'task-finder'],
  daily: ['', 'widgets'],
  trackers: ['', 'api'],
  xp: [''],
  stats: [''],
  stopwatch: [''],
  auth: [''],
  settings: [''],
  calendar: [''],
};

// Non-feature layers: which layers each may import.
const LAYER_DEPS = {
  common: ['common', 'theme', 'assets'],
  theme: ['theme', 'common', 'assets'],
  lib: ['lib', 'common', 'theme', 'assets'],
  app: null,     // may import anything
  routes: null,
  assets: ['assets'],
};

// Known, documented violations. Keyed by the importing file.
const EXCEPTIONS = {
  'lib/app-data.tsx': {
    allow: ['features/tasks', 'features/trackers'],
    why: 'aggregates every feature\'s queries; AppData type is derived from the provider. Fix: decompose into per-feature hooks.',
  },
  'theme/useThemeColor.ts': {
    allow: ['lib'],
    why: 'reads the active theme from useAppData(). Fix: pass the theme id in, or move theme state out of AppData.',
  },
  'features/tasks/chips/taskChips.tsx': {
    allow: ['features/planner'],
    why: 'the parent-task chip opens the planner\'s TaskFinder overlay. tasks and planner are mutually dependent.',
  },
};

// ── Walk ─────────────────────────────────────────────────────────────────────

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) yield p;
  }
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function imports(file) {
  const text = readFileSync(file, 'utf8');
  const out = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const line = text.slice(0, m.index).split('\n').length;
    out.push({ spec: m[1], line });
  }
  return out;
}

// 'features/planner' | 'common' | 'lib' | ...
const layerOf = (rel) => {
  const p = rel.split('/');
  return p[0] === 'features' ? `features/${p[1]}` : p[0];
};

const violations = [];
const usedExceptions = new Set();

function check(file) {
  const rel = relative(SRC, file).split(sep).join('/');
  const from = layerOf(rel);
  const exc = EXCEPTIONS[rel];

  for (const { spec, line } of imports(file)) {
    if (!spec.startsWith('@/')) continue;      // packages, relative, @shared/* are fine
    const target = spec.slice(2);
    const to = layerOf(target);
    if (to === from) continue;

    const allowedByException = exc?.allow.includes(to);
    if (allowedByException) usedExceptions.add(rel);

    const fail = (msg) => {
      if (!allowedByException) violations.push({ rel, line, msg });
    };

    // 1. Only main.tsx, routes/ and app/ itself may import app/.
    if (to === 'app' && from !== 'routes' && from !== 'app' && rel !== 'main.tsx') {
      fail(`${from} may not import @/app — the shell is the top layer`);
      continue;
    }

    // 2. Feature-to-feature edges follow FEATURE_DEPS.
    if (from.startsWith('features/') && to.startsWith('features/')) {
      const f = from.slice(9), t = to.slice(9);
      if (!(FEATURE_DEPS[f] ?? []).includes(t)) {
        fail(`feature '${f}' may not import feature '${t}'`);
        continue;
      }
    }

    // 3. Non-feature layers follow LAYER_DEPS.
    if (!from.startsWith('features/')) {
      const allowed = LAYER_DEPS[from];
      if (allowed && !allowed.includes(to)) {
        fail(`${from}/ may not import @/${target.split('/').slice(0, 2).join('/')}`);
        continue;
      }
    }

    // 4. Features may only be entered through a published entry point.
    if (to.startsWith('features/') && from !== to) {
      const name = to.slice(9);
      const sub = target.split('/').slice(2).join('/');
      const entries = ENTRY_POINTS[name];
      if (entries && !entries.includes(sub)) {
        const pretty = entries.map((e) => `@/features/${name}${e && '/' + e}`).join(', ');
        fail(`'@/${target}' reaches into ${name}'s internals — import from ${pretty}`);
      }
    }
  }
}

for (const f of walk(SRC)) check(f);

// 5. The root shared/ contract must never depend on the client tree.
for (const f of walk(join(ROOT, 'shared'))) {
  const rel = 'shared/' + relative(join(ROOT, 'shared'), f).split(sep).join('/');
  for (const { spec, line } of imports(f)) {
    if (spec.startsWith('@/') || spec.includes('src/')) {
      violations.push({ rel, line, msg: `shared/ may not import from src/ — it is the client+server contract` });
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (violations.length) {
  console.error('');
  for (const v of violations) console.error(`  ✗ src/${v.rel}:${v.line}\n      ${v.msg}`);
  console.error(`\n  ${violations.length} boundary violation${violations.length > 1 ? 's' : ''}\n`);
  console.error('  If the import is correct, the layering is wrong — fix the structure,');
  console.error('  or add a documented entry to EXCEPTIONS in scripts/check-boundaries.mjs.\n');
  process.exit(1);
}

const stale = Object.keys(EXCEPTIONS).filter((k) => !usedExceptions.has(k));
if (stale.length) {
  console.error('\n  Stale EXCEPTIONS in scripts/check-boundaries.mjs (no longer needed — delete them):');
  for (const s of stale) console.error(`    - ${s}`);
  console.error('');
  process.exit(1);
}

console.log(`  boundaries ok — ${Object.keys(EXCEPTIONS).length} documented exceptions:`);
for (const [file, { why }] of Object.entries(EXCEPTIONS)) {
  console.log(`    src/${file}\n      ${why}`);
}
