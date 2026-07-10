// Layout constants private to the Task Planner's table + sidebar.
// Collection colours used to live here; they are theme concerns shared with the
// calendar, stats and daily list, and now live in `@/theme/collectionColor`.

// ── Layout ───────────────────────────────────────────────────────────────────
export const MIN_COL_WIDTH = 80;
export const INDENT = 24; // px per nesting level (indent + drop-indicator offset)
export const NAME_BASE_PAD = 6; // px of breathing room between the left edge and the top-level controls
export const TABLE_PAD = 0; // px of horizontal whitespace framing the table (left margin + right gutter)
export const TABLE_GUTTER = 64;
export const BOTTOM_SPACER = 260; // px of dead space below the last row so the context menu has room to open

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
  'w-full h-full bg-surface px-2.5 text-sm font-mono text-fg focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60';
