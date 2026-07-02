import React from 'react';

// ── Task Planner view variant ────────────────────────────────────────────────
// A single descriptor that *names* a presentation of the shared row/name-cell,
// replacing the old scattered `listView` boolean. Every component reads the field
// that matches the decision it's making, so adding a view is adding a preset here
// rather than turning a boolean into a 3-way in five files.
//
// Which field governs what (keep new reads on the same axis):
//   • chrome      — the outer scroll container + header/title chrome.
//   • columns     — which columns render, the grid, the width anchor, and the
//                   dividers/background on the sticky Name cell.
//   • mode        — fine row/cell styling (section pill size + spacing, list wrap,
//                   the add-row treatment).
//   • showNesting — expand/collapse chevrons + indent + hierarchical flattening.
//   • dnd         — whether this surface enables drag-to-reorder/nest.
export type TableMode = 'table' | 'list' | 'column';

export interface TableVariant {
  mode: TableMode;
  showNesting: boolean;
  columns: 'all' | 'name';
  chrome: 'header' | 'title' | 'none';
  dnd: boolean;
}

// Presets are defined at module scope so their identity is stable across renders —
// `React.memo`'d rows that read the variant from context don't re-render just for
// reading it. Only `table` and `list` are wired today; `column`/`search` land with
// the flat-list and Finder-columns views.
export const VARIANTS: Record<'table' | 'list' | 'column' | 'search', TableVariant> = {
  table:  { mode: 'table',  showNesting: true,  columns: 'all',  chrome: 'header', dnd: true },
  list:   { mode: 'list',   showNesting: true,  columns: 'name', chrome: 'title',  dnd: true },
  column: { mode: 'column', showNesting: false, columns: 'name', chrome: 'none',   dnd: false },
  search: { mode: 'column', showNesting: false, columns: 'name', chrome: 'none',   dnd: false },
};

// Provided at each table surface by <TaskTable>, so nested rows/headers read the
// active variant from context instead of having it prop-drilled to each one.
export const TableVariantContext = React.createContext<TableVariant>(VARIANTS.table);
export const useTableVariant = (): TableVariant => React.useContext(TableVariantContext);
