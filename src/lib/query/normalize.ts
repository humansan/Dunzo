// Postgres returns `null` for empty/unset columns, but the app was written
// against the localStorage-era contract where empty optional fields are
// `undefined` — every empty-field guard in the UI checks `!== undefined`, so a
// `null` slips past it and renders as "null", "null%", "0m", an empty pill, etc.
// Normalize at the fetch boundary (the only place `null` enters the cache; the
// optimistic mutation layer only ever merges client-built, `undefined`-based
// objects) so `null` never reaches the UI.
//
// Shallow by design: every Todo/Tracker/Workspace field is a flat scalar, and
// the settings blob's nested objects (theme / hubViews / hubColWidths /
// hubLayout) must be preserved as-is rather than recursively rewritten.
export function stripNulls<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = v === null ? undefined : v;
  }
  return out as T;
}

// List form: normalize each row. Tolerates a non-array (returns it unchanged) so
// an unexpected empty/`204` response can't throw.
export function stripNullsList<T>(rows: T[]): T[] {
  return Array.isArray(rows) ? rows.map(stripNulls) : rows;
}

// Outbound mirror of `stripNulls`: rewrite `undefined` → `null` so a PATCH/upsert
// body emits an explicit `SET col = NULL` for a cleared field. Without this,
// `JSON.stringify` silently drops `undefined`-valued keys, the server reads the
// absent key as "leave unchanged", and the cleared value resurfaces on refetch.
//
// Apply ONLY to the serialized request body — never to the optimistic cache
// merge, which must keep `undefined` so cleared cells render empty rather than
// the literal "null" (the very thing `stripNulls` exists to prevent). Shallow,
// matching `stripNulls`: every Todo field is a flat scalar.
export function nullifyUndefined<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = v === undefined ? null : v;
  }
  return out as T;
}
