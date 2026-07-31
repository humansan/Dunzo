import { useEffect, useMemo } from 'react';
import { DayTodos, Todo } from '@shared/types';
import {
  getOrganizerTodos,
  getArchivedTodos,
  OrganizerEntry,
  todoIndex,
  collectionOf,
  collectionPath,
  inWorkspace,
} from '@/features/tasks/model';
import { ColKey, COLUMNS, GroupRow, FilterRule, FilterMatch, SortRule, SectionsConfig } from '@/features/planner/types';
import { PLANNER_VIEWS, resolveView, ViewCtx, ViewDef } from '@/features/planner/views';
import {
  getFieldDisplayValue,
  getFieldRawValue,
  compareRawValues,
  matchesFilter,
  buildGroupedItems,
} from '@/features/planner/model/viewUtils';
import { flattenTree } from '@/features/planner/sidebar/treeUtils';

// The hub's derived-data layer: takes the raw dayTodos plus the active view/
// filter/sort/section settings and produces every memoized projection the table
// and sidebar render from (entry indexes, the collection tree, the filtered/
// grouped row lists, and the per-collection counts). Pure derivation - UI state
// (collapse sets, the selected view) is passed in.
export function useHubData(params: {
  dayTodos: DayTodos[];
  activeWorkspaceId: string;
  selectedView: string;
  setSelectedView: (v: string) => void;
  // Whether `dayTodos` reflects a completed server load. An empty list means "no
  // todos" only when this is true; before that it just means "not loaded yet".
  dataReady: boolean;
  collapsed: Set<string>;
  collapsedColls: Set<string>;
  activeFilters: FilterRule[];
  filterMatch: FilterMatch;
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
    dataReady,
    collapsed,
    collapsedColls,
    activeFilters,
    filterMatch,
    activeSorts,
    sectionsConfig,
    showNesting,
  } = params;

  // Every organizer todo the user owns, scoped by inWorkspace - a no-op while
  // workspaces are disabled (see filters.ts), so this is the whole user-wide set.
  // Memoized so the whole downstream pipeline (byId, viewEntries, filtered/
  // processed entries, flattened, …) doesn't rebuild on every unrelated render
  // (hover, editing, menu open, each dragover frame).
  const entries = useMemo(
    () => getOrganizerTodos(dayTodos).filter((e) => inWorkspace(e.todo, activeWorkspaceId)),
    [dayTodos, activeWorkspaceId]
  );

  // Archived todos, for the 'archived' pseudo-view - kept separate from `entries`
  // since everything else in this file (collection tree, all/uncategorized counts,
  // ancestor walks) is scoped to the non-archived organizer set.
  const archivedEntries = useMemo(
    () =>
      getArchivedTodos(dayTodos).filter((e) => inWorkspace(e.todo, activeWorkspaceId)),
    [dayTodos, activeWorkspaceId]
  );

  // The active view's definition (which tasks it shows, how it scaffolds
  // collections, its label). A subtree-scaffolded view is a real collection id.
  const view = resolveView(selectedView);
  const selectedCollectionId = view.scaffold === 'subtree' ? selectedView : null;

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
  // fresh array, defeating React.memo and re-walking ancestors per row). Covers
  // archived entries too, since the Archived view renders rows never present in
  // `entries`.
  const collPathById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof collPathFor>>();
    for (const e of entries) m.set(e.todo.id, collPathFor(e.todo));
    for (const e of archivedEntries) m.set(e.todo.id, collPathFor(e.todo));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, archivedEntries, todoById]);
  // Archived entries plus their full ancestor chain (collections *and* parent
  // tasks), pulled from the full todo index even when an ancestor itself isn't
  // archived. Without this, an archived task whose collection/parent was never
  // archived would render as a parentless orphan - no collection header, no
  // subtask nesting - since flattenTree only links a node to a parent that's
  // also present in the entry list it's given.
  const archivedTreeEntries = useMemo(() => {
    const byIdInTree = new Map<string, OrganizerEntry>();
    for (const e of archivedEntries) {
      byIdInTree.set(e.todo.id, e);
      let pid = e.todo.parentId ?? null;
      const seen = new Set<string>();
      while (pid && todoById.has(pid) && !seen.has(pid)) {
        seen.add(pid);
        if (!byIdInTree.has(pid)) byIdInTree.set(pid, { todo: todoById.get(pid)! });
        pid = todoById.get(pid)!.parentId ?? null;
      }
    }
    return [...byIdInTree.values()];
  }, [archivedEntries, todoById]);
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

  // If the selected collection was deleted/archived, fall back to All. Gated on
  // dataReady: while the todos/workspaces are still loading `collections` is empty,
  // and firing here would rewrite a /planner/$collectionId deep-link to /planner
  // before the collection ever had a chance to appear.
  useEffect(() => {
    if (!dataReady) return;
    if (selectedCollectionId && !collections.some((c) => c.todo.id === selectedCollectionId)) {
      setSelectedView('all');
    }
  }, [dataReady, selectedCollectionId, collections]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // The entries the table renders for the current view, built uniformly from the
  // view's definition (see @/features/planner/views). Every view is: pick the leaf
  // tasks (`view.leaf`), re-attach their parent-task chain so subtask nesting
  // survives the filter, then add the collection scaffold the view calls for:
  //   • 'tree'      → every workspace collection (empty ones honour Hide-empty,
  //                   so Categorized / In Daily List behave exactly like All Tasks),
  //   • 'subtree'   → the selected collection's descendants (node itself excluded,
  //                   so its direct children render at depth 0),
  //   • 'ancestors' → the archived slice with its ancestor chain re-attached,
  //   • 'none'      → no collections (a flat, collection-free list, e.g. Uncategorized).
  const viewEntries = useMemo(() => {
    const v = resolveView(selectedView);
    if (v.source === 'archived') return archivedTreeEntries;
    if (v.scaffold === 'subtree')
      return entries.filter((e) => isDescendantOf(e, selectedView));

    const ctx: ViewCtx = { hasCollectionAncestor, isDescendantOf };
    const out = new Map<string, OrganizerEntry>();
    // Leaf tasks + each leaf's parent-task chain (collections are added below, so
    // the walk only re-attaches missing task parents to keep subtrees intact).
    for (const e of entries) {
      if (e.todo.isCollection || !v.leaf(e, ctx)) continue;
      out.set(e.todo.id, e);
      let pid = e.todo.parentId ?? null;
      const seen = new Set<string>();
      while (pid && byId.has(pid) && !seen.has(pid)) {
        seen.add(pid);
        const pe = byId.get(pid)!;
        if (!pe.todo.isCollection && !out.has(pid)) out.set(pid, pe);
        pid = pe.todo.parentId ?? null;
      }
    }
    if (v.scaffold === 'tree') for (const c of collections) out.set(c.todo.id, c);
    return [...out.values()];
  }, [entries, collections, archivedTreeEntries, selectedView, byId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Rules combine per `filterMatch` - 'and' = match every rule, 'or' = match any.
  // Unset (empty-value) rules are dropped first: matchesFilter treats them as "match
  // all", which is a harmless no-op under AND but would make OR pass everything.
  const filteredEntries = useMemo(() => {
    const rules = activeFilters.filter((f) => f.value);
    if (!rules.length) return viewEntries;
    return viewEntries.filter(
      (e) =>
        e.todo.isCollection ||
        (filterMatch === 'or'
          ? rules.some((f) => matchesFilter(e, f, todoById))
          : rules.every((f) => matchesFilter(e, f, todoById)))
    );
  }, [viewEntries, activeFilters, filterMatch, todoById]);

  // Hide collections that have no visible task descendants (optional section setting).
  // The ancestor walk runs over `todoById`, not `byId`: `byId` covers the non-archived
  // set only, so an archived collection would break the chain and read as empty in the
  // Archived view (and swallow its children's contribution to live grandparents).
  const processedEntries = useMemo(() => {
    if (!sectionsConfig.hideEmptyCollections) return filteredEntries;
    const collWithTasks = new Set<string>();
    for (const e of filteredEntries) {
      if (e.todo.isCollection) continue;
      let p: string | null = e.todo.parentId ?? null;
      const seen = new Set<string>();
      while (p && todoById.has(p) && !seen.has(p)) {
        seen.add(p);
        collWithTasks.add(p);
        p = todoById.get(p)!.parentId ?? null;
      }
    }
    return filteredEntries.filter((e) => !e.todo.isCollection || collWithTasks.has(e.todo.id));
  }, [filteredEntries, sectionsConfig.hideEmptyCollections, todoById]);

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
  // Walks `todoById` for the same reason as hideEmptyCollections above - an archived
  // ancestor is absent from `byId`, which zeroed archived collections' header counts.
  // Counts for collections that aren't rendered are simply never read.
  const visibleTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of processedEntries) {
      if (e.todo.isCollection) continue;
      let p: string | null = e.todo.parentId ?? null;
      const seen = new Set<string>();
      while (p && todoById.has(p) && !seen.has(p)) {
        seen.add(p);
        counts.set(p, (counts.get(p) ?? 0) + 1);
        p = todoById.get(p)!.parentId ?? null;
      }
    }
    return counts;
  }, [processedEntries, todoById]);

  // Grouped rows - only used when groupBy !== 'collection'.
  const groupedRows = useMemo((): GroupRow[] => {
    if (sectionsConfig.groupBy === 'collection') return [];
    return buildGroupedItems(processedEntries, sectionsConfig.groupBy, todoById, collapsed, sortFn, sectionsConfig.showLeafTasks, sectionsConfig.groupSortDirection);
  }, [sectionsConfig.groupBy, processedEntries, todoById, collapsed, sortFn, sectionsConfig.showLeafTasks, sectionsConfig.groupSortDirection]);

  // Rendered rows for collection-grouped (default) mode. processedEntries respects
  // filters + hideEmptyCollections. leafPosition segregates tasks vs sub-collections.
  // The dragged row stays visible (dimmed), so nothing is excluded during a drag.
  // When hideSubcollections is on we keep only the tasks sitting directly in the
  // view's root collection - every nested sub-collection and everything inside it
  // is dropped (task→subtask nesting, whose parents are tasks, is preserved).
  //   • picked collection → keep tasks whose nearest collection ancestor is it.
  //   • 'all' / 'uncategorized' → keep top-level collection headers, the tasks
  //     directly under them, and uncategorized tasks; drop nested sub-collections.
  const flattened = useMemo(
    () => {
      let treeEntries = processedEntries;
      if (sectionsConfig.hideSubcollections) {
        treeEntries = processedEntries.filter((e) => {
          const nearestColl = collectionOf(e.todo, todoById);
          if (selectedCollectionId) {
            return !e.todo.isCollection && nearestColl === selectedCollectionId;
          }
          if (e.todo.isCollection) return nearestColl === null; // top-level only
          return (
            nearestColl === null ||
            collectionOf(todoById.get(nearestColl)!, todoById) === null
          );
        });
      }
      return flattenTree(treeEntries, {
        // Flat variants ignore collapse state (nothing to expand/collapse).
        collapsed: showNesting ? collapsed : undefined,
        sortFn,
        leafPosition: sectionsConfig.showLeafTasks !== 'none' ? sectionsConfig.showLeafTasks : undefined,
        flat: !showNesting,
      });
    },
    [processedEntries, collapsed, sortFn, sectionsConfig.showLeafTasks, showNesting, sectionsConfig.hideSubcollections, selectedCollectionId, todoById]
  );
  const flatById = useMemo(() => new Map(flattened.map((n) => [n.id, n])), [flattened]);

  // Sidebar counts (tasks only, collections never counted). Each tab's count runs
  // the same `leaf` predicate the tab renders from, so a count can never disagree
  // with its contents.
  const countCtx: ViewCtx = { hasCollectionAncestor, isDescendantOf };
  const countLeaves = (v: ViewDef) =>
    (v.source === 'archived' ? archivedEntries : entries).filter(
      (e) => !e.todo.isCollection && v.leaf(e, countCtx)
    ).length;
  const allCount = countLeaves(PLANNER_VIEWS.all);
  const uncategorizedCount = countLeaves(PLANNER_VIEWS.uncategorized);
  const categorizedCount = countLeaves(PLANNER_VIEWS.categorized);
  const inDailyListCount = countLeaves(PLANNER_VIEWS['in-daily-list']);
  const archivedCount = countLeaves(PLANNER_VIEWS.archived);
  const completedCount = countLeaves(PLANNER_VIEWS.completed);
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
    : countLeaves(view);
  const selectedCollectionEntry = selectedCollectionId ? byId.get(selectedCollectionId) || null : null;
  const viewLabel = selectedCollectionId
    ? selectedCollectionEntry?.todo.text || 'Untitled collection'
    : view.label;

  return {
    entries,
    archivedEntries,
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
    visibleTaskCounts,
    groupedRows,
    flattened,
    flatById,
    collectionCount,
    allCount,
    uncategorizedCount,
    categorizedCount,
    inDailyListCount,
    archivedCount,
    completedCount,
    currentCount,
    viewLabel,
  };
}
