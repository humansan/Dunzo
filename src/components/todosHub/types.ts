import { OrganizerEntry } from '../../utils/todoFilters';

// ── Column model ─────────────────────────────────────────────────────────────
export type ColKey =
  | 'title'
  | 'status'
  | 'priority'
  | 'startDate'
  | 'date'
  | 'start'
  | 'end'
  | 'percent'
  | 'collection'
  | 'xp'
  | 'notes'
  | 'startPercent'
  | 'estimatedTime'
  | 'createdAt'
  | 'completedAt';

export interface ColDef {
  key: ColKey;
  label: string;
  defaultWidth: number;
}

export const COLUMNS: ColDef[] = [
  { key: 'title', label: 'Name', defaultWidth: 320 },
  { key: 'status', label: 'Status', defaultWidth: 140 },
  { key: 'priority', label: 'Priority', defaultWidth: 120 },
  { key: 'startDate', label: 'Start Date', defaultWidth: 150 },
  { key: 'date', label: 'Due Date', defaultWidth: 150 },
  { key: 'start', label: 'Start Time', defaultWidth: 110 },
  { key: 'end', label: 'End Time', defaultWidth: 110 },
  { key: 'percent', label: 'End %', defaultWidth: 90 },
  { key: 'collection', label: 'Collection', defaultWidth: 240 },
  { key: 'xp', label: 'XP', defaultWidth: 80 },
  { key: 'notes', label: 'Notes', defaultWidth: 280 },
  { key: 'startPercent', label: 'Start %', defaultWidth: 90 },
  { key: 'estimatedTime', label: 'Est. Time', defaultWidth: 110 },
  { key: 'createdAt', label: 'Created At', defaultWidth: 150 },
  { key: 'completedAt', label: 'Completed At', defaultWidth: 150 },
];

// The Name column is pinned first and can never be hidden — every other field
// can be reordered and toggled via the Fields menu.
export const NAME_COL_KEY: ColKey = 'title';

export type EditState = { id: string; col: ColKey; rect: DOMRect | null } | null;

// ── View filter / sort rules ──────────────────────────────────────────────────
export type FilterCondition = 'is' | 'is_not' | 'contains' | 'greater_than' | 'less_than';

export interface FilterRule {
  id: string;
  field: ColKey;
  condition: FilterCondition;
  value: string;
}

export const FILTER_CONDITIONS: { value: FilterCondition; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
];

export interface SortRule {
  id: string;
  field: ColKey;
  direction: 'asc' | 'desc';
}

// ── Sections / view-layout settings ──────────────────────────────────────────
export interface SectionsConfig {
  // Auto-archive a task the moment it is toggled to completed.
  autoArchive: boolean;
  // Whether non-collection tasks appear before or after collections at each level.
  showLeafTasks: 'top' | 'bottom' | 'none';
  // Hide collections that have no visible tasks in the current view.
  hideEmptyCollections: boolean;
  // Which field drives the section headers. 'collection' = default tree mode.
  groupBy: ColKey;
  // Order of the section headers when grouping by an attribute (status/priority/
  // date). Ignored for 'collection' grouping, which keeps its manual order.
  // 'asc' uses the field's canonical order; 'desc' reverses it.
  groupSortDirection: 'asc' | 'desc';
}

export const DEFAULT_SECTIONS_CONFIG: SectionsConfig = {
  autoArchive: false,
  showLeafTasks: 'none',
  hideEmptyCollections: false,
  groupBy: 'collection',
  groupSortDirection: 'asc',
};

// A single row in the grouped-mode table (either a virtual group header or a task).
// `value` is the raw, assignable group key (what dropping a task here means — e.g.
// the priority/status value, or a date-bucket id); `label` is its display text.
export type GroupRow =
  | { type: 'header'; id: string; value: string; label: string; color: string; count: number; isCollapsed: boolean }
  // `group` is the owning section's raw value ('' = ungrouped leaf), used to
  // detect cross-section drags.
  | { type: 'task'; node: FlatNode; group: string };

// A todo placed in the tree: its structural parent + depth + display order.
export interface FlatNode {
  id: string;
  parentId: string | null;
  depth: number;
  entry: OrganizerEntry;
  hasChildren: boolean;
}
