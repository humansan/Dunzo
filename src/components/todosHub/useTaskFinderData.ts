import { useMemo } from 'react';
import { Todo } from '../../types';
import { OrganizerEntry, collectionOf, collectionPath } from '../../utils/todoFilters';
import { flattenTree } from './treeUtils';
import { COLUMNS, DEFAULT_SECTIONS_CONFIG } from './types';
import { TableModel } from './TaskTable';

export type FinderVisibleCollection = { entry: OrganizerEntry; depth: number; hasChildren: boolean };

// A collection breadcrumb (root→leaf) as the finder columns render it.
const pathCells = (nearest: string | null, todoById: Map<string, Todo>) =>
  collectionPath(nearest, todoById).map((c) => ({ id: c.id, name: c.text || 'Untitled', color: c.color }));

// The decoupled data layer for the Task Finder's two-pane view — reuses the pure
// tree/collection utilities (no per-view column config, no DnD, no DB-synced hub
// state). Given the search matches, it derives: the collection tree filtered to
// collections that actually contain a match (both panes hide empties), per-view
// match counts, and a ready-to-render TABLE model for the right pane scoped to the
// selected view. The right pane is tasks-only — sub-collection structure lives in
// the sidebar, so it needs no collection headers.
export function useTaskFinderData(params: {
  entries: OrganizerEntry[];
  todoById: Map<string, Todo>;
  matches: OrganizerEntry[];
  selectedView: string; // 'all' | 'uncategorized' | collectionId
  collapsed: Set<string>; // right-pane task-subtree collapse
  collapsedColls: Set<string>; // sidebar collection collapse
}) {
  const { entries, todoById, matches, selectedView, collapsed, collapsedColls } = params;

  // Each match's collection ancestry → which collections contain a match (with
  // per-collection counts). The ancestry closure keeps parent collections visible
  // when only a sub-collection has hits.
  const { withMatches, count } = useMemo(() => {
    const withMatches = new Set<string>();
    const count = new Map<string, number>();
    for (const m of matches) {
      const nearest = collectionOf(m.todo, todoById);
      for (const c of collectionPath(nearest, todoById)) {
        withMatches.add(c.id);
        count.set(c.id, (count.get(c.id) ?? 0) + 1);
      }
    }
    return { withMatches, count };
  }, [matches, todoById]);

  const collectionCount = (id: string) => count.get(id) ?? 0;
  const allCount = matches.length;
  const uncategorizedCount = useMemo(
    () => matches.filter((m) => collectionOf(m.todo, todoById) === null).length,
    [matches, todoById]
  );

  // Sidebar tree — only collections that contain a match, grouped by parent and
  // walked in hub order, honoring the sidebar collapse set.
  const visibleCollections = useMemo<FinderVisibleCollection[]>(() => {
    const colls = entries
      .filter((e) => e.todo.isCollection && withMatches.has(e.todo.id))
      .sort((a, b) => (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt));
    const ids = new Set(colls.map((c) => c.todo.id));
    const byParent = new Map<string | null, OrganizerEntry[]>();
    for (const c of colls) {
      const pid = c.todo.parentId && ids.has(c.todo.parentId) ? c.todo.parentId : null;
      const arr = byParent.get(pid); if (arr) arr.push(c); else byParent.set(pid, [c]);
    }
    const out: FinderVisibleCollection[] = [];
    const walk = (pid: string | null, depth: number) => {
      for (const c of byParent.get(pid) ?? []) {
        const kids = byParent.get(c.todo.id) ?? [];
        out.push({ entry: c, depth, hasChildren: kids.length > 0 });
        if (kids.length && !collapsedColls.has(c.todo.id)) walk(c.todo.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [entries, withMatches, collapsedColls]);

  // Right pane — the matching tasks for the selected view (nearest collection ===
  // the selected one; sub-collections are navigated via the sidebar), plus each
  // match's subtask subtree so children stay reachable.
  const bodyEntries = useMemo(() => {
    const scoped = matches.filter((m) => {
      if (selectedView === 'all') return true;
      const nearest = collectionOf(m.todo, todoById);
      if (selectedView === 'uncategorized') return nearest === null;
      return nearest === selectedView;
    });
    if (scoped.length === 0) return [];
    const childrenByParent = new Map<string, OrganizerEntry[]>();
    for (const e of entries) {
      if (e.todo.isCollection) continue;
      const p = e.todo.parentId;
      if (p) { const a = childrenByParent.get(p) ?? []; a.push(e); childrenByParent.set(p, a); }
    }
    const set = new Map<string, OrganizerEntry>();
    const addSubtree = (e: OrganizerEntry) => {
      if (set.has(e.todo.id)) return;
      set.set(e.todo.id, e);
      for (const c of childrenByParent.get(e.todo.id) ?? []) addSubtree(c);
    };
    for (const e of scoped) addSubtree(e);
    return [...set.values()];
  }, [matches, entries, selectedView, todoById]);

  const flattened = useMemo(() => flattenTree(bodyEntries, { collapsed }), [bodyEntries, collapsed]);
  const collPathById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof pathCells>>();
    for (const n of flattened) m.set(n.id, pathCells(collectionOf(n.entry.todo, todoById), todoById));
    return m;
  }, [flattened, todoById]);

  // A static all-columns table layout (default widths; the finder doesn't persist
  // or resize columns).
  const gridTemplateColumns = useMemo(
    () => COLUMNS.map((c) => `${c.defaultWidth}px`).join(' ') + ' minmax(80px, 1fr)',
    []
  );

  const selectedCollectionId =
    selectedView !== 'all' && selectedView !== 'uncategorized' ? selectedView : null;

  const bodyModel: TableModel = {
    columns: COLUMNS,
    gridTemplateColumns,
    lastColKey: COLUMNS[COLUMNS.length - 1].key,
    wrappedFields: new Set(),
    startResize: () => {},
    sectionsConfig: DEFAULT_SECTIONS_CONFIG,
    flattened,
    groupedRows: [],
    collPathById,
    visibleTaskCounts: new Map(),
    todoById,
    collapsed,
    selectedCollectionId,
    selectedView,
    viewLabel: '',
    currentCount: flattened.length,
  };

  return { visibleCollections, allCount, uncategorizedCount, collectionCount, bodyModel };
}
