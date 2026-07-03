import { useEffect, useMemo } from 'react';
import { DayTodos, Todo } from '../../types';
import {
  getOrganizerTodos,
  OrganizerEntry,
  todoIndex,
  collectionOf,
  collectionPath,
} from '../../utils/todoFilters';
import { ColKey, COLUMNS, GroupRow, FilterRule, SortRule, SectionsConfig } from './types';
import {
  getFieldDisplayValue,
  getFieldRawValue,
  compareRawValues,
  matchesFilter,
  buildGroupedItems,
} from './viewUtils';
import { flattenTree } from './treeUtils';

// The hub's derived-data layer: takes the raw dayTodos plus the active view/
// filter/sort/section settings and produces every memoized projection the table
// and sidebar render from (entry indexes, the collection tree, the filtered/
// grouped row lists, and the per-collection counts). Pure derivation — UI state
// (collapse sets, the selected view) is passed in.
export function useHubData(params: {
  dayTodos: DayTodos[];
  activeWorkspaceId: string;
  selectedView: string;
  setSelectedView: (v: string) => void;
  collapsed: Set<string>;
  collapsedColls: Set<string>;
  activeFilters: FilterRule[];
  activeSorts: SortRule[];
  sectionsConfig: SectionsConfig;
  // Whether the current view variant shows the collection/subtask hierarchy. When
  // false the tree is flattened to a single depth-0 list (search-style), ignoring
  // collapse state. Both live variants (table/list) pass true.
  showNesting: boolean;
}) {
  const {
    dayTodos,
    activeWorkspaceId,
    selectedView,
    setSelectedView,
    collapsed,
    collapsedColls,
    activeFilters,
    activeSorts,
    sectionsConfig,
    showNesting,
  } = params;

  // Only this workspace's todos/collections (undefined id ⇒ default 'personal').
  // Memoized so the whole downstream pipeline (byId, viewEntries, filtered/
  // processed entries, flattened, …) doesn't rebuild on every unrelated render
  // (hover, editing, menu open, each dragover frame).
  const entries = useMemo(
    () =>
      getOrganizerTodos(dayTodos).filter(
        (e) => (e.todo.workspaceId ?? 'personal') === activeWorkspaceId
      ),
    [dayTodos, activeWorkspaceId]
  );

  // A real collection is selected (vs. the 'all' / 'uncategorized' pseudo-views).
  const selectedCollectionId =
    selectedView !== 'all' && selectedView !== 'uncategorized' ? selectedView : null;

  // Ancestry helpers over the current entry set.
  const byId = useMemo(() => new Map(entries.map((e) => [e.todo.id, e])), [entries]);
  // Full todo index (across all buckets) for resolving collection paths.
  const todoById = useMemo(() => todoIndex(dayTodos), [dayTodos]);
  const collPathFor = (todo: Todo) =>
    collectionPath(collectionOf(todo, todoById), todoById).map((c) => ({
      id: c.id,
      name: c.text || 'Untitled',
      color: c.color,
    }));
  // Precompute each entry's collection breadcrumb once per data change, so rows
  // get a stable `collPath` reference (otherwise every render hands each row a
  // fresh array, defeating React.memo and re-walking ancestors per row).
  const collPathById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof collPathFor>>();
    for (const e of entries) m.set(e.todo.id, collPathFor(e.todo));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, todoById]);
  const hasCollectionAncestor = (e: OrganizerEntry): boolean => {
    let p = e.todo.parentId ?? null;
    const seen = new Set<string>();
    while (p && byId.has(p) && !seen.has(p)) {
      seen.add(p);
      const pe = byId.get(p)!;
      if (pe.todo.isCollection) return true;
      p = pe.todo.parentId ?? null;
    }
    return false;
  };
  const isDescendantOf = (e: OrganizerEntry, cid: string): boolean => {
    let p = e.todo.parentId ?? null;
    const seen = new Set<string>();
    while (p && byId.has(p) && !seen.has(p)) {
      if (p === cid) return true;
      seen.add(p);
      p = byId.get(p)!.todo.parentId ?? null;
    }
    return false;
  };

  // Collections list for the sidebar (top-level sections, in hub order).
  const collections = useMemo(
    () =>
      entries
        .filter((e) => e.todo.isCollection)
        .sort((a, b) => (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt)),
    [entries]
  );

  // If the selected collection was deleted/archived, fall back to All.
  useEffect(() => {
    if (selectedCollectionId && !collections.some((c) => c.todo.id === selectedCollectionId)) {
      setSelectedView('all');
    }
  }, [selectedCollectionId, collections]); // eslint-disable-line react-hooks/exhaustive-deps

  // Collections grouped by their parent collection (root = null), each list in
  // hub order. A parentId pointing outside this workspace's collections is
  // treated as a root.
  const collChildren = useMemo(() => {
    const ids = new Set(collections.map((c) => c.todo.id));
    const m = new Map<string | null, OrganizerEntry[]>();
    for (const c of collections) {
      const pid = c.todo.parentId && ids.has(c.todo.parentId) ? c.todo.parentId : null;
      const arr = m.get(pid) ?? [];
      arr.push(c);
      m.set(pid, arr);
    }
    return m;
  }, [collections]);

  // Flatten the collection tree into render order (depth-first), hiding the
  // children of collapsed collections.
  const visibleCollections = useMemo(() => {
    const out: { entry: OrganizerEntry; depth: number; hasChildren: boolean }[] = [];
    const walk = (pid: string | null, depth: number) => {
      for (const c of collChildren.get(pid) ?? []) {
        const kids = collChildren.get(c.todo.id) ?? [];
        out.push({ entry: c, depth, hasChildren: kids.length > 0 });
        if (kids.length && !collapsedColls.has(c.todo.id)) walk(c.todo.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [collChildren, collapsedColls]);

  // The entries the table renders for the current view.
  //   • 'all'          → everything (collections show inline as pill headers)
  //   • 'uncategorized'→ tasks with no collection ancestor (collections excluded)
  //   • a collection id→ that collection's descendants (the collection node itself
  //     is excluded, so its direct children render at depth 0)
  const viewEntries = useMemo(() => {
    if (selectedView === 'all') return entries;
    if (selectedView === 'uncategorized')
      return entries.filter((e) => !e.todo.isCollection && !hasCollectionAncestor(e));
    return entries.filter((e) => isDescendantOf(e, selectedView));
  }, [entries, selectedView, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unique display values per field, computed from un-filtered view entries.
  // Used to populate the filter value dropdown.
  const uniqueValues = useMemo(() => {
    const map = new Map<ColKey, string[]>();
    for (const col of COLUMNS) {
      const vals = new Set<string>();
      for (const e of viewEntries) {
        if (e.todo.isCollection) continue;
        const v = getFieldDisplayValue(e, col.key, todoById);
        if (v) vals.add(v);
      }
      map.set(col.key, [...vals].sort());
    }
    return map;
  }, [viewEntries, todoById]);

  // Apply active filters: collections are never filtered out (they're structural).
  const filteredEntries = useMemo(() => {
    if (!activeFilters.length) return viewEntries;
    return viewEntries.filter(
      (e) => e.todo.isCollection || activeFilters.every((f) => matchesFilter(e, f, todoById))
    );
  }, [viewEntries, activeFilters, todoById]);

  // Hide collections that have no visible task descendants (optional section setting).
  const processedEntries = useMemo(() => {
    if (!sectionsConfig.hideEmptyCollections) return filteredEntries;
    const collWithTasks = new Set<string>();
    for (const e of filteredEntries) {
      if (e.todo.isCollection) continue;
      let p: string | null = e.todo.parentId ?? null;
      while (p && byId.has(p)) {
        collWithTasks.add(p);
        p = byId.get(p)!.todo.parentId ?? null;
      }
    }
    return filteredEntries.filter((e) => !e.todo.isCollection || collWithTasks.has(e.todo.id));
  }, [filteredEntries, sectionsConfig.hideEmptyCollections, byId]);

  // Build a sort comparator from the active sort rules.
  const sortFn = useMemo(() => {
    if (!activeSorts.length) return undefined;
    return (a: OrganizerEntry, b: OrganizerEntry) => {
      for (const s of activeSorts) {
        const va = getFieldRawValue(a, s.field, todoById);
        const vb = getFieldRawValue(b, s.field, todoById);
        const cmp = compareRawValues(va, vb);
        if (cmp !== 0) return s.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    };
  }, [activeSorts, todoById]);

  // Visible (post-filter) task count per collection, used for the header chip counts.
  const visibleTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of processedEntries) {
      if (e.todo.isCollection) continue;
      let p: string | null = e.todo.parentId ?? null;
      const seen = new Set<string>();
      while (p && byId.has(p) && !seen.has(p)) {
        seen.add(p);
        counts.set(p, (counts.get(p) ?? 0) + 1);
        p = byId.get(p)!.todo.parentId ?? null;
      }
    }
    return counts;
  }, [processedEntries, byId]);

  // Grouped rows — only used when groupBy !== 'collection'.
  const groupedRows = useMemo((): GroupRow[] => {
    if (sectionsConfig.groupBy === 'collection') return [];
    return buildGroupedItems(processedEntries, sectionsConfig.groupBy, todoById, collapsed, sortFn, sectionsConfig.showLeafTasks, sectionsConfig.groupSortDirection);
  }, [sectionsConfig.groupBy, processedEntries, todoById, collapsed, sortFn, sectionsConfig.showLeafTasks, sectionsConfig.groupSortDirection]);

  // Rendered rows for collection-grouped (default) mode. processedEntries respects
  // filters + hideEmptyCollections. leafPosition segregates tasks vs sub-collections.
  // The dragged row stays visible (dimmed), so nothing is excluded during a drag.
  const flattened = useMemo(
    () => flattenTree(processedEntries, {
      // Flat variants ignore collapse state (nothing to expand/collapse).
      collapsed: showNesting ? collapsed : undefined,
      sortFn,
      leafPosition: sectionsConfig.showLeafTasks !== 'none' ? sectionsConfig.showLeafTasks : undefined,
      flat: !showNesting,
    }),
    [processedEntries, collapsed, sortFn, sectionsConfig.showLeafTasks, showNesting]
  );
  const flatById = useMemo(() => new Map(flattened.map((n) => [n.id, n])), [flattened]);

  // Sidebar counts (tasks only, collections never counted).
  const allCount = entries.filter((e) => !e.todo.isCollection).length;
  const uncategorizedCount = entries.filter(
    (e) => !e.todo.isCollection && !hasCollectionAncestor(e)
  ).length;
  // Task-descendant count per collection (every non-collection descendant,
  // ignoring filters), precomputed in one ancestor walk instead of re-filtering
  // all entries for each sidebar row.
  const collectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.todo.isCollection) continue;
      let p: string | null = e.todo.parentId ?? null;
      const seen = new Set<string>();
      while (p && byId.has(p) && !seen.has(p)) {
        seen.add(p);
        const pe = byId.get(p)!;
        if (pe.todo.isCollection) counts.set(p, (counts.get(p) ?? 0) + 1);
        p = pe.todo.parentId ?? null;
      }
    }
    return counts;
  }, [entries, byId]);
  const collectionCount = (cid: string) => collectionCounts.get(cid) ?? 0;

  const currentCount = selectedCollectionId
    ? collectionCount(selectedCollectionId)
    : selectedView === 'uncategorized'
      ? uncategorizedCount
      : allCount;
  const selectedCollectionEntry = selectedCollectionId ? byId.get(selectedCollectionId) || null : null;
  const viewLabel = selectedCollectionId
    ? selectedCollectionEntry?.todo.text || 'Untitled collection'
    : selectedView === 'uncategorized'
      ? 'Uncategorized'
      : 'All Tasks';

  return {
    entries,
    selectedCollectionId,
    byId,
    todoById,
    collPathFor,
    collPathById,
    hasCollectionAncestor,
    isDescendantOf,
    collections,
    collChildren,
    visibleCollections,
    viewEntries,
    uniqueValues,
    filteredEntries,
    processedEntries,
    sortFn,
    visibleTaskCounts,
    groupedRows,
    flattened,
    flatById,
    collectionCount,
    allCount,
    uncategorizedCount,
    currentCount,
    viewLabel,
  };
}
