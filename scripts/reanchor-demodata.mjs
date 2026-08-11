// Re-anchors an exported demo-data JSON onto a new "today".
//
// The demo set in docs/ was authored relative to a fixed day (2026-07-28), so
// every run of the video demo drifts further into the past: tasks land in
// yesterday's list, the Planner shows nothing due, countdowns read negative.
// This shifts every date in the file by a whole number of days so the anchor
// day becomes today, and every other day keeps its distance from it. July 29
// lands on tomorrow, July 27 on yesterday, and so on.
//
//   node scripts/reanchor-demodata.mjs docs/dunzo-demodata-2026-08-03.json
//   node scripts/reanchor-demodata.mjs <file> --dry-run
//   node scripts/reanchor-demodata.mjs <file> --anchor 2026-07-28 --to 2026-09-01
//   node scripts/reanchor-demodata.mjs <file> --in-place
//   node scripts/reanchor-demodata.mjs <file> --snap-weekday
//
// By default it writes a sibling file with the trailing -YYYY-MM-DD in the name
// replaced by the target day, so docs/dunzo-demodata-2026-08-10.json is "the
// demo data for the 10th". The input is never modified unless --in-place.
//
// What gets shifted, by value shape rather than by a hardcoded field list, so a
// schema change doesn't silently leave dates behind:
//   - "YYYY-MM-DD" strings          (todo startDate / dueDate)
//   - ISO 8601 timestamp strings    (tracker startDate / endDate, exportedAt)
//   - numbers under an *At key      (createdAt, completedAt, updatedAt, …)
// Timestamps move by wall-clock days, not by 86_400_000 ms, so a task created
// at 09:30 stays at 09:30 even if the shift crosses a DST boundary.
//
// Anything else is copied through untouched. Date-like text inside notes is
// reported at the end but left alone - it needs a human to reword.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// The day the demo set was written around: the "today" its author had in mind.
const DEFAULT_ANCHOR = '2026-07-28';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
// Epoch-ms fields are named *At throughout the export. Guarded by a magnitude
// check so a small number that happens to sit under such a key is left alone.
const TIMESTAMP_KEY = /At$/;
const PLAUSIBLE_EPOCH_MS = 1e12; // ~2001-09-09; anything below isn't a ms timestamp
// Loose enough to catch "8/14", "Aug 14" and bare weekdays in free text.
const DATEISH_TEXT =
  /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/i;

// ---------------------------------------------------------------- date helpers

const pad = (n) => String(n).padStart(2, '0');

const toDateOnly = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Midnight UTC for a YYYY-MM-DD string - a stable integer for day arithmetic. */
function dayNumber(dateOnly) {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function shiftDateOnly(dateOnly, days) {
  const d = new Date((dayNumber(dateOnly) + days) * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Moves an instant by whole local days, preserving its wall-clock time. */
function shiftInstant(ms, days) {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

// ------------------------------------------------------------------ arguments

function parseArgs(argv) {
  const opts = { dryRun: false, inPlace: false, snapWeekday: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--in-place') opts.inPlace = true;
    else if (arg === '--snap-weekday') opts.snapWeekday = true;
    else if (arg === '--anchor') opts.anchor = argv[++i];
    else if (arg === '--to') opts.to = argv[++i];
    else if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('-')) fail(`Unknown option ${arg}`);
    else rest.push(arg);
  }
  opts.input = rest[0];
  return opts;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help || !opts.input) {
  console.log(
    [
      'Usage: node scripts/reanchor-demodata.mjs <file.json> [options]',
      '',
      `  --anchor <YYYY-MM-DD>  day the data was written around (default ${DEFAULT_ANCHOR})`,
      '  --to <YYYY-MM-DD>      day the anchor should land on (default: today)',
      '  --out <path>           output file (default: sibling named for the target day)',
      '  --in-place             overwrite the input file',
      '  --snap-weekday         round the shift to whole weeks so weekdays line up',
      '  --dry-run              report the shift without writing anything',
    ].join('\n')
  );
  process.exit(opts.help ? 0 : 1);
}

const anchor = opts.anchor ?? DEFAULT_ANCHOR;
const target = opts.to ?? toDateOnly(new Date());

for (const [name, value] of [
  ['--anchor', anchor],
  ['--to', target],
]) {
  if (!DATE_ONLY.test(value) || Number.isNaN(dayNumber(value))) {
    fail(`${name} must be a YYYY-MM-DD date, got "${value}"`);
  }
}

let deltaDays = dayNumber(target) - dayNumber(anchor);
// Whole weeks keep every task on the weekday it was authored for - worth it
// when the demo shows a calendar, or when notes say things like "due Thursday".
if (opts.snapWeekday) deltaDays = Math.ceil(deltaDays / 7) * 7;
const effectiveTarget = shiftDateOnly(anchor, deltaDays);

// -------------------------------------------------------------------- rewrite

const raw = readFileSync(opts.input, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  fail(`${opts.input} is not valid JSON: ${err.message}`);
}

const counts = new Map(); // "todos[].dueDate" -> number of values shifted
const textHits = []; // free text that mentions a date we can't safely rewrite
let min = null;
let max = null;

function note(path) {
  counts.set(path, (counts.get(path) ?? 0) + 1);
}

function track(dateOnly) {
  if (min === null || dateOnly < min) min = dateOnly;
  if (max === null || dateOnly > max) max = dateOnly;
}

function rewrite(value, key, path) {
  if (Array.isArray(value)) return value.map((v) => rewrite(v, key, `${path}[]`));

  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewrite(v, k, `${path}.${k}`);
    return out;
  }

  if (typeof value === 'string') {
    if (DATE_ONLY.test(value)) {
      note(path);
      track(value);
      return shiftDateOnly(value, deltaDays);
    }
    if (ISO_INSTANT.test(value)) {
      note(path);
      track(value.slice(0, 10));
      return new Date(shiftInstant(Date.parse(value), deltaDays)).toISOString();
    }
    if (DATEISH_TEXT.test(value)) textHits.push({ path, value });
    return value;
  }

  if (typeof value === 'number' && TIMESTAMP_KEY.test(key ?? '') && value >= PLAUSIBLE_EPOCH_MS) {
    note(path);
    track(toDateOnly(new Date(value)));
    return shiftInstant(value, deltaDays);
  }

  return value;
}

const shifted = rewrite(data, null, '');

// ---------------------------------------------------------------------- report

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

console.log(`${opts.input}`);
console.log(
  `  ${anchor} -> ${effectiveTarget}  (${deltaDays >= 0 ? '+' : ''}${plural(deltaDays, 'day')}${
    opts.snapWeekday ? `, snapped to ${plural(deltaDays / 7, 'week')}` : ''
  })`
);
if (opts.snapWeekday && effectiveTarget !== target) {
  console.log(`  note: --snap-weekday moved the landing day off ${target}`);
}
if (min !== null) {
  console.log(
    `  span ${min} … ${max}  ->  ${shiftDateOnly(min, deltaDays)} … ${shiftDateOnly(max, deltaDays)}`
  );
}

const total = [...counts.values()].reduce((a, b) => a + b, 0);
console.log(`  ${plural(total, 'value')} shifted:`);
for (const [path, n] of [...counts].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${path.replace(/^\./, '')}`);
}

if (textHits.length > 0) {
  console.log(`\n  ${plural(textHits.length, 'text field')} mention a date - left unchanged:`);
  for (const { path, value } of textHits) {
    console.log(`    ${path.replace(/^\./, '')}: ${JSON.stringify(value)}`);
  }
}

if (deltaDays === 0) {
  console.log('\nAlready anchored on the target day; nothing to change.');
  process.exit(0);
}

if (opts.dryRun) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

// Default name: the trailing -YYYY-MM-DD becomes the day this set now plays as,
// so the file for today's recording is the one named for today.
function defaultOutPath(input, day) {
  const name = basename(input);
  const renamed = name.match(/^(.*)-\d{4}-\d{2}-\d{2}(\.json)$/i)
    ? name.replace(/-\d{4}-\d{2}-\d{2}(\.json)$/i, `-${day}$1`)
    : name.replace(/(\.json)$/i, `-${day}$1`);
  return join(dirname(input), renamed);
}

const outPath = opts.inPlace ? opts.input : (opts.out ?? defaultOutPath(opts.input, effectiveTarget));

// Match the export's own formatting so the two files diff cleanly.
writeFileSync(outPath, `${JSON.stringify(shifted, null, 2)}\n`, 'utf8');
console.log(`\nWrote ${outPath}`);
