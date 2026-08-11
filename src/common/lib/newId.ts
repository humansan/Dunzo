// The one place an entity id is minted. Every todo, collection, workspace and
// tracker id comes from here - ids are generated client-side so the UI can insert
// optimistically, and the server requires one on every create (it never invents its
// own).
//
// This replaced seven copies of `Math.random().toString(36).substr(2, 9)`, which had
// two problems. `substr` doesn't pad, and `toString(36)` drops trailing zeros, so a
// small draw produced a very short id - `0.5` becomes `"0.i"` becomes a ONE-character
// id. And `Math.random()` is not a CSPRNG and makes no uniqueness promise at all. The
// nominal 36^9 space was never the real distribution.
//
// Ids only have to be unique within one account (the DB keys rows on
// `(user_id, id)` - see shared/db/schema.ts), so a v4 UUID is far more than enough.
// Old 9-char ids stay valid and are not backfilled: the columns are `text`, and
// nothing in the app parses, measures or orders ids.

export function newId(): string {
  // The fast path everywhere it exists: production (HTTPS) and normal dev
  // (localhost) both qualify.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // `crypto.randomUUID` is [SecureContext] in the WebCrypto spec, so it is
  // UNDEFINED over plain HTTP to anything but localhost - and `npm run dev` binds
  // 0.0.0.0 precisely so the app can be opened from a phone on the LAN. Without
  // this branch, creating a task there would throw. `getRandomValues` carries no
  // such restriction, so the fallback is still cryptographic; falling back to
  // `Math.random()` would quietly restore the flaw this module exists to remove, on
  // the one path least likely to be exercised.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1 (RFC 4122)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
