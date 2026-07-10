import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { DayTodos, Todo, Workspace } from '@shared/types';
import {
  OrganizerEntry,
  CollectionOption,
} from '../utils/todoFilters';
import { ColKey, COLUMNS, EditState } from './todosHub/types';
import {
  collectionSlot,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
} from './todosHub/constants';
import { useSyncedSet, useSyncedLayout, resolveAction } from '../data/settings';
import { useHubViewConfig } from './todosHub/useHubViewConfig';
import { useHubData } from './todosHub/useHubData';
import { useCollectionDnD } from './todosHub/useCollectionDnD';
import { useRowDnD } from './todosHub/useRowDnD';
import { HubSidebar } from './todosHub/HubSidebar';
import { HubToolbar, ToolbarMenuKey } from './todosHub/HubToolbar';
import { groupCreateSpec, buildFilterCreatePatch } from './todosHub/viewUtils';
import { isDone } from '../utils/todoStatus';
import { TaskTable } from './todosHub/TaskTable';
import { VARIANTS } from './todosHub/variant';
import { TaskFinder } from './todosHub/TaskFinder';
import { FieldsMenu } from './todosHub/FieldsMenu';
import { FilterMenu } from './todosHub/FilterMenu';
import { SortMenu } from './todosHub/SortMenu';
import { SectionsMenu } from './todosHub/SectionsMenu';
import { CollectionEditModal } from './todosHub/CollectionEditModal';
import { CellEditorPopover } from './todosHub/CellEditorPopover';
import { RowContextMenu } from './todosHub/RowContextMenu';
import { DeleteCollectionModal } from './todosHub/DeleteCollectionModal';
import { useStableCallback } from './todosHub/useStableCallback';
import { flattenTree, orderFromFlat } from './todosHub/treeUtils';
import { timeToPercentage } from '../utils/timeUtils';

interface TodosHubViewProps {
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
  selectedView: string;
  onSelectView: (view: string) => void;
  // Whether `dayTodos` has finished loading — see useHubData.
  dataReady: boolean;
  // Opening a task navigates to /task/$taskId (the shared full-view route).
  onOpenTask: (id: string) => void;
}

export const TodosHubView: React.FC<TodosHubViewProps> = ({
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
  // section settings, resizable columns) — keyed by workspace + view.
  const {
    fieldOrder,
    hiddenFields,
    wrappedFields,
    activeFilters,
    activeSorts,
    sectionsConfig,
    updateViewState,
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
    archivedCount,
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
  // one is ever open), then — unless this one was already open (toggle off) —
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
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
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
  // Id of the collection whose Edit modal (name / color / parent) is open.
  const [editCollId, setEditCollId] = useState<string | null>(null);
  // Task id being reparented via the "Move to…" picker (null = picker closed).
  const [reparentId, setReparentId] = useState<string | null>(null);
  const openMenu = useStableCallback((id: string, x: number, y: number) => { setMenu({ id, x, y }); setColorPickerOpen(false); });
  const closeMenu = () => { setMenu(null); setColorPickerOpen(false); };

  // The todo the context menu currently targets (to branch task vs. collection
  // items). Falls back to the archived set since a menu opened from the
  // Archived view targets a todo not present in `entries`.
  const menuEntry = menu
    ? entries.find((e) => e.todo.id === menu.id) || archivedEntries.find((e) => e.todo.id === menu.id) || null
    : null;

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
      duePercentage: undefined,
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

  const handleNewCollection = () => {
    const id = onAddCollection();
    setSelectedView(id);   // make it the active collection
    setEditCollId(id);     // open the name/color modal
  };
  // Context-menu "Create nested collection": add a child under the target, ensure
  // the parent is expanded so the new node is visible, then select it and open its
  // edit modal (mirrors the top-level New collection flow).
  const handleNewNestedCollection = (parentId: string) => {
    const id = onAddCollection(parentId);
    setCollapsedColls((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    setSelectedView(id);   // make the new nested collection active
    setEditCollId(id);     // open the name/color modal
  };
  // Seed patch derived from the view's active filters: any "is <value>" filter is
  // pre-applied to tasks created in this view, so a new task still satisfies the
  // filters (and stays visible) right after creation. Collection membership is
  // handled separately via `selectedCollectionId` as the new task's parent.
  const inheritedFilterPatch = useMemo(
    () => buildFilterCreatePatch(activeFilters),
    [activeFilters]
  );

  // The table's "New" button adds into the selected collection (else top-level),
  // inherits the active filters, then drops straight into the new row's title
  // field so you can type the name without a second click.
  const handleNewInView = () => {
    const id = onAddTodo({ parentId: selectedCollectionId, patch: inheritedFilterPatch });
    if (selectedCollectionId) {
      // Make sure the parent isn't collapsed, or the new row would be hidden.
      setCollapsed((prev) => { const n = new Set(prev); n.delete(selectedCollectionId); return n; });
    }
    setEditing({ id, col: 'title', rect: null });
  };
  // The "+" on a collection section header (collection grouping): parent the task
  // to that collection and seed the active filters so it stays in the filtered view.
  const handleQuickAddTask = useStableCallback((parentId: string) => {
    const id = onAddTodo({ parentId, patch: inheritedFilterPatch });
    setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    setEditing({ id, col: 'title', rect: null });
  });
  // The "+" on an attribute-grouped section header: create a task seeded with the
  // active filters AND the section's attribute (the latter wins on conflict so it
  // lands in that section), parent it to the selected collection so a collection
  // view keeps it, expand the section if collapsed, and focus the new row's title.
  const handleQuickAddInGroup = useStableCallback((groupValue: string) => {
    const { date, patch } = groupCreateSpec(sectionsConfig.groupBy, groupValue);
    const id = onAddTodo({
      date,
      patch: { ...inheritedFilterPatch, ...patch },
      parentId: selectedCollectionId,
    });
    const headerId = `__grp:${sectionsConfig.groupBy}:${groupValue}`;
    setCollapsed((prev) => { const n = new Set(prev); n.delete(headerId); return n; });
    setEditing({ id, col: 'title', rect: null });
  });

  // Context-menu "Create task inside": add a subtask, expand the parent so the
  // new row is visible, close the menu, and drop into its title field.
  const createTaskInside = (parentId: string) => {
    const id = onAddSubtask(parentId);
    setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    closeMenu();
    setEditing({ id, col: 'title', rect: null });
  };

  // Splice `id` in next to `anchorId` among its siblings and persist the whole
  // tree order (same mechanism the row drag-and-drop commit uses). A freshly
  // created task starts at the bottom, so this is what moves it into place.
  const placeRelative = (
    id: string,
    anchorId: string,
    pos: 'above' | 'below',
    parentId: string | null,
  ) => {
    const full = flattenTree(processedEntries).map((n) => ({ id: n.id, parentId: n.parentId }));
    const at = full.findIndex((n) => n.id === anchorId);
    if (at === -1) return;
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
    const parentId = anchor.todo.parentId ?? null;
    const id = onAddTodo({ parentId, patch: inheritedFilterPatch });
    placeRelative(id, anchorId, pos, parentId);
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
    placeRelative(copyId, id, 'below', parentId);
    closeMenu();
  };

  // Context-menu Set date / Set time. Clearing the end time drops the derived
  // percentage and the start time with it (a start with no end is meaningless).
  const setTaskDate = (date: string) => {
    if (!menuEntry) return;
    onSaveTodo({ ...menuEntry.todo, dueDate: date || undefined });
  };
  const setTaskTime = (time: string) => {
    if (!menuEntry) return;
    onSaveTodo({
      ...menuEntry.todo,
      dueTime: time || undefined,
      duePercentage: time ? timeToPercentage(time) : undefined,
      startTime: time ? menuEntry.todo.startTime : undefined,
    });
  };

  // Context-menu Delete: a non-empty collection prompts cascade-vs-promote;
  // empty collections and plain tasks delete straight away.
  const requestDeleteFromMenu = (id: string) => {
    const entry = byId.get(id);
    if (entry?.todo.isCollection && entries.some((e) => (e.todo.parentId ?? null) === id)) {
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

  // Auto-archive: when a task is being completed and the setting is on, archive
  // it immediately instead of just toggling the checkbox.
  const handleToggleTodo = useStableCallback((id: string) => {
    if (sectionsConfig.autoArchive) {
      const entry = entries.find((e) => e.todo.id === id);
      if (entry && !isDone(entry.todo)) {
        onArchiveTodo(id);
        return;
      }
    }
    onToggleTodo(id);
  });

  // The popover (tags/notes/status/priority) edits the entry currently being edited.
  const editingEntry =
    editing && POPOVER_COLS.includes(editing.col)
      ? entries.find((e) => e.todo.id === editing.id) || null
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
      {/* Left pane — full-height collection picker (resizable) */}
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
          visibleCollections={visibleCollections}
          collectionCount={collectionCount}
          collapsedColls={collapsedColls}
          toggleCollColl={toggleCollColl}
          openMenu={openMenu}
          onNewCollection={handleNewCollection}
          dnd={collectionDnD}
        />
      )}

      {/* Right pane — header + task table */}
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

        {/* Body — the single shared table/list surface selected by the variant. */}
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
              currentCount,
            }}
            interaction={{ editing, startEdit, stopEdit, openMenu, toggleCollapse }}
            rowHandlers={{
              onSaveTodo,
              onToggleTodo: handleToggleTodo,
              onAddSubtask,
              onQuickAddTask: handleQuickAddTask,
              onQuickAddInGroup: handleQuickAddInGroup,
              onNewInView: selectedView === 'archived' ? undefined : handleNewInView,
            }}
            dnd={dnd}
            bottomSpacer
          />
      </div>

      {/* Sections menu — view-level settings */}
      {sectionsMenu && createPortal(
        <SectionsMenu
          anchor={sectionsMenu}
          config={sectionsConfig}
          onChange={(cfg) => updateViewState({ sections: cfg })}
          onClose={() => setSectionsMenu(null)}
        />,
        document.body
      )}

      {/* Fields menu — reorder (drag) + show/hide the table's columns */}
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
          onClose={() => setFieldsMenu(null)}
        />,
        document.body
      )}

      {/* Filter menu */}
      {filterMenu && createPortal(
        <FilterMenu
          anchor={filterMenu}
          filters={activeFilters}
          allColumns={COLUMNS}
          uniqueValues={uniqueValues}
          onChange={(f) => updateViewState({ filters: f })}
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

      {/* Right-click / 3-dot context menu */}
      {menu && (
        <RowContextMenu
          menu={menu}
          menuPos={menuPos}
          menuRef={menuRef}
          entry={menuEntry}
          colorPickerOpen={colorPickerOpen}
          onToggleColorPicker={() => setColorPickerOpen((v) => !v)}
          onClose={closeMenu}
          onEditCollection={(id) => { setEditCollId(id); closeMenu(); }}
          onCreateTaskInside={createTaskInside}
          onCreateNestedCollection={(id) => { handleNewNestedCollection(id); closeMenu(); }}
          onChangeColor={(entry, color) => { setCollectionColor(entry, color); closeMenu(); }}
          onMakeCollection={(entry) => { makeCollection(entry); closeMenu(); }}
          onMoveTo={(id) => { setReparentId(id); closeMenu(); }}
          onExpand={(id) => { onOpenTask(id); closeMenu(); }}
          onDuplicate={duplicateTask}
          onSetDate={(_id, date) => setTaskDate(date)}
          onSetTime={(_id, time) => setTaskTime(time)}
          onAddTaskAbove={(id) => addTaskRelative(id, 'above')}
          onAddTaskBelow={(id) => addTaskRelative(id, 'below')}
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
        if (!entry) { setEditCollId(null); return null; }
        return createPortal(
          <CollectionEditModal
            entry={entry}
            options={collectionOptions}
            onCreateCollection={onCreateCollection}
            onClose={() => setEditCollId(null)}
            onSave={({ text, color, parentId }) => {
              onSaveTodo({ ...entry.todo, text, color, parentId });
              setEditCollId(null);
            }}
          />,
          document.body
        );
      })()}

      {/* Delete-collection modal: cascade vs. move tasks up one level */}
      {deleteCollId && (() => {
        const coll = entries.find((e) => e.todo.id === deleteCollId);
        if (!coll) { setDeleteCollId(null); return null; }
        const parentColl = coll.todo.parentId ? byId.get(coll.todo.parentId) : null;
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


      {/* Reparent picker — pick a task to nest the target under, or move to top level. */}
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
