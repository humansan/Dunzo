import { format } from 'date-fns';
import type { Todo } from '@shared/types';
import type { OrganizerEntry } from '@/features/tasks/model';
import { isDone } from '@/features/tasks/model';
import type { ColKey } from '@/features/planner/types';

// ── Planner view registry ────────────────────────────────────────────────────
// Every sidebar tab is described as data here, and useHubData drives its entire
// read pipeline from these fields. A view is really just three decisions:
//   • which candidate task set it draws from (organizer vs. the archived slice),
//   • which of those tasks it shows (the `leaf` predicate), and
//   • which collection nodes scaffold the render tree (`scaffold`).
// Everything downstream (filters, hide-empty, grouping, sort, counts, labels) is
// uniform, so a new tab is one entry here — not a new `if` branch in six files.

export type ViewScaffold = 'tree' | 'subtree' | 'ancestors' | 'none';

// The ancestry helpers a leaf predicate may consult, supplied by useHubData
// (they close over the current workspace's entry index).
export interface ViewCtx {
  hasCollectionAncestor: (e: OrganizerEntry) => boolean;
  isDescendantOf: (e: OrganizerEntry, cid: string) => boolean;
}

export interface ViewDef {
  id: string;
  label: string;
  // Which candidate set the leaves are drawn from.
  source: 'organizer' | 'archived';
  // Which collection nodes scaffold the tree the table renders:
  //   'tree'      → every collection in the workspace (empty ones honour the
  //                 Hide-empty-sections toggle, exactly like All Tasks),
  //   'subtree'   → the selected collection's descendants (a real collection id),
  //   'ancestors' → only collections that are an ancestor of a matched leaf,
  //   'none'      → no collections at all (a flat, collection-free list).
  scaffold: ViewScaffold;
  // Which non-collection tasks belong to this view.
  leaf: (e: OrganizerEntry, ctx: ViewCtx) => boolean;
  // Section grouping to use when the view has no persisted override.
  defaultGroupBy?: ColKey;
  // Whether the "New" affordances (toolbar + table) are offered in this view.
  allowNew: boolean;
  // Opt out of the workspace's DEFAULT filters (the "Set for all" / first-run
  // record - see useHubViewConfig). A view whose whole point is to show a slice
  // the default filter excludes would otherwise render permanently empty: the
  // shipped default is "Status is not Completed", which would blank both Archived
  // (archived tasks are usually completed) and Completed (entirely). Filters set
  // explicitly ON such a view still apply - this only ignores the inherited ones.
  ignoresDefaultFilters?: boolean;
  // What a task created inside this view needs in order to remain visible here
  // (e.g. the In Daily List tab seeds the daily flag + today's date). Evaluated
  // at create time so dynamic values like "today" stay fresh.
  createSeed?: () => { date?: string | null; patch?: Partial<Todo> };
}

// The fixed pseudo-view tabs, keyed by their `selectedView` id. Any id NOT here
// is treated as a real collection id (see resolveView).
export const PLANNER_VIEWS: Record<string, ViewDef> = {
  all: {
    id: 'all',
    label: 'All Planner Tasks',
    source: 'organizer',
    scaffold: 'tree',
    leaf: () => true,
    allowNew: true,
  },
  uncategorized: {
    id: 'uncategorized',
    label: 'Uncategorized',
    source: 'organizer',
    scaffold: 'none',
    leaf: (e, ctx) => !ctx.hasCollectionAncestor(e),
    allowNew: true,
  },
  categorized: {
    id: 'categorized',
    label: 'Categorized',
    source: 'organizer',
    scaffold: 'tree',
    leaf: (e, ctx) => ctx.hasCollectionAncestor(e),
    allowNew: true,
  },
  'in-daily-list': {
    id: 'in-daily-list',
    label: 'In Daily List',
    source: 'organizer',
    scaffold: 'tree',
    // The one view keyed off the daily-list flag. A dueDate is required because a
    // task with no date never lands on any daily list.
    leaf: (e) => e.todo.showInDailyList === true && !!e.todo.dueDate,
    defaultGroupBy: 'date',
    allowNew: true,
    createSeed: () => ({
      date: format(new Date(), 'yyyy-MM-dd'),
      patch: { showInDailyList: true },
    }),
  },
  archived: {
    id: 'archived',
    label: 'Archived',
    source: 'archived',
    scaffold: 'ancestors',
    leaf: () => true,
    allowNew: false,
    ignoresDefaultFilters: true,
  },
  completed: {
    id: 'completed',
    label: 'Completed',
    // Completion is not archival: a completed task stays in the organizer set
    // until it's explicitly archived, so this draws from the same source as every
    // other live view. Tasks that are BOTH completed and archived belong to the
    // Archived tab and are deliberately not repeated here.
    source: 'organizer',
    // 'tree', so completed tasks keep their collection headers (pair it with
    // Hide-empty-sections to drop collections that contain none).
    scaffold: 'tree',
    leaf: (e) => isDone(e.todo),
    // An incomplete PARENT of a completed task is re-attached by useHubData's
    // ancestor walk and shows as context, exactly like the Archived view.
    allowNew: false,
    ignoresDefaultFilters: true,
  },
};

// True when `view` is one of the fixed pseudo-views (vs. a real collection id).
export function isPseudoView(view: string): boolean {
  return view in PLANNER_VIEWS;
}

// Resolve a `selectedView` string to its definition. Unknown ids are real
// collections, rendered as the subtree rooted at that collection.
export function resolveView(view: string): ViewDef {
  return (
    PLANNER_VIEWS[view] ?? {
      id: view,
      label: '',
      source: 'organizer',
      scaffold: 'subtree',
      leaf: (e, ctx) => ctx.isDescendantOf(e, view),
      allowNew: true,
    }
  );
}
