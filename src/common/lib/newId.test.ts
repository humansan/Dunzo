// Unit checks for newId. No test runner is wired up, so this self-asserts and is
// run directly:  npx tsx src/common/lib/newId.test.ts
//
// The fallback branch is the reason this file exists. `crypto.randomUUID` is
// [SecureContext], so the fallback only ever runs when the app is opened over plain
// HTTP from another device on the LAN - which is exactly the path nobody manually
// tests. Both branches are asserted to produce the same shape here.
import { newId } from './newId';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Run the whole suite against whichever branch is active, so it can be repeated
// with randomUUID stubbed out.
function suite(label: string) {
  const N = 100_000;
  const ids = new Set<string>();
  let badShape: string | null = null;
  let shortest = Infinity;
  for (let i = 0; i < N; i++) {
    const id = newId();
    if (badShape === null && !V4.test(id)) badShape = id;
    shortest = Math.min(shortest, id.length);
    ids.add(id);
  }
  check(`${label}: ${N} ids are all unique`, ids.size === N);
  check(`${label}: every id is a well-formed v4 UUID`, badShape === null);
  if (badShape !== null) console.log(`        first bad shape: ${JSON.stringify(badShape)}`);
  // The specific defect of the old generator: `substr` didn't pad, so a small draw
  // could yield a 1-3 char id. Nothing here may ever be shorter than 36.
  check(`${label}: no id shorter than 36 chars (min seen ${shortest})`, shortest === 36);
}

const native = globalThis.crypto?.randomUUID;
check('crypto.randomUUID is available in this environment', typeof native === 'function');
suite('native');

// Force the fallback: delete randomUUID and confirm getRandomValues carries it.
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: undefined,
  configurable: true,
  writable: true,
});
check('randomUUID successfully stubbed out', typeof globalThis.crypto.randomUUID !== 'function');
suite('fallback');

// Restore, so nothing downstream of this file sees a crippled crypto.
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: native,
  configurable: true,
  writable: true,
});
check('native randomUUID restored', globalThis.crypto.randomUUID === native);

console.log(failures === 0 ? '\nAll newId checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
