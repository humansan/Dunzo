import { OrganizerEntry } from '@/features/tasks/model';

// The sidebar pseudo-view registry (which tasks each tab shows, how it scaffolds
// collections, its label/counts) lives in `@/features/planner/views`.

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
  { key: 'priority', label: 'Priority', defaultWidth: 120 },
  { key: 'notes', label: 'Notes', defaultWidth: 280 },
  { key: 'startDate', label: 'Start Date', defaultWidth: 150 },
  { key: 'start', label: 'Start Time', defaultWidth: 110 },
  { key: 'startPercent', label: 'Start %', defaultWidth: 90 },
  { key: 'date', label: 'End Date', defaultWidth: 150 },
  { key: 'end', label: 'End Time', defaultWidth: 110 },
  { key: 'percent', label: 'End %', defaultWidth: 90 },
  { key: 'status', label: 'Status', defaultWidth: 140 },
  { key: 'collection', label: 'Collection', defaultWidth: 240 },
  { key: 'xp', label: 'xp', defaultWidth: 80 },
  { key: 'estimatedTime', label: 'Est. Time', defaultWidth: 110 },
  { key: 'createdAt', label: 'Created At', defaultWidth: 150 },
  { key: 'completedAt', label: 'Completed At', defaultWidth: 150 },
];

// The Name column is pinned first and can never be hidden - every other field
// can be reordered and toggled via the Fields menu.
export const NAME_COL_KEY: ColKey = 'title';

// What a view shows before anyone touches its Fields menu. Everything else in
// COLUMNS starts hidden and can be switched back on from that menu; Name is
// always visible regardless, since NAME_COL_KEY is pinned.
//
// This is a DEFAULT, not a restriction: it only applies to a view with no saved
// field config. Once a view's config has been written, its stored set wins.
export const DEFAULT_VISIBLE_COLS: ColKey[] = [
  'title',
  'priority',
  'notes',
  'date',
  'end',
  'status',
  'collection',
  'xp',
  'createdAt',
  'completedAt',
];

export const DEFAULT_WRAP_COLS: ColKey[] = [
  'title'
];

// The complement of the above - what a fresh view starts with hidden. Derived so
// that adding a column to COLUMNS hides it by default until it's listed above.
export const DEFAULT_HIDDEN_COLS: ColKey[] = COLUMNS.map((c) => c.key).filter(
  (k) => !DEFAULT_VISIBLE_COLS.includes(k)
);

export type EditState = { id: string; col: ColKey; rect: DOMRect | null } | null;

// ── Toolbar menus ────────────────────────────────────────────────────────────
export type ToolbarMenuKey = 'sections' | 'fields' | 'filter' | 'sort';

// The stored per-view config fields (see useHubViewConfig's hubViews records).
export type ViewConfigField =
  | 'fieldOrder'
  | 'hiddenFields'
  | 'wrappedFields'
  | 'filters'
  | 'filterMatch'
  | 'sorts'
  | 'sections';

// Which stored fields each toolbar menu owns. This is the unit "Set for all"
// broadcasts to the workspace default and clears from every per-view record, so
// broadcasting one menu never disturbs the others' per-view settings.
export const MENU_SLICES: Record<ToolbarMenuKey, readonly ViewConfigField[]> = {
  sections: ['sections'],
  fields: ['fieldOrder', 'hiddenFields', 'wrappedFields'],
  filter: ['filters', 'filterMatch'],
  sort: ['sorts'],
};

// ── View filter / sort rules ──────────────────────────────────────────────────
export type FilterCondition = 'is' | 'is_not' | 'contains' | 'greater_than' | 'less_than';

export interface FilterRule {
  id: string;
  field: ColKey;
  condition: FilterCondition;
  value: string;
}

// How the active filter rules combine: 'and' = a task must match every rule,
// 'or' = it may match any one. A single per-view choice (not per-rule), shown in
// the Filter menu as a conjunction cell before each rule.
export type FilterMatch = 'and' | 'or';

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
  // Show only the tasks that sit directly in the current view's root collection:
  // nested sub-collections and every task inside them are dropped (task→subtask
  // nesting under a kept task is preserved).
  hideSubcollections: boolean;
  // Which field drives the section headers. 'collection' = default tree mode.
  groupBy: ColKey;
  // Order of the section headers when grouping by an attribute (status/priority/
  // date). Ignored for 'collection' grouping, which keeps its manual order.
  // 'asc' uses the field's canonical order; 'desc' reverses it.
  groupSortDirection: 'asc' | 'desc';
}

export const DEFAULT_SECTIONS_CONFIG: SectionsConfig = {
  // Off by default: it only fires on the Planner's own checkbox (see
  // handleToggleTodo), so completing the same task from the daily list or the
  // calendar left it un-archived - the same task behaving two different ways
  // depending on where it was ticked. Hiding completed tasks is now the job of
  // the seeded "Status is not Completed" view filter (@/lib/onboarding), which
  // works no matter where the task was completed. Anyone who wants the archiving
  // behaviour can still switch it on per view.
  autoArchive: false,
  showLeafTasks: 'top',
  hideEmptyCollections: false,
  hideSubcollections: false,
  groupBy: 'collection',
  groupSortDirection: 'asc',
};

// A single row in the grouped-mode table (either a virtual group header or a task).
// `value` is the raw, assignable group key (what dropping a task here means - e.g.
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
  // True structural depth (ancestors in the rendered tree). Used for subtree /
  // sibling reasoning during drag-and-drop, NOT for indentation.
  depth: number;
  // How far the row is drawn in, in indent steps. Deliberately distinct from
  // `depth`: a collection doesn't cost its tasks a level (see flattenTree), so
  // a collection's tasks line up with uncategorized root tasks.
  indent: number;
  entry: OrganizerEntry;
  hasChildren: boolean;
  // Whether this row actually satisfies the current view's predicate, or is only
  // on screen as CONTEXT - an ancestor re-attached to keep a matching descendant
  // nested (see useHubData's viewEntries / archivedTreeEntries). The Completed tab
  // shows the unfinished parent of a finished subtask; Archived shows the live
  // parent of an archived one. Both are wanted, but they need to look different
  // from a real hit, so context rows render dimmed. Collections are structural and
  // always count as matching. Defaults to true where nothing supplies a match set.
  matchesView: boolean;
}
