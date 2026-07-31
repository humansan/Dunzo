import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { DayTodos, Todo, Workspace } from '@shared/types';
import {
  OrganizerEntry,
  CollectionOption,
} from '@/features/tasks/model';
import { ColKey, COLUMNS, EditState } from '@/features/planner/types';
import { collectionSlot } from '@/theme/collectionColor';
import {
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
} from '@/features/planner/constants';
import { useSyncedSet, useSyncedLayout, resolveAction } from '@/lib/query/settings';
import { useHubViewConfig } from '@/features/planner/hooks/useHubViewConfig';
import { useHubData } from '@/features/planner/hooks/useHubData';
import { useCollectionDnD } from '@/features/planner/hooks/useCollectionDnD';
import { useRowDnD } from '@/features/planner/hooks/useRowDnD';
import { HubSidebar } from '@/features/planner/sidebar/HubSidebar';
import { HubToolbar, ToolbarMenuKey } from '@/features/planner/toolbar/HubToolbar';
import { groupCreateSpec, buildFilterCreatePatch } from '@/features/planner/model/viewUtils';
import { resolveView } from '@/features/planner/views';
import { isDone } from '@/features/tasks/model';
import { TaskTable } from '@/features/planner/table/TaskTable';
import { VARIANTS } from '@/features/planner/variant';
import { TaskFinder } from '@/features/planner/task-finder';
import { FieldsMenu } from '@/features/planner/toolbar/FieldsMenu';
import { FilterMenu } from '@/features/planner/toolbar/FilterMenu';
import { SortMenu } from '@/features/planner/toolbar/SortMenu';
import { SectionsMenu } from '@/features/planner/toolbar/SectionsMenu';
import { CollectionEditModal } from '@/features/planner/sidebar/CollectionEditModal';
import { CellEditorPopover } from '@/features/planner/table/CellEditorPopover';
import { RowContextMenu } from '@/features/planner/table/RowContextMenu';
import { DeleteCollectionModal } from '@/features/planner/sidebar/DeleteCollectionModal';
import { useStableCallback } from '@/common/hooks/useStableCallback';
import { flattenTree, orderFromFlat } from '@/features/planner/sidebar/treeUtils';

interface PlannerViewProps {
  dayTodos: DayTodos[];
  // Collections available to assign (active-workspace scoped) + helpers.
  collectionOptions: CollectionOption[];
  onSetTaskCollection: (taskId: string, collectionId: string | null) => void;
  onCreateCollection: (name: string) => string;
  // Save an edited todo. The task owns its scheduled day via `dueDate`, so the
  // updated todo is the entire payload.
  onSaveTodo: (updatedTodo: Todo) => void;
  // Create a hub task. `opts` lets a grouped-view "+" seed the task with a calendar
  // date and/or field patch (status/priority) so it lands in the section it was
  // added from, and `parentId` parents it to a collection so it inherits the
  // selected collection / active filters of the current view.
  onAddTodo: (opts?: { date?: string | null; patch?: Partial<Todo>; parentId?: string | null }) => string;
  onAddSubtask: (parentId: string) => string;
  // Create a fresh collection (top-level, or nested when a parentId is given);
  // returns its id for select + rename.
  onAddCollection: (parentId?: string | null) => string;
  onDeleteTodo: (id: string) => void;
  // Delete a collection: 'cascade' removes its whole subtree; 'promote' keeps
  // the tasks/sub-collections and moves them up one level.
  onDeleteCollection: (id: string, mode: 'cascade' | 'promote') => void;
  onArchiveTodo: (id: string) => void;
  // Persist hub order + nesting (position = hubOrder, parentId = nesting).
  onReorder: (items: { id: string; parentId: string | null }[]) => void;
  onToggleTodo: (id: string) => void;
  // Workspaces (independent todo databases). Selecting one scopes the planner.
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onAddWorkspace: () => string;
  onRenameWorkspace: (id: string, name: string) => void;
  // The selected collection/view is URL-driven (/planner/$collectionId, bare = 'all').
  // `opts.editCollection` opens that collection's edit modal on arrival - selecting
  // a view remounts this component, so the two must travel in one navigation.
  selectedView: string;
  onSelectView: (view: string, opts?: { editCollection?: string }) => void;
  // Id of the collection whose Edit modal (name / color / parent) is open, and the
  // setter for it. URL-driven for the same reason (see features/planner/search.ts).
  editCollId: string | null;
  onEditCollection: (id: string | null) => void;
  // Whether `dayTodos` has finished loading - see useHubData.
  dataReady: boolean;
  // Opening a task navigates to /task/$taskId (the shared full-view route).
  onOpenTask: (id: string) => void;
}

export const PlannerView: React.FC<PlannerViewProps> = ({
  dayTodos,
  collectionOptions,
  onSetTaskCollection,
  onCreateCollection,
  onSaveTodo,
  onAddTodo,
  onAddSubtask,
  onAddCollection,
  onDeleteTodo,
  onDeleteCollection,
  onArchiveTodo,
  onReorder,
  onToggleTodo,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  selectedView,
  onSelectView,
  editCollId,
  onEditCollection,
  dataReady,
  onOpenTask,
}) => {
  // ── Collapse state (DB-synced) ─────────────────────────────────────────────
  // Table row collapse and sidebar collection-tree collapse (both feed the data
  // layer below, so they're declared first). Sidebar collapse + the selected view
  // + sidebar sizing share the single `hubLayout` settings blob.
  const [collapsed, setCollapsed] = useSyncedSet('hubCollapsed');
  const toggleCollapse = useStableCallback((id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    }));

  const [layout, patchLayout] = useSyncedLayout();
  const collapsedColls = useMemo(() => new Set(layout.sidebarCollapsed ?? []), [layout.sidebarCollapsed]);
  const setCollapsedColls: React.Dispatch<React.SetStateAction<Set<string>>> = (action) =>
    patchLayout((prev) => ({
      sidebarCollapsed: [...resolveAction(action, new Set(prev.sidebarCollapsed ?? []))],
    }));
  const toggleCollColl = (id: string) =>
    setCollapsedColls((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // ── Sidebar selection (which collection / view the table shows) ────────────
  // URL-driven now: `selectedView` is a prop from the route (/planner/$collectionId,
  // bare = 'all'). Alias the setter to the route navigator so existing call sites
  // (reset-to-all on new workspace, the sidebar select) are unchanged. viewMode and
  // the per-view config below stay DB-synced.
  const setSelectedView = onSelectView;

  // Which view renders the data: the spreadsheet-style table (default) or the
  // Todoist-style single-column list. A global UI preference (like selectedView).
  const viewMode: 'table' | 'list' = layout.viewMode === 'list' ? 'list' : 'table';
  const setViewMode = (m: 'table' | 'list') => patchLayout(() => ({ viewMode: m }));
  // The persisted table/list toggle selects a view-variant descriptor; TaskTable
  // and its rows read presentation off this instead of a `listView` boolean.
  const variant = viewMode === 'list' ? VARIANTS.list : VARIANTS.table;

  // Per-view layout + column widths (field order/visibility, filters, sorts,
  // section settings, resizable columns) - keyed by workspace + view.
  const {
    fieldOrder,
    hiddenFields,
    wrappedFields,
    activeFilters,
    filterMatch,
    activeSorts,
    sectionsConfig,
    updateViewState,
    applyToAllViews,
    colByKey,
    toggleField,
    toggleWrap,
    moveField,
    visibleColumns,
    lastColKey,
    gridTemplateColumns,
    startResize,
  } = useHubViewConfig(activeWorkspaceId, selectedView);

  // Derived data layer: entry indexes, the collection tree, filtered/grouped row
  // lists, and per-collection counts.
  const {
    entries,
    archivedEntries,
    selectedCollectionId,
    byId,
    todoById,
    collPathById,
    hasCollectionAncestor,
    isDescendantOf,
    collections,
    collChildren,
    visibleCollections,
    viewEntries,
    uniqueValues,
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
  } = useHubData({
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
    showNesting: variant.showNesting,
  });

  // ── Toolbar menu anchor states ────────────────────────────────────────────────
  const [sectionsMenu, setSectionsMenu] = useState<{ right: number; top: number } | null>(null);
  const [fieldsMenu, setFieldsMenu] = useState<{ right: number; top: number } | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ right: number; top: number } | null>(null);
  const [sortMenu, setSortMenu] = useState<{ right: number; top: number } | null>(null);

  const closeToolbarMenus = () => {
    setSectionsMenu(null);
    setFieldsMenu(null);
    setFilterMenu(null);
    setSortMenu(null);
  };

  // Toggle a toolbar menu open below its button: close every menu first (so only
  // one is ever open), then - unless this one was already open (toggle off) -
  // anchor it to the button's bottom-right.
  const toggleToolbarMenu = (
    e: React.MouseEvent,
    isOpen: boolean,
    setter: (v: { right: number; top: number } | null) => void
  ) => {
    closeToolbarMenus();
    if (isOpen) return;
    const r = e.currentTarget.getBoundingClientRect();
    setter({ right: window.innerWidth - r.right, top: r.bottom + 6 });
  };

  // Close all toolbar menus when the sidebar view changes.
  useEffect(() => { closeToolbarMenus(); }, [selectedView]);

  // Toolbar button → its menu's open state + setter, for HubToolbar.
  const toolbarMenuOpen = {
    sections: !!sectionsMenu,
    fields: !!fieldsMenu,
    filter: !!filterMenu,
    sort: !!sortMenu,
  };
  const onToggleMenu = (which: ToolbarMenuKey, e: React.MouseEvent) => {
    const setter =
      which === 'sections' ? setSectionsMenu
      : which === 'fields' ? setFieldsMenu
      : which === 'filter' ? setFilterMenu
      : setSortMenu;
    toggleToolbarMenu(e, toolbarMenuOpen[which], setter);
  };

  // ── Cell editing ───────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<EditState>(null);
  const startEdit = useStableCallback((id: string, col: ColKey, e: React.MouseEvent) => {
    setEditing({ id, col, rect: e.currentTarget.getBoundingClientRect() });
  });
  const stopEdit = useStableCallback(() => setEditing(null));

  // Close the tags/notes popover when clicking outside it. A non-blocking listener
  // (vs. a full-screen overlay) lets the click also land on another cell, so a single
  // click both closes this editor and opens the next one.
  const popoverRef = useRef<HTMLDivElement>(null);
  const POPOVER_COLS: ColKey[] = ['collection', 'notes', 'status', 'priority', 'startDate', 'date', 'start', 'end', 'xp'];
  const popoverOpen = !!editing && POPOVER_COLS.includes(editing.col);
  useEffect(() => {
    if (!popoverOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current?.contains(target)) return;
      setEditing(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [popoverOpen]);

  // ── Popover / context-menu placement ───────────────────────────────────────
  // Both popups are portaled to <body> and positioned in JS. When their anchor
  // sits near the bottom (or right) of the viewport, the default position would
  // clip them. After mount we measure the popup and flip / clamp it to fit.
  const MARGIN = 8;

  // Place a box of (w, h) at a preferred origin, flipping vertically when it
  // would clip below and clamping to the viewport edges otherwise.
  function fitPlacement(
    preferred: { top: number; left: number },
    size: { width: number; height: number },
    flipY: (h: number) => number,
  ): { top: number; left: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const belowTop = preferred.top;
    const aboveTop = flipY(size.height);
    let top = belowTop;
    if (belowTop + size.height > vh - MARGIN && aboveTop >= MARGIN) {
      top = aboveTop;
    }
    if (top + size.height > vh - MARGIN) top = Math.max(MARGIN, vh - size.height - MARGIN);
    if (top < MARGIN) top = MARGIN;
    let left = preferred.left;
    if (left + size.width > vw - MARGIN) left = Math.max(MARGIN, vw - size.width - MARGIN);
    if (left < MARGIN) left = MARGIN;
    return { top, left };
  }

  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const placePopover = useCallback(() => {
    if (!editing || !editing.rect || !popoverRef.current) {
      setPopoverPos(null);
      return;
    }
    const el = popoverRef.current;
    setPopoverPos(
      fitPlacement(
        { top: editing.rect.bottom + 4, left: editing.rect.left },
        { width: el.offsetWidth, height: el.offsetHeight },
        (h) => editing.rect!.top - h - 4,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, editing?.col]);

  useLayoutEffect(placePopover, [placePopover]);

  // A panel whose content shrinks (the collection list, as the search narrows)
  // keeps its measured `top`. Below the cell that's fine, but a panel flipped
  // ABOVE is bottom-aligned to the cell, so its bottom edge would lift away and
  // leave a gap. Re-place it whenever the panel's size changes.
  useEffect(() => {
    const el = popoverRef.current;
    if (!popoverOpen || !el) return;
    const ro = new ResizeObserver(() => placePopover());
    ro.observe(el);
    return () => ro.disconnect();
  }, [popoverOpen, placePopover]);

  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // ── Row context menu & full-view ───────────────────────────────────────────
  const [menu, setMenu] = useState<{ id: string; x: number; y: number, sidebar?: true } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false); // "Change color" sub-panel
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) {
      setMenuPos(null);
      return;
    }
    const el = menuRef.current;
    setMenuPos(
      fitPlacement(
        { top: menu.y, left: menu.x },
        { width: el.offsetWidth, height: el.offsetHeight },
        (h) => menu.y - h,
      ),
    );
  }, [menu?.x, menu?.y]);
  // Id of the collection pending a delete decision (cascade vs. promote).
  const [deleteCollId, setDeleteCollId] = useState<string | null>(null);
  // Task id being reparented via the "Move to…" picker (null = picker closed).
  const [reparentId, setReparentId] = useState<string | null>(null);
  const openMenu = useStableCallback((id: string, x: number, y: number, sidebar?: true) => { setMenu({ id, x, y, sidebar }); setColorPickerOpen(false); });
  const closeMenu = () => { setMenu(null); setColorPickerOpen(false); };

  // Entry lookup spanning both sets. Anything reachable from the Archived view has
  // to go through this rather than `byId`/`entries`, which cover the non-archived
  // organizer set only and would silently miss the row the user is acting on.
  const findEntry = (id: string): OrganizerEntry | null =>
    byId.get(id) || archivedEntries.find((e) => e.todo.id === id) || null;

  // The todo the context menu currently targets (to branch task vs. collection items).
  const menuEntry = menu ? findEntry(menu.id) : null;

  // Convert a plain task into a top-level collection: flag it, give it a default
  // color, strip the task-only fields, and clear its due date (undated) so it
  // can never leak onto the daily checklist.
  const makeCollection = (entry: OrganizerEntry) => {
    onSaveTodo({
      ...entry.todo,
      isCollection: true,
      color: collectionSlot(entry.todo.color),
      parentId: null,
      status: undefined,
      dueDate: undefined,
      startTime: undefined,
      dueTime: undefined,
      xp: undefined,
      notes: undefined,
    });
  };
  const setCollectionColor = (entry: OrganizerEntry, color: string) =>
    onSaveTodo({ ...entry.todo, color });

  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const handleNewWorkspace = () => {
    const id = onAddWorkspace();
    setSelectedView('all');
    setRenamingWorkspaceId(id);
  };

  // ── Left-pane sizing (DB-synced via the hubLayout blob) ────────────────────
  const rawSidebarWidth = layout.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH;
  const sidebarWidth =
    rawSidebarWidth >= MIN_SIDEBAR_WIDTH && rawSidebarWidth <= MAX_SIDEBAR_WIDTH
      ? rawSidebarWidth
      : DEFAULT_SIDEBAR_WIDTH;
  const setSidebarWidth = (w: number) => patchLayout(() => ({ sidebarWidth: w }));
  const sidebarHidden = layout.sidebarHidden ?? false;
  const setSidebarHidden: React.Dispatch<React.SetStateAction<boolean>> = (action) =>
    patchLayout((prev) => ({ sidebarHidden: resolveAction(action, prev.sidebarHidden ?? false) }));

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startW + (ev.clientX - startX)));
      setSidebarWidth(w);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Sidebar collection drag-and-drop (reorder + nest), owns the sidebar auto-scroll.
  const collectionDnD = useCollectionDnD({ entries, collections, byId, isDescendantOf, onReorder, setCollapsedColls });

  // Create → select → open the name/color modal, in ONE navigation. Selecting the
  // new collection swaps the planner route (/planner → /planner/$collectionId),
  // which unmounts this component, so "open the modal" has to be part of the
  // navigation rather than a state update queued next to it.
  const handleNewCollection = () => {
    const id = onAddCollection();
    setSelectedView(id, { editCollection: id });
  };
  // Context-menu "Create nested collection": add a child under the target, ensure
  // the parent is expanded so the new node is visible, then select it and open its
  // edit modal (mirrors the top-level New collection flow). Collapse state is
  // DB-synced, so it survives the remount that the navigation causes.
  const handleNewNestedCollection = (parentId: string, sidebar?: true) => {
    const id = onAddCollection(parentId);
    setCollapsedColls((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    sidebar && setSelectedView(id, { editCollection: id });
  };
  // Seed patch derived from the view's active filters: any "is <value>" filter is
  // pre-applied to tasks created in this view, so a new task still satisfies the
  // filters (and stays visible) right after creation. Collection membership is
  // handled separately via `selectedCollectionId` as the new task's parent.
  const inheritedFilterPatch = useMemo(
    () => buildFilterCreatePatch(activeFilters),
    [activeFilters]
  );

  // Whether the current view offers task creation (the Archived view doesn't).
  const viewAllowsNew = resolveView(selectedView).allowNew;
  // What a task created in this view needs to remain visible here — e.g. the In
  // Daily List tab seeds the daily flag + today's date. Evaluated per create so
  // dynamic values (today) stay fresh; the view's active filters still win on
  // conflict since those are the user's explicit, in-view constraints.
  const viewCreateArgs = (): { date?: string | null; patch: Partial<Todo> } => {
    const seed = resolveView(selectedView).createSeed?.();
    return { date: seed?.date, patch: { ...seed?.patch, ...inheritedFilterPatch } };
  };

  // The table's "New" button adds into the selected collection (else top-level),
  // inherits the active filters + view seed, then drops straight into the new
  // row's title field so you can type the name without a second click.
  const handleNewInView = () => {
    const seed = viewCreateArgs();
    const id = onAddTodo({ parentId: selectedCollectionId, date: seed.date, patch: seed.patch });
    if (selectedCollectionId) {
      // Make sure the parent isn't collapsed, or the new row would be hidden.
      setCollapsed((prev) => { const n = new Set(prev); n.delete(selectedCollectionId); return n; });
    }
    setEditing({ id, col: 'title', rect: null });
  };
  // The "+" on a collection section header (collection grouping): parent the task
  // to that collection and seed the active filters + view so it stays visible.
  const handleQuickAddTask = useStableCallback((parentId: string) => {
    const seed = viewCreateArgs();
    const id = onAddTodo({ parentId, date: seed.date, patch: seed.patch });
    setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    setEditing({ id, col: 'title', rect: null });
  });
  // The "+" on an attribute-grouped section header: create a task seeded with the
  // view seed + active filters AND the section's attribute/date (the section wins
  // on conflict so it lands there), parent it to the selected collection so a
  // collection view keeps it, expand the section if collapsed, focus the new row.
  const handleQuickAddInGroup = useStableCallback((groupValue: string) => {
    const { date, patch } = groupCreateSpec(sectionsConfig.groupBy, groupValue);
    const seed = viewCreateArgs();
    const id = onAddTodo({
      date: date ?? seed.date,
      patch: { ...seed.patch, ...patch },
      parentId: selectedCollectionId,
    });
    const headerId = `__grp:${sectionsConfig.groupBy}:${groupValue}`;
    setCollapsed((prev) => { const n = new Set(prev); n.delete(headerId); return n; });
    setEditing({ id, col: 'title', rect: null });
  });

  // Context-menu "Create task inside": add a subtask, expand the parent so the
  // new row is visible, close the menu, and drop into its title field.
  const createTaskInside = (parentId: string, sidebar?: true) => {
    const id = onAddSubtask(parentId);
    setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    sidebar && setSelectedView(parentId, { editCollection: undefined });
    closeMenu();
    setEditing({ id, col: 'title', rect: null });
  };

  // Splice `id` in next to `anchorId` among its siblings and persist the whole
  // tree order (same mechanism the row drag-and-drop commit uses). A freshly
  // created task starts at the bottom, so this is what moves it into place.
  //
  // The new node MUST take its parent from the anchor's node in this flat list,
  // not from the anchor todo's real parentId. In a collection view the collection
  // node itself is excluded from the entries, so flattenTree reads its direct
  // children as parentId null (see useHubData's 'subtree' scaffold) - handing in
  // the real collection id would file the new node under a parent that has no
  // node here, orderFromFlat's walk would never reach it, and its unreachable-node
  // fallback would append it at the very end. That is the bug this comment exists
  // to prevent a repeat of. The `selectedCollectionId` re-anchor below turns the
  // null back into the collection on save, exactly as it does for every other row.
  const placeRelative = (id: string, anchorId: string, pos: 'above' | 'below') => {
    const full = flattenTree(processedEntries).map((n) => ({ id: n.id, parentId: n.parentId }));
    const at = full.findIndex((n) => n.id === anchorId);
    if (at === -1) return;
    const parentId = full[at].parentId;
    full.splice(pos === 'above' ? at : at + 1, 0, { id, parentId });
    let order = orderFromFlat(full);
    // In a collection view the collection node is hidden, so its direct children
    // read as depth-0 (parentId null). Re-anchor them to the collection on save.
    if (selectedCollectionId) order = order.map((n) => ({ id: n.id, parentId: n.parentId ?? selectedCollectionId }));
    onReorder(order);
  };

  // Context-menu "Add task above/below": create a sibling of the target, seeded
  // with the view's active filters so it stays visible, then edit its title.
  const addTaskRelative = (anchorId: string, pos: 'above' | 'below') => {
    const anchor = byId.get(anchorId);
    if (!anchor) return;
    // Create it under the anchor's REAL parent (so it's genuinely nested where the
    // anchor is); placeRelative works out where it sits in the rendered order.
    const parentId = anchor.todo.parentId ?? null;
    // Seed the view predicate + filters so the sibling stays visible; keep the
    // anchor's own date (don't force the view seed's date) so it lands in place.
    const id = onAddTodo({ parentId, patch: viewCreateArgs().patch });
    placeRelative(id, anchorId, pos);
    closeMenu();
    setEditing({ id, col: 'title', rect: null });
  };

  // Context-menu Duplicate: copy every field except identity and the stamps that
  // belong to the original, and drop the copy directly below it.
  const duplicateTask = (id: string) => {
    const todo = menuEntry?.todo;
    if (!todo) return;
    const fields: Partial<Todo> = { ...todo };
    delete fields.id;
    delete fields.createdAt;
    delete fields.hubOrder;
    delete fields.completedAt;
    delete fields.trackingStartedAt;
    delete fields.deletedAt;
    const parentId = todo.parentId ?? null;
    const copyId = onAddTodo({ parentId, patch: fields });
    placeRelative(copyId, id, 'below');
    closeMenu();
  };

  // Context-menu Set date / Set time. Clearing the end time drops the start time
  // with it (a start with no end is meaningless).
  const setTaskDate = (date: string) => {
    if (!menuEntry) return;
    onSaveTodo({ ...menuEntry.todo, dueDate: date || undefined });
  };
  const setTaskTime = (time: string) => {
    if (!menuEntry) return;
    onSaveTodo({
      ...menuEntry.todo,
      dueTime: time || undefined,
      startTime: time ? menuEntry.todo.startTime : undefined,
    });
  };

  // Context-menu Delete: a non-empty collection prompts cascade-vs-promote;
  // empty collections and plain tasks delete straight away.
  const requestDeleteFromMenu = (id: string) => {
    const entry = findEntry(id);
    const hasChildren = (e: OrganizerEntry) => (e.todo.parentId ?? null) === id;
    if (entry?.todo.isCollection && (entries.some(hasChildren) || archivedEntries.some(hasChildren))) {
      setDeleteCollId(id);
    } else {
      onDeleteTodo(id);
    }
    closeMenu();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditing(null); setMenu(null); setColorPickerOpen(false);
        setSectionsMenu(null); setFieldsMenu(null); setFilterMenu(null); setSortMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Table row drag-and-drop (reorder + nest in tree mode; reorder + cross-section
  // reassignment in attribute-grouped mode). Owns the table auto-scroll.
  const dnd = useRowDnD({
    entries,
    processedEntries,
    flattened,
    flatById,
    groupedRows,
    byId,
    isDescendantOf,
    selectedCollectionId,
    sectionsConfig,
    onReorder,
    onSaveTodo,
    clearInteraction: () => { setEditing(null); setMenu(null); },
  });

  // Auto-archive: when a task is being completed and the setting is on, mark it
  // complete first (so the checkbox visibly fills) and archive it a beat later, so it
  // doesn't vanish before the completion even registers.
  const handleToggleTodo = useStableCallback((id: string) => {
    if (sectionsConfig.autoArchive) {
      const entry = entries.find((e) => e.todo.id === id);
      if (entry && !isDone(entry.todo)) {
        onToggleTodo(id);
        setTimeout(() => onArchiveTodo(id), 500);
        return;
      }
    }
    onToggleTodo(id);
  });

  // The popover (tags/notes/status/priority) edits the entry currently being edited.
  // Falls back to the archived set - like `menuEntry` - so cells stay editable in the
  // Archived view. Without it the lookup misses, the popover never mounts, and only
  // the Name cell (whose editor is inline in HubRow) appears to respond to a click.
  const editingEntry =
    editing && POPOVER_COLS.includes(editing.col)
      ? entries.find((e) => e.todo.id === editing.id) ||
        archivedEntries.find((e) => e.todo.id === editing.id) ||
        null
      : null;


  // Reparent picker: the moved task + a stable "can't be a new parent" predicate
  // (itself + its whole subtree, so the move can't create a cycle).
  const reparentTarget = reparentId ? byId.get(reparentId)?.todo ?? null : null;
  const reparentDisabled = useMemo(
    () => (id: string) => id === reparentId || (byId.get(id) ? isDescendantOf(byId.get(id)!, reparentId!) : false),
    [reparentId, byId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="h-full flex">
      {/* Left pane - full-height collection picker (resizable) */}
      {!sidebarHidden && (
        <HubSidebar
          sidebarWidth={sidebarWidth}
          startSidebarResize={startSidebarResize}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          renamingWorkspaceId={renamingWorkspaceId}
          setRenamingWorkspaceId={setRenamingWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onNewWorkspace={handleNewWorkspace}
          selectedView={selectedView}
          setSelectedView={setSelectedView}
          allCount={allCount}
          uncategorizedCount={uncategorizedCount}
          archivedCount={archivedCount}
          completedCount={completedCount}
          inDailyListCount={inDailyListCount}
          categorizedCount={categorizedCount}
          visibleCollections={visibleCollections}
          collectionCount={collectionCount}
          collapsedColls={collapsedColls}
          toggleCollColl={toggleCollColl}
          openMenu={openMenu}
          onNewCollection={handleNewCollection}
          dnd={collectionDnD}
        />
      )}

      {/* Right pane - header + task table */}
      <div className="flex-1 min-w-0 flex flex-col">
        <HubToolbar
          sidebarHidden={sidebarHidden}
          onToggleSidebar={() => setSidebarHidden((v) => !v)}
          viewMode={viewMode}
          onSetViewMode={setViewMode}
          selectedCollectionId={selectedCollectionId}
          todoById={todoById}
          viewLabel={viewLabel}
          currentCount={currentCount}
          filterCount={activeFilters.length}
          sortCount={activeSorts.length}
          menuOpen={toolbarMenuOpen}
          onToggleMenu={onToggleMenu}
        />

        {/* Body - the single shared table/list surface selected by the variant. */}
        <TaskTable
            variant={variant}
            model={{
              columns: visibleColumns,
              gridTemplateColumns,
              lastColKey,
              wrappedFields,
              startResize,
              sectionsConfig,
              flattened,
              groupedRows,
              collPathById,
              visibleTaskCounts,
              todoById,
              collapsed,
              selectedCollectionId,
              selectedView,
              viewLabel,
              currentCount
            }}
            interaction={{ editing, startEdit, stopEdit, openMenu, toggleCollapse }}
            rowHandlers={{
              onSaveTodo,
              onToggleTodo: handleToggleTodo,
              onAddSubtask,
              onQuickAddTask: viewAllowsNew ? handleQuickAddTask : undefined,
              onQuickAddInGroup: viewAllowsNew ? handleQuickAddInGroup : undefined,
              onNewInView: viewAllowsNew ? handleNewInView : undefined,
              onOpenTask,
            }}
            dnd={dnd}
            bottomSpacer
          />
      </div>

      {/* Sections menu - view-level settings */}
      {sectionsMenu && createPortal(
        <SectionsMenu
          anchor={sectionsMenu}
          config={sectionsConfig}
          onChange={(cfg) => updateViewState({ sections: cfg })}
          onSetForAll={() => applyToAllViews('sections')}
          onClose={() => setSectionsMenu(null)}
        />,
        document.body
      )}

      {/* Fields menu - reorder (drag) + show/hide the table's columns */}
      {fieldsMenu && createPortal(
        <FieldsMenu
          anchor={fieldsMenu}
          order={fieldOrder}
          colByKey={colByKey}
          hidden={hiddenFields}
          wrapped={wrappedFields}
          onMove={moveField}
          onToggle={toggleField}
          onToggleWrap={toggleWrap}
          onSetForAll={() => applyToAllViews('fields')}
          onClose={() => setFieldsMenu(null)}
        />,
        document.body
      )}

      {/* Filter menu */}
      {filterMenu && createPortal(
        <FilterMenu
          anchor={filterMenu}
          filters={activeFilters}
          match={filterMatch}
          allColumns={COLUMNS}
          uniqueValues={uniqueValues}
          onChange={(f) => updateViewState({ filters: f })}
          onChangeMatch={(m) => updateViewState({ filterMatch: m })}
          onSetForAll={() => applyToAllViews('filter')}
          onClose={() => setFilterMenu(null)}
        />,
        document.body
      )}

      {/* Sort menu */}
      {sortMenu && createPortal(
        <SortMenu
          anchor={sortMenu}
          sorts={activeSorts}
          allColumns={COLUMNS}
          onChange={(s) => updateViewState({ sorts: s })}
          onSetForAll={() => applyToAllViews('sort')}
          onClose={() => setSortMenu(null)}
        />,
        document.body
      )}

      {/* Inline-cell editor popover (portal, escapes the scroll container) */}
      {editing && editingEntry && editing.rect && (
        <CellEditorPopover
          editing={editing}
          entry={editingEntry}
          popoverRef={popoverRef}
          popoverPos={popoverPos}
          collectionOptions={collectionOptions}
          todoById={todoById}
          onSaveTodo={onSaveTodo}
          onSetTaskCollection={onSetTaskCollection}
          onCreateCollection={onCreateCollection}
          onClose={stopEdit}
        />
      )}

      {/* Right-click / 3-dot context menu. The four create actions are passed only
          when the view supports creation (viewAllowsNew) - an undefined handler
          renders no item. In Archived that isn't cosmetic: the new child would
          inherit its parent's archived state (shared/domain/todoArchive) and vanish
          into the row it was created under. */}
      {menu && (
        <RowContextMenu
          menu={menu}
          menuPos={menuPos}
          menuRef={menuRef}
          entry={menuEntry}
          colorPickerOpen={colorPickerOpen}
          onToggleColorPicker={() => setColorPickerOpen((v) => !v)}
          onClose={closeMenu}
          onEditCollection={(id) => { onEditCollection(id); closeMenu(); }}
          onCreateTaskInside={viewAllowsNew ? createTaskInside : undefined}
          onCreateNestedCollection={viewAllowsNew ? ((id, sidebar) => { handleNewNestedCollection(id, sidebar); closeMenu(); }) : undefined}
          onChangeColor={(entry, color) => { setCollectionColor(entry, color); closeMenu(); }}
          onMakeCollection={(entry) => { makeCollection(entry); closeMenu(); }}
          onMoveTo={(id) => { setReparentId(id); closeMenu(); }}
          onExpand={(id) => { onOpenTask(id); closeMenu(); }}
          onDuplicate={viewAllowsNew ? duplicateTask : undefined}
          onSetDate={(_id, date) => setTaskDate(date)}
          onSetTime={(_id, time) => setTaskTime(time)}
          onAddTaskAbove={viewAllowsNew ? ((id) => addTaskRelative(id, 'above')) : undefined}
          onAddTaskBelow={viewAllowsNew ? ((id) => addTaskRelative(id, 'below')) : undefined}
          onArchive={(id) => {
            if (menuEntry?.todo.archived) onSaveTodo({ ...menuEntry.todo, archived: false });
            else onArchiveTodo(id);
            closeMenu();
          }}
          onDelete={requestDeleteFromMenu}
        />
      )}

      {/* Edit-collection modal: rename, recolor, and re-parent */}
      {editCollId && (() => {
        const entry = entries.find((e) => e.todo.id === editCollId);
        // A just-created collection reaches the cache a beat after the navigation
        // that named it, so render nothing until it shows up rather than clearing
        // the param - clearing on the first miss is what used to swallow the
        // new-collection editor.
        if (!entry) return null;
        return createPortal(
          <CollectionEditModal
            entry={entry}
            options={collectionOptions}
            onCreateCollection={onCreateCollection}
            onClose={() => onEditCollection(null)}
            onSave={({ text, color, parentId }) => {
              onSaveTodo({ ...entry.todo, text, color, parentId });
              onEditCollection(null);
            }}
          />,
          document.body
        );
      })()}

      {/* Delete-collection modal: cascade vs. move tasks up one level */}
      {deleteCollId && (() => {
        const coll = findEntry(deleteCollId);
        if (!coll) { setDeleteCollId(null); return null; }
        const parentColl = coll.todo.parentId ? findEntry(coll.todo.parentId) : null;
        return createPortal(
          <DeleteCollectionModal
            name={coll.todo.text || 'Untitled collection'}
            promoteTarget={parentColl?.todo.text || 'Uncategorized'}
            onPromote={() => { onDeleteCollection(deleteCollId, 'promote'); setDeleteCollId(null); }}
            onCascade={() => { onDeleteCollection(deleteCollId, 'cascade'); setDeleteCollId(null); }}
            onClose={() => setDeleteCollId(null)}
          />,
          document.body
        );
      })()}


      {/* Reparent picker - pick a task to nest the target under, or move to top level. */}
      {reparentTarget && (
        <TaskFinder
          entries={entries}
          todoById={todoById}
          onSaveTodo={onSaveTodo}
          onToggleTodo={handleToggleTodo}
          title={`Move “${reparentTarget.text || 'Untitled'}” to…`}
          placeholder="Search for a task to nest under…"
          isDisabled={reparentDisabled}
          rootOption={{ label: 'Set no parent', onSelect: () => { onSaveTodo({ ...reparentTarget, parentId: null }); setReparentId(null); } }}
          onPick={(newParentId) => { onSaveTodo({ ...reparentTarget, parentId: newParentId }); setReparentId(null); }}
          onClose={() => setReparentId(null)}
        />
      )}
    </div>
  );
};
