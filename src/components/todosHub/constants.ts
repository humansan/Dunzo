// ── Layout ───────────────────────────────────────────────────────────────────
export const MIN_COL_WIDTH = 80;
export const INDENT = 24; // px per nesting level (indent + drop-indicator offset)
export const NAME_BASE_PAD = 6; // px of breathing room between the left edge and the top-level controls
export const TABLE_PAD = 0; // px of horizontal whitespace framing the table (left margin + right gutter)
export const TABLE_GUTTER = 64;
export const BOTTOM_SPACER = 260; // px of dead space below the last row so the context menu has room to open

// ── Collection colors ────────────────────────────────────────────────────────
// Collection pill palette — 8 picks that read well as tinted-bg + colored-text on
// the dark table. The first is the default applied when a task becomes a collection.
export const COLLECTION_COLORS = [
  '#9ca3af', // gray
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#4ade80', // green
  '#2dd4bf', // teal
  '#60a5fa', // blue
  '#c084fc', // purple
];
export const DEFAULT_COLLECTION_COLOR = COLLECTION_COLORS[0];

// Human-readable names for the palette, shown in the collection Edit modal.
export const COLLECTION_COLOR_NAMES: Record<string, string> = {
  '#9ca3af': 'Gray',
  '#f87171': 'Red',
  '#fb923c': 'Orange',
  '#fbbf24': 'Amber',
  '#4ade80': 'Green',
  '#2dd4bf': 'Teal',
  '#60a5fa': 'Blue',
  '#c084fc': 'Purple',
};
export const colorName = (c: string) => COLLECTION_COLOR_NAMES[c] || 'Custom';

// Pill label color: lighten the collection color toward white so the name reads
// with high contrast against the dark tinted-bg pill.
export const pillTextColor = (color: string) => `color-mix(in srgb, ${color} 40%, white)`;

// ── Persistence keys ─────────────────────────────────────────────────────────
export const WIDTHS_KEY = 'dun-hub-col-widths';
export const VIEWS_KEY = 'dun-hub-views'; // per-view config: fieldOrder, hiddenFields, filters, sorts
export const COLLAPSED_KEY = 'dun-hub-collapsed';
export const VIEW_KEY = 'dun-hub-view'; // which sidebar entry is selected ('all' | 'uncategorized' | collection id)
export const SIDEBAR_WIDTH_KEY = 'dun-hub-sidebar-width';
export const SIDEBAR_HIDDEN_KEY = 'dun-hub-sidebar-hidden';
export const SIDEBAR_COLLAPSED_KEY = 'dun-hub-sidebar-collapsed'; // expand/collapse state of the collection tree

// ── Sidebar sizing ───────────────────────────────────────────────────────────
export const SIDEBAR_INDENT = 14; // px per nesting level in the sidebar tree
export const MIN_SIDEBAR_WIDTH = 170;
export const MAX_SIDEBAR_WIDTH = 480;
export const DEFAULT_SIDEBAR_WIDTH = 224;

// Borderless input styling so the shared editors fill a spreadsheet cell.
export const cellEditCls =
  'w-full h-full bg-[#1e1e1e] px-2.5 text-sm font-mono text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60';

// Shared <select> styling for the toolbar dropdown menus (Filter / Sort / Sections).
export const selectCls =
  'bg-[#2a2a2a] border border-white/10 rounded px-1.5 h-7 text-[13px] text-white/80 focus:outline-none focus:border-[var(--accent2)] cursor-pointer';
