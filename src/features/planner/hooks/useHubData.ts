import { useEffect, useMemo } from 'react';
import { DayTodos, Todo } from '@shared/types';
import {
  getOrganizerTodos,
  getArchivedTodos,
  getSearchableTodos,
  OrganizerEntry,
  todoIndex,
  collectionOf,
  collectionPath,
  ancestorsOf,
  collectionAncestors,
  hasCollectionAncestor as hasCollAncestor,
  isDescendantOf as isDescendantOfId,
  inWorkspace,
} from '@/features/tasks/model';
import { ColKey, COLUMNS, GroupRow, FilterRule, FilterMatch, SortRule, SectionsConfig } from '@/features/planner/types';
import { PLANNER_VIEWS, resolveView, ViewCtx, ViewDef } from '@/features/planner/views';
import { rankTaskFinderMatches } from '@/features/planner/task-finder/useTaskFinderSearch';
import type { ViewFilterState } from '@/features/planner/model/viewConfigStore';
import {
  getFieldDisplayValue,
  getFieldRawValue,
  compareRawValues,
  applyFilters,
  buildGroupedItems,
} from '@/features/planner/model/viewUtils';
import { flattenTree } from '@/features/planner/sidebar/treeUtils';

// A stable empty set, so a consumer memoizing on `searchVisibleTaskIds` doesn't
// see a new identity on every render while no search is running.
const EMPTY_ID_SET: ReadonlySet<string> = new Set<string>();

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
  // The view's "Hide completed tasks" setting (see ViewFilterState) - applied on
  // top of the rules, not as one of them.
  hideCompleted: boolean;
  // Any view's resolved filters, by view id (see useHubViewConfig). The sidebar
  // counts need every tab's own rules, not just the visible tab's.
  filtersFor: (viewId: string) => ViewFilterState;
  activeSorts: SortRule[];
  sectionsConfig: SectionsConfig;
  // The toolbar's in-view search box. Transient and local to the open tab (the
  // caller clears it on tab change), so unlike filters/sorts it is never persisted
  // to view state - a saved-but-invisible search would silently hide rows on
  // return. Empty string = inactive.
  searchQuery: string;
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
    hideCompleted,
    filtersFor,
    activeSorts,
    sectionsConfig,
    searchQuery,
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

  // Every unarchived todo, Planner-visible or not. Not part of the Planner's own
  // pipeline - nothing below reads it - it exists for the TaskFinder pickers this
  // view opens, whose flat (list) view searches the broad universe while their
  // two-pane view stays scoped to `entries`. See TaskFinder's `flatEntries`.
  const flatEntries = useMemo(
    () => getSearchableTodos(dayTodos).filter((e) => inWorkspace(e.todo, activeWorkspaceId)),
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
      for (const a of ancestorsOf(e.todo, todoById)) {
        if (!byIdInTree.has(a.id)) byIdInTree.set(a.id, { todo: a });
      }
    }
    return [...byIdInTree.values()];
  }, [archivedEntries, todoById]);
  // Ancestry questions all run over `todoById` - the FULL index, archived rows
  // included. See @/features/tasks/model/ancestry: walking the live-only `byId`
  // instead is what let a task read as uncategorized while its Collection cell
  // named a collection. `byId` stays for "is this row in the current entry set"
  // lookups, which is a different question.
  const hasCollectionAncestor = (e: OrganizerEntry): boolean =>
    hasCollAncestor(e.todo, todoById);
  const isDescendantOf = (e: OrganizerEntry, cid: string): boolean =>
    isDescendantOfId(e.todo, cid, todoById);
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
  //
  // Alongside the entries it returns `matchIds`: the rows that actually satisfied
  // the predicate, as opposed to the ancestors re-attached around them. Everything
  // downstream treats that as "is this a hit or just context" - see
  // FlatNode.matchesView, which the table dims.
  const { viewEntries, viewMatchIds } = useMemo((): {
    viewEntries: OrganizerEntry[];
    viewMatchIds: Set<string>;
  } => {
    const v = resolveView(selectedView);
    if (v.source === 'archived') {
      // Everything in the archived slice is a hit; archivedTreeEntries adds the
      // (possibly live) ancestors around them, and those are the context rows.
      return {
        viewEntries: archivedTreeEntries,
        viewMatchIds: new Set(archivedEntries.map((e) => e.todo.id)),
      };
    }
    if (v.scaffold === 'subtree') {
      // A descendant's parents are descendants too, so nothing here is context.
      const list = entries.filter((e) => isDescendantOf(e, selectedView));
      return { viewEntries: list, viewMatchIds: new Set(list.map((e) => e.todo.id)) };
    }

    const ctx: ViewCtx = { hasCollectionAncestor, isDescendantOf };
    const matchIds = new Set<string>();
    const out = new Map<string, OrganizerEntry>();
    // Leaf tasks + each leaf's parent-task chain (collections are added below, so
    // the walk only re-attaches missing task parents to keep subtrees intact).
    //
    // This one walks `byId`, not the full index, and that IS the right domain here:
    // the question isn't "what are this task's ancestors" but "which rows may I add
    // to a live view", and an archived ancestor is not one of them. Entries carry
    // view state, so the walk yields OrganizerEntry rather than Todo.
    for (const e of entries) {
      if (e.todo.isCollection || !v.leaf(e, ctx)) continue;
      out.set(e.todo.id, e);
      matchIds.add(e.todo.id);
      for (const a of ancestorsOf(e.todo, todoById)) {
        const pe = byId.get(a.id);
        if (!pe) break; // archived (or otherwise not live) - the live chain ends here
        if (!a.isCollection && !out.has(a.id)) out.set(a.id, pe);
      }
    }
    if (v.scaffold === 'tree') for (const c of collections) out.set(c.todo.id, c);
    return { viewEntries: [...out.values()], viewMatchIds: matchIds };
  }, [entries, archivedEntries, collections, archivedTreeEntries, selectedView, byId, todoById]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Apply the active filters. A failing row takes its subtree with it - see
  // applyFilters, which the sidebar counts below run too so the badges can't
  // disagree with the rows.
  const filteredEntries = useMemo(
    () => applyFilters(viewEntries, { filters: activeFilters, filterMatch, hideCompleted }, todoById),
    [viewEntries, activeFilters, filterMatch, hideCompleted, todoById]
  );

  // ── In-view search ──────────────────────────────────────────────────────────
  // The toolbar's search box, applied ON TOP of the filters so the two compose
  // (the Filter menu says what the tab contains; search is a lens over that).
  //
  // It runs the Task Finder's own ranker (rankTaskFinderMatches) rather than a
  // second matcher, so the two searches can't drift in what they consider a hit -
  // the tiers, the searchable-field set and the fuzzy guards are all one
  // implementation. The RANKING is discarded: this view has its own sort and
  // grouping, so only the matched set matters, and the limit is lifted (a view
  // filter that silently stopped at 50 rows would just be wrong).
  //
  // Matches are kept WITH their ancestor chain, re-attached for context and left
  // out of `matchIds` so the table dims them - exactly what the view builder above
  // does for its own leaves. That is what keeps a matched subtask under its parent
  // task and its collection header instead of stranded at the root of the tree
  // (the orphaning trap documented on applyFilters). It is also why search can't
  // simply reuse applyFilters, which drops a row whose ancestors fail: a subtask
  // must stay findable when only IT matches the query.
  const searchMatchIds = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null; // inactive - the view keeps its own match set untouched
    return new Set(rankTaskFinderMatches(filteredEntries, todoById, q, Infinity).map((e) => e.todo.id));
  }, [searchQuery, filteredEntries, todoById]);

  // A match brings its whole subtask subtree with it, matched or not - searching
  // for a parent shows what is inside it. This is the Task Finder's rule (see
  // useTaskFinderData's addSubtree), and the two searches now agree about what a
  // hit means in both directions: the Finder already expanded downward, and this
  // view already re-attached upward.
  //
  // It is also what makes creating INSIDE a match safe while a search is running:
  // the new row is a descendant of a match, so the query keeps it on screen
  // instead of filtering it back out from under its own title editor (see
  // PlannerView's canCreateUnder).
  const searchVisibleIds = useMemo(() => {
    if (!searchMatchIds) return null;
    const childrenByParent = new Map<string, OrganizerEntry[]>();
    for (const e of filteredEntries) {
      const pid = e.todo.parentId;
      if (!pid) continue;
      const arr = childrenByParent.get(pid);
      if (arr) arr.push(e); else childrenByParent.set(pid, [e]);
    }
    const out = new Set<string>();
    const addSubtree = (id: string) => {
      if (out.has(id)) return;
      out.add(id);
      for (const c of childrenByParent.get(id) ?? []) addSubtree(c.todo.id);
    };
    for (const id of searchMatchIds) addSubtree(id);
    return out;
  }, [searchMatchIds, filteredEntries]);

  const searchedEntries = useMemo(() => {
    if (!searchVisibleIds) return filteredEntries;
    const keep = new Set<string>();
    for (const e of filteredEntries) {
      if (!searchVisibleIds.has(e.todo.id)) continue;
      keep.add(e.todo.id);
      for (const a of ancestorsOf(e.todo, todoById)) keep.add(a.id);
    }
    return filteredEntries.filter((e) => keep.has(e.todo.id));
  }, [filteredEntries, searchVisibleIds, todoById]);

  // What the table treats as a real hit vs. dimmed scaffolding. While searching,
  // a row must satisfy BOTH the view's own predicate and the query - where "the
  // query" now includes riding in under a matched parent. Intersecting with the
  // view's own match set is what keeps that from over-promoting: an unfinished
  // subtask of a matched completed task is still context in the Completed tab, and
  // still renders dimmed. Ancestors, re-attached above, are context either way.
  const activeMatchIds = useMemo(() => {
    if (!searchVisibleIds) return viewMatchIds;
    return new Set([...searchVisibleIds].filter((id) => viewMatchIds.has(id)));
  }, [searchVisibleIds, viewMatchIds]);

  // Collapse is ignored while searching. The saved collapse set is per-view and
  // DB-synced, so a user with a few folded collections would otherwise search and
  // be told there are no matches while the matches sit inside a fold. Everything
  // reads as expanded for the duration of the query; clearing it restores the real
  // state, which is never written to.
  const effectiveCollapsed = useMemo(
    () => (searchMatchIds ? new Set<string>() : collapsed),
    [searchMatchIds, collapsed]
  );

  // Hide collections that have no visible task descendants (optional section setting).
  // The ancestor walk runs over `todoById`, not `byId`: `byId` covers the non-archived
  // set only, so an archived collection would break the chain and read as empty in the
  // Archived view (and swallow its children's contribution to live grandparents).
  const processedEntries = useMemo(() => {
    if (!sectionsConfig.hideEmptyCollections) return searchedEntries;
    const collWithTasks = new Set<string>();
    for (const e of searchedEntries) {
      if (e.todo.isCollection) continue;
      for (const a of ancestorsOf(e.todo, todoById)) collWithTasks.add(a.id);
    }
    return searchedEntries.filter((e) => !e.todo.isCollection || collWithTasks.has(e.todo.id));
  }, [searchedEntries, sectionsConfig.hideEmptyCollections, todoById]);

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
      for (const a of ancestorsOf(e.todo, todoById)) counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
    }
    return counts;
  }, [processedEntries, todoById]);

  // The entries any row builder starts from: processedEntries (filters +
  // hideEmptyCollections) with hideSubcollections applied. When that setting is on
  // we keep only the tasks sitting directly in the view's root collection - every
  // nested sub-collection and everything inside it is dropped (task→subtask
  // nesting, whose parents are tasks, is preserved).
  //   • picked collection → keep tasks whose nearest collection ancestor is it.
  //   • 'all' / 'uncategorized' → keep top-level collection headers, the tasks
  //     directly under them, and uncategorized tasks; drop nested sub-collections.
  //
  // This used to live inside the `flattened` memo below, which meant it applied in
  // collection-grouped mode only: switching Group by to status/priority/date
  // silently brought the hidden sub-collections' tasks back. It is a statement
  // about which TASKS the view contains, not about how they are laid out, so both
  // builders read it now.
  const visibleEntries = useMemo(() => {
    if (!sectionsConfig.hideSubcollections) return processedEntries;
    return processedEntries.filter((e) => {
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
  }, [processedEntries, sectionsConfig.hideSubcollections, selectedCollectionId, todoById]);

  // Grouped rows - only used when groupBy !== 'collection'.
  const groupedRows = useMemo((): GroupRow[] => {
    if (sectionsConfig.groupBy === 'collection') return [];
    return buildGroupedItems(visibleEntries, sectionsConfig.groupBy, todoById, effectiveCollapsed, sortFn, sectionsConfig.groupSortDirection, activeMatchIds);
  }, [sectionsConfig.groupBy, visibleEntries, todoById, effectiveCollapsed, sortFn, sectionsConfig.groupSortDirection, activeMatchIds]);

  // Rendered rows for collection-grouped (default) mode. leafPosition segregates
  // tasks vs sub-collections. The dragged row stays visible (dimmed), so nothing
  // is excluded during a drag.
  const flattened = useMemo(
    () =>
      flattenTree(visibleEntries, {
        // Flat variants ignore collapse state (nothing to expand/collapse).
        collapsed: showNesting ? effectiveCollapsed : undefined,
        sortFn,
        leafPosition: sectionsConfig.showLeafTasks !== 'none' ? sectionsConfig.showLeafTasks : undefined,
        flat: !showNesting,
        matchIds: activeMatchIds,
      }),
    [visibleEntries, effectiveCollapsed, sortFn, sectionsConfig.showLeafTasks, showNesting, activeMatchIds]
  );
  const flatById = useMemo(() => new Map(flattened.map((n) => [n.id, n])), [flattened]);

  // The tasks the table is currently showing, ignoring collapse state: a folded
  // row is still in the view, it is just not on screen this second. Both row
  // builders now start from `visibleEntries`, so this is simply its task rows -
  // context ancestors excluded (they are scaffolding around a match, drawn dimmed;
  // see FlatNode.matchesView). "Archive completed tasks in view" writes to exactly
  // this set, which is why it is derived here rather than re-filtered at the call
  // site: the button and the rows can't disagree about what the view contains.
  // Keyed on the SEARCH-narrowed match set for that same reason: with a query
  // active, "in view" is what the query left on screen, so "Archive completed
  // tasks in view" can't reach a row the user can't see.
  const renderedTaskEntries = useMemo(
    () => visibleEntries.filter((e) => !e.todo.isCollection && activeMatchIds.has(e.todo.id)),
    [visibleEntries, activeMatchIds]
  );

  // ── Sidebar counts ─────────────────────────────────────────────────────────
  // Tasks only; collections are never counted. Each tab's count runs the same
  // `leaf` predicate AND the same filters the tab renders with (resolved per view
  // id - a tab counted with the VISIBLE tab's filters would just be a different
  // wrong answer), through the same applyFilters the rows go through. A badge can
  // no longer disagree with the list it labels.
  //
  // Most tabs inherit the one workspace-default filter, so the filtered sets are
  // cached by config signature: what looks like 5 + one-per-collection passes over
  // the entry set collapses to one or two in practice.
  const countCtx: ViewCtx = { hasCollectionAncestor, isDescendantOf };
  const counts = useMemo(() => {
    const cache = new Map<string, OrganizerEntry[]>();
    const filteredFor = (viewId: string, source: OrganizerEntry[]) => {
      const state = filtersFor(viewId);
      // hideCompleted is part of the signature: two views with identical rules but
      // a different setting are different result sets, so they can't share a cache
      // entry.
      const key = `${source === archivedEntries ? 'a' : 'o'}|${state.filterMatch}|${
        state.hideCompleted ? 'h' : '-'
      }|${JSON.stringify(
        state.filters.filter((f) => f.value).map((f) => [f.field, f.condition, f.value])
      )}`;
      let out = cache.get(key);
      if (!out) {
        out = applyFilters(source, state, todoById);
        cache.set(key, out);
      }
      return out;
    };
    const countLeaves = (v: ViewDef) => {
      const source = v.source === 'archived' ? archivedEntries : entries;
      // Filter first, then apply the leaf predicate: filtering is what the subtree
      // rule needs the full parent chain for, and the predicate is per-row anyway.
      return filteredFor(v.id, source).filter(
        (e) => !e.todo.isCollection && v.leaf(e, countCtx)
      ).length;
    };
    // Task-descendant count per collection, computed in one ancestor walk over the
    // collection view's filtered set instead of re-filtering per sidebar row.
    const perCollection = new Map<string, number>();
    for (const c of collections) {
      const cid = c.todo.id;
      let n = 0;
      for (const e of filteredFor(cid, entries)) {
        if (e.todo.isCollection) continue;
        if (collectionAncestors(e.todo, todoById).has(cid)) n++;
      }
      perCollection.set(cid, n);
    }
    const perView = new Map<string, number>();
    for (const v of Object.values(PLANNER_VIEWS)) perView.set(v.id, countLeaves(v));
    return { perView, perCollection };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, archivedEntries, collections, todoById, filtersFor]);

  const allCount = counts.perView.get('all') ?? 0;
  const uncategorizedCount = counts.perView.get('uncategorized') ?? 0;
  const categorizedCount = counts.perView.get('categorized') ?? 0;
  const inDailyListCount = counts.perView.get('in-daily-list') ?? 0;
  const archivedCount = counts.perView.get('archived') ?? 0;
  const completedCount = counts.perView.get('completed') ?? 0;
  const collectionCount = (cid: string) => counts.perCollection.get(cid) ?? 0;

  const currentCount = selectedCollectionId
    ? collectionCount(selectedCollectionId)
    : counts.perView.get(view.id) ?? 0;
  const selectedCollectionEntry = selectedCollectionId ? byId.get(selectedCollectionId) || null : null;
  const viewLabel = selectedCollectionId
    ? selectedCollectionEntry?.todo.text || 'Untitled collection'
    : view.label;

  return {
    entries,
    flatEntries,
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
    // Whether the toolbar's search box is narrowing the rows right now. The table
    // needs it for its empty state ("nothing matched" vs. "this view is empty"),
    // and the caller to suppress drag-to-reorder over a partial list.
    searchActive: searchMatchIds !== null,
    // The tasks a running search is keeping on screen: the hits plus everything
    // nested under them. A create is only offered under one of these while a
    // search is active, since a new row survives the query exactly when it arrives
    // as a match's descendant (see PlannerView's canCreateUnder). Empty when no
    // search is running - callers gate on `searchActive` first.
    searchVisibleTaskIds: searchVisibleIds ?? EMPTY_ID_SET,
    // The collapse set the rows were actually built from - empty while searching.
    // The table reads it for its chevrons, so they can't point "collapsed" at a
    // row whose children are on screen.
    effectiveCollapsed,
    processedEntries,
    visibleTaskCounts,
    groupedRows,
    flattened,
    flatById,
    renderedTaskEntries,
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
