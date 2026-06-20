import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { Plus } from 'lucide-react';
import { DayTodos, Todo, Workspace } from '../types';
import {
  OrganizerEntry,
  CollectionOption,
} from '../utils/todoFilters';
import { TodoFullView } from './TodoFullView';
import { ColKey, COLUMNS, EditState } from './todosHub/types';
import {
  TABLE_PAD,
  BOTTOM_SPACER,
  DEFAULT_COLLECTION_COLOR,
  COLLAPSED_KEY,
  VIEW_KEY,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_HIDDEN_KEY,
  SIDEBAR_COLLAPSED_KEY,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
} from './todosHub/constants';
import { usePersistentState, setCodec, stringCodec } from './todosHub/usePersistentState';
import { useHubViewConfig } from './todosHub/useHubViewConfig';
import { useHubData } from './todosHub/useHubData';
import { useCollectionDnD } from './todosHub/useCollectionDnD';
import { useRowDnD } from './todosHub/useRowDnD';
import { HubSidebar } from './todosHub/HubSidebar';
import { HubToolbar, ToolbarMenuKey } from './todosHub/HubToolbar';
import { groupCreateSpec } from './todosHub/viewUtils';
import { isDone } from '../utils/todoStatus';
import { HubRow } from './todosHub/HubRow';
import { FieldsMenu } from './todosHub/FieldsMenu';
import { FilterMenu } from './todosHub/FilterMenu';
import { SortMenu } from './todosHub/SortMenu';
import { SectionsMenu } from './todosHub/SectionsMenu';
import { GroupHeaderRow } from './todosHub/GroupHeaderRow';
import { CollectionEditModal } from './todosHub/CollectionEditModal';
import { CellEditorPopover } from './todosHub/CellEditorPopover';
import { RowContextMenu } from './todosHub/RowContextMenu';
import { DeleteCollectionModal } from './todosHub/DeleteCollectionModal';
import { useStableCallback } from './todosHub/useStableCallback';

interface TodosHubViewProps {
  dayTodos: DayTodos[];
  // Collections available to assign (active-workspace scoped) + helpers.
  collectionOptions: CollectionOption[];
  onSetTaskCollection: (taskId: string, collectionId: string | null) => void;
  onCreateCollection: (name: string) => string;
  // Save an edited todo. The task owns its scheduled day via `dueDate`, so the
  // updated todo is the entire payload.
  onSaveTodo: (updatedTodo: Todo) => void;
  // Create a top-level hub task. `opts` lets a grouped-view "+" seed the task
  // with a calendar date and/or field patch (status/priority) so it lands in the
  // section it was added from.
  onAddTodo: (opts?: { date?: string | null; patch?: Partial<Todo> }) => string;
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
}) => {
  // ── Collapse state (persisted) ─────────────────────────────────────────────
  // Table row collapse and sidebar collection-tree collapse (both feed the data
  // layer below, so they're declared first).
  const [collapsed, setCollapsed] = usePersistentState(COLLAPSED_KEY, () => new Set<string>(), setCodec);
  const toggleCollapse = useStableCallback((id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    }));
  const [collapsedColls, setCollapsedColls] = usePersistentState(SIDEBAR_COLLAPSED_KEY, () => new Set<string>(), setCodec);
  const toggleCollColl = (id: string) =>
    setCollapsedColls((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // ── Sidebar selection (which collection / view the table shows) ────────────
  // Declared early so the per-view config hook below can derive its storage key.
  const [selectedView, setSelectedView] = usePersistentState(VIEW_KEY, 'all', stringCodec);

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
  } = useHubData({
    dayTodos,
    activeWorkspaceId,
    selectedView,
    setSelectedView,
    collapsed,
    collapsedColls,
    activeFilters,
    activeSorts,
    sectionsConfig,
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
  const POPOVER_COLS: ColKey[] = ['collection', 'notes', 'status', 'priority', 'startDate', 'date', 'start', 'end'];
  const popoverOpen = !!editing && POPOVER_COLS.includes(editing.col);
  useEffect(() => {
    if (!popoverOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current?.contains(target)) return;
      if (target.closest('[data-tag-suggestions]')) return; // tag autocomplete renders in its own portal
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
  useLayoutEffect(() => {
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
  }, [editing?.id, editing?.col]);

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
  const [fullViewId, setFullViewId] = useState<string | null>(null);
  const openMenu = useStableCallback((id: string, x: number, y: number) => { setMenu({ id, x, y }); setColorPickerOpen(false); });
  const closeMenu = () => { setMenu(null); setColorPickerOpen(false); };

  // The todo the context menu currently targets (to branch task vs. collection items).
  const menuEntry = menu ? entries.find((e) => e.todo.id === menu.id) || null : null;

  // Convert a plain task into a top-level collection: flag it, give it a default
  // color, strip the task-only fields, and clear its due date (undated) so it
  // can never leak onto the daily checklist.
  const makeCollection = (entry: OrganizerEntry) => {
    onSaveTodo({
      ...entry.todo,
      isCollection: true,
      color: entry.todo.color || DEFAULT_COLLECTION_COLOR,
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

  // ── Left-pane sizing (persisted) ───────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = usePersistentState(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH, {
    parse: (raw) => {
      const n = Number(raw);
      if (n >= MIN_SIDEBAR_WIDTH && n <= MAX_SIDEBAR_WIDTH) return n;
      throw new Error('out of range');
    },
    serialize: (v) => String(v),
  });
  const [sidebarHidden, setSidebarHidden] = usePersistentState(SIDEBAR_HIDDEN_KEY, false, {
    parse: (raw) => raw === '1',
    serialize: (v) => (v ? '1' : '0'),
  });

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
    // setSelectedView(id);
    setEditCollId(id);
  };
  // Context-menu "Create nested collection": add a child under the target and
  // ensure the parent is expanded so the new node is visible.
  const handleNewNestedCollection = (parentId: string) => {
    onAddCollection(parentId);
    setCollapsedColls((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
  };
  // The table's "New" button adds into the selected collection, else top-level,
  // then drops straight into the new row's title field so you can type the name
  // without a second click.
  const handleNewInView = () => {
    const id = selectedCollectionId ? onAddSubtask(selectedCollectionId) : onAddTodo();
    if (selectedCollectionId) {
      // Make sure the parent isn't collapsed, or the new row would be hidden.
      setCollapsed((prev) => { const n = new Set(prev); n.delete(selectedCollectionId); return n; });
    }
    setEditing({ id, col: 'title', rect: null });
  };
  const handleQuickAddTask = useStableCallback((parentId: string) => {
    const id = onAddSubtask(parentId);
    setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    setEditing({ id, col: 'title', rect: null });
  });
  // The "+" on an attribute-grouped section header: create a task seeded with the
  // section's attribute (so it lands in that section), expand the section if it
  // was collapsed, and drop into the new row's title field.
  const handleQuickAddInGroup = useStableCallback((groupValue: string) => {
    const { date, patch } = groupCreateSpec(sectionsConfig.groupBy, groupValue);
    const id = onAddTodo({ date, patch });
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
  const {
    tableScroll,
    rowDragId,
    rowDrop,
    onRowDragStart,
    onRowDragOver,
    onHeaderDragOver,
    onRowDrop,
    resetDrag,
  } = useRowDnD({
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

  const fullViewEntry = fullViewId ? entries.find((e) => e.todo.id === fullViewId) || null : null;

  const saveFullTodo = (updated: Todo, newDate: string) =>
    onSaveTodo({ ...updated, dueDate: newDate || undefined });

  const headerCellCls =
    'relative flex items-center px-2.5 text-xs font-semibold tracking-wide text-white/75 hover:bg-[#0f0f0f] select-none';

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
          selectedCollectionId={selectedCollectionId}
          todoById={todoById}
          viewLabel={viewLabel}
          currentCount={currentCount}
          filterCount={activeFilters.length}
          sortCount={activeSorts.length}
          menuOpen={toolbarMenuOpen}
          onToggleMenu={onToggleMenu}
        />

        {/* Task table — single scroll container, both axes. */}
        <div
          ref={tableScroll.ref}
          onDragOver={tableScroll.onDragOver}
          onDragEnter={tableScroll.onDragEnter}
          // Fallback drop: releasing over the header bar / gaps (not a row) still
          // commits the current indicator. Row/header onDrop call stopPropagation
          // so this never double-fires.
          onDrop={(e) => { e.preventDefault(); onRowDrop(); }}
          className="flex-1 min-w-0 overflow-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full ml-4 pr-4"
        >
        
        {/* Header row — full-bleed bar: its background + bottom border span the
            whole width (no left/right gaps), but it carries the same TABLE_PAD
            padding and w-max width as the rows below, so the padding sits outside
            the grid tracks and the column borders line up with the body. */}
          <div
            className="grid sticky top-0 z-30 w-max min-w-full bg-[#0a0a0a] border-y border-white/10 h-9"
            style={{ gridTemplateColumns, paddingLeft: TABLE_PAD, paddingRight: TABLE_PAD }}
          >
            {visibleColumns.map((c, idx) => (
              <div
                key={c.key}
                // The Name header gets the row's left padding so its label lines up with the row content.
                style={idx === 0 ? { paddingLeft: 30} : undefined}
                className={`${headerCellCls} ${idx > 0 ? 'border-l border-white/8' : ''} ${
                  idx === 0 ? 'sticky left-0 z-10 bg-[#0a0a0a] border-r border-white/8' : ''
                } ${idx === visibleColumns.length - 1 ? 'border-r border-white/8' : ''}`}
              >
                <span className="truncate">{c.label}</span>
                {/* Resize handle on the right edge */}
                <div
                  onMouseDown={(e) => startResize(c.key, e)}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent2)]/40"
                />
              </div>
            ))}
            {/* Spacer: absorbs leftover width when the table doesn't scroll; gives
                the last column's resize handle room to expand into when it does. */}
            <div />
          </div>

        <div className="w-max min-w-full text-white" style={{ paddingLeft: TABLE_PAD, paddingRight: TABLE_PAD }}>
          

          {/* Rows — collection-tree mode (default) or flat grouped mode. Native
              HTML5 DnD: a drop indicator shows where the row will land; nothing
              shifts until release (matches the sidebar). */}
          {sectionsConfig.groupBy === 'collection' ? (
            flattened.map((node) => (
              <HubRow
                key={node.id}
                node={node}
                displayDepth={node.depth}
                gridTemplateColumns={gridTemplateColumns}
                editing={editing}
                startEdit={startEdit}
                stopEdit={stopEdit}
                onSaveTodo={onSaveTodo}
                onToggleTodo={handleToggleTodo}
                onAddSubtask={onAddSubtask}
                onQuickAddTask={handleQuickAddTask}
                openMenu={openMenu}
                isCollapsed={collapsed.has(node.id)}
                onToggleCollapse={toggleCollapse}
                collPath={collPathById.get(node.id) ?? []}
                columns={visibleColumns}
                lastColKey={lastColKey}
                wrappedFields={wrappedFields}
                taskCount={node.entry.todo.isCollection ? (visibleTaskCounts.get(node.id) ?? 0) : undefined}
                isDragSource={rowDragId === node.id}
                dropIndicator={rowDrop && rowDrop.id === node.id ? { pos: rowDrop.pos, depth: rowDrop.depth } : null}
                onRowDragStart={onRowDragStart}
                onRowDragOver={onRowDragOver}
                onRowDrop={onRowDrop}
                onRowDragEnd={resetDrag}
              />
            ))
          ) : (
            groupedRows.map((row) =>
              row.type === 'header' ? (
                <GroupHeaderRow
                  key={row.id}
                  row={row}
                  gridTemplateColumns={gridTemplateColumns}
                  onToggleCollapse={toggleCollapse}
                  onAddTask={handleQuickAddInGroup}
                  isDropTarget={rowDrop?.id === row.id}
                  onHeaderDragOver={(e) => onHeaderDragOver(row.id, row.value, e)}
                  onHeaderDrop={onRowDrop}
                />
              ) : (
                <HubRow
                  key={row.node.id}
                  node={row.node}
                  displayDepth={row.node.depth}
                  gridTemplateColumns={gridTemplateColumns}
                  editing={editing}
                  startEdit={startEdit}
                  stopEdit={stopEdit}
                  onSaveTodo={onSaveTodo}
                  onToggleTodo={handleToggleTodo}
                  onAddSubtask={onAddSubtask}
                  onQuickAddTask={handleQuickAddTask}
                  openMenu={openMenu}
                  isCollapsed={collapsed.has(row.node.id)}
                  onToggleCollapse={toggleCollapse}
                  collPath={collPathById.get(row.node.id) ?? []}
                  columns={visibleColumns}
                  lastColKey={lastColKey}
                  wrappedFields={wrappedFields}
                  isDragSource={rowDragId === row.node.id}
                  dropIndicator={rowDrop && rowDrop.id === row.node.id ? { pos: rowDrop.pos, depth: rowDrop.depth } : null}
                  onRowDragStart={onRowDragStart}
                  onRowDragOver={onRowDragOver}
                  onRowDrop={onRowDrop}
                  onRowDragEnd={resetDrag}
                />
              )
            )
          )}

          {/* Add row */}
          <button
            type="button"
            onClick={handleNewInView}
            className="flex w-full h-9  text-white/60 hover:text-white hover:bg-white/3 border-b border-white/8 cursor-pointer transition-colors bg-[#0a0a0a]"
          >
            <div className="px-3 text-sm sticky left-0 z-10 flex items-center gap-2 ">
              <Plus size={15}/>
              <span>New</span>
            </div>
          </button>

          {(sectionsConfig.groupBy === 'collection' ? flattened.length === 0 : groupedRows.length === 0) && (
            <div className="px-3 py-6 text-xs text-white/50">
              {selectedCollectionId
                ? 'No tasks in this collection yet. Click “New” to add one.'
                : selectedView === 'uncategorized'
                  ? 'No uncategorized tasks. Everything is filed in a collection.'
                  : <>No database todos yet. Click “New”, or set <code>showInDatabase: true</code> on a todo.</>}
            </div>
          )}

          {/* Bottom dead space so the last row isn't flush to the edge and the
              right-click context menu has room to open fully below it. */}
          <div aria-hidden style={{ height: BOTTOM_SPACER }} />
        </div>
        </div>
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
          collPathFor={collPathFor}
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
          onExpand={(id) => { setFullViewId(id); closeMenu(); }}
          onArchive={(id) => { onArchiveTodo(id); closeMenu(); }}
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
            todoById={todoById}
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

      {/* Expanded full view */}
      <AnimatePresence>
        {fullViewEntry && (
          <TodoFullView
            key={fullViewEntry.todo.id}
            todo={fullViewEntry.todo}
            date={fullViewEntry.todo.dueDate || ''}
            collectionOptions={collectionOptions}
            onCreateCollection={onCreateCollection}
            byId={todoById}
            onClose={() => setFullViewId(null)}
            onSave={saveFullTodo}
            onToggle={onToggleTodo}
            onDelete={(id) => { onDeleteTodo(id); setFullViewId(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
