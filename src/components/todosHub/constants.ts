// ── Layout ───────────────────────────────────────────────────────────────────
export const MIN_COL_WIDTH = 80;
export const INDENT = 24; // px per nesting level (indent + drop-indicator offset)
export const NAME_BASE_PAD = 6; // px of breathing room between the left edge and the top-level controls
export const TABLE_PAD = 0; // px of horizontal whitespace framing the table (left margin + right gutter)
export const TABLE_GUTTER = 64;
export const BOTTOM_SPACER = 260; // px of dead space below the last row so the context menu has room to open

// ── Collection colors ────────────────────────────────────────────────────────
// Collections reference one of 8 theme "slots" (the --color-collection-1..8 roles),
// so a collection's pill follows the active theme + dark/light mode. Todo.color
// stores a slot id ('collection-1'..'collection-8') going forward. Legacy rows
// stored a raw hex from the old fixed palette; collectionSlot()/collectionColor()
// map those to the nearest slot at render time, so there's no destructive DB
// migration — old collections just start following the theme.
export const COLLECTION_SLOTS = [
  'collection-1', 'collection-2', 'collection-3', 'collection-4',
  'collection-5', 'collection-6', 'collection-7', 'collection-8',
] as const;
export const DEFAULT_COLLECTION_SLOT: string = COLLECTION_SLOTS[0];

// Human-readable names for the slots, shown in the collection Edit modal.
const COLLECTION_SLOT_NAMES: Record<string, string> = {
  'collection-1': 'Gray',  'collection-2': 'Red',  'collection-3': 'Orange', 'collection-4': 'Amber',
  'collection-5': 'Green', 'collection-6': 'Teal', 'collection-7': 'Blue',   'collection-8': 'Purple',
};

// Legacy stored hex → slot (old fixed palette order), for lazy render-time migration.
const LEGACY_HEX_TO_SLOT: Record<string, string> = {
  '#9ca3af': 'collection-1', '#f87171': 'collection-2', '#fb923c': 'collection-3', '#fbbf24': 'collection-4',
  '#4ade80': 'collection-5', '#2dd4bf': 'collection-6', '#60a5fa': 'collection-7', '#c084fc': 'collection-8',
};

// Normalize any stored Todo.color to a slot id. Handles slot ids, already-resolved
// role vars, legacy hex, and empty; unknown custom hex falls back to the default.
export function collectionSlot(stored?: string | null): string {
  if (!stored) return DEFAULT_COLLECTION_SLOT;
  if (stored.startsWith('collection-')) return stored;
  const m = /^var\(--color-(collection-\d)\)$/.exec(stored);
  if (m) return m[1];
  return LEGACY_HEX_TO_SLOT[stored.toLowerCase()] ?? DEFAULT_COLLECTION_SLOT;
}

// The themed CSS color for a stored Todo.color — a role var usable in pill()/style.
// Idempotent: passing an already-resolved var returns the same var.
export const collectionColor = (stored?: string | null): string =>
  `var(--color-${collectionSlot(stored)})`;

// Human-readable palette name (shown in the collection Edit modal).
export const colorName = (stored?: string | null): string =>
  COLLECTION_SLOT_NAMES[collectionSlot(stored)] ?? 'Custom';

// Pill label color: the shared theme-aware chip text (mixes the hue toward
// --color-fg so it reads on both dark and light). Kept re-exported under the old
// name so existing header/pill renderers don't need to change their imports.
export { pillText as pillTextColor } from '../../theme/pill';

// Hub view-config (column widths, per-view config, collapse state, selected view,
// sidebar sizing) is now DB-synced through `user_settings` (see src/data/settings.ts
// and the one-time import in src/data/import.ts), not localStorage.

// ── Sidebar sizing ───────────────────────────────────────────────────────────
export const SIDEBAR_INDENT = 14; // px per nesting level in the sidebar tree
export const MIN_SIDEBAR_WIDTH = 170;
export const MAX_SIDEBAR_WIDTH = 480;
export const DEFAULT_SIDEBAR_WIDTH = 224;

// Borderless input styling so the shared editors fill a spreadsheet cell.
export const cellEditCls =
  'w-full h-full bg-[#1e1e1e] px-2.5 text-sm font-mono text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60';
