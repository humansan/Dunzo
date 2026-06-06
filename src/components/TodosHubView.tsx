import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import {
  Plus,
  Archive,
  Trash2,
  Maximize2,
  ChevronRight,
  ChevronDown,
  CornerDownRight,
  FolderPlus,
  Palette,
  Layers,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Table,
  List,
  GanttChart,
  Group,
  Columns3,
  Filter,
  ArrowUpDown,
  Box,
  Shapes,
  Pencil,
} from 'lucide-react';
import { DayTodos, Todo, Workspace } from '../types';
import {
  getOrganizerTodos,
  OrganizerEntry,
  hasDate,
  CollectionOption,
  todoIndex,
  collectionOf,
  collectionPath,
} from '../utils/todoFilters';
import { TodoFullView } from './TodoFullView';
import {
  NotesField,
  CollectionSearchField,
  OptionSelectField,
  CollectionBreadcrumb,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from './todoFields';
import { CalendarInput } from './CalendarInput';
import { ColKey, ColDef, COLUMNS, NAME_COL_KEY, EditState, FilterRule, SortRule, SectionsConfig, DEFAULT_SECTIONS_CONFIG, GroupRow } from './todosHub/types';
import {
  MIN_COL_WIDTH,
  TABLE_PAD,
  BOTTOM_SPACER,
  COLLECTION_COLORS,
  DEFAULT_COLLECTION_COLOR,
  WIDTHS_KEY,
  VIEWS_KEY,
  COLLAPSED_KEY,
  VIEW_KEY,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_HIDDEN_KEY,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_INDENT,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
} from './todosHub/constants';
import { flattenTree, orderFromFlat } from './todosHub/treeUtils';
import { useDragAutoScroll } from './todosHub/useDragAutoScroll';
import { getFieldDisplayValue, getFieldRawValue, compareRawValues, matchesFilter, buildGroupedItems, groupAssignmentPatch } from './todosHub/viewUtils';
import { HubRow } from './todosHub/HubRow';
import { FieldsMenu } from './todosHub/FieldsMenu';
import { FilterMenu } from './todosHub/FilterMenu';
import { SortMenu } from './todosHub/SortMenu';
import { SectionsMenu } from './todosHub/SectionsMenu';
import { GroupHeaderRow } from './todosHub/GroupHeaderRow';
import { CollectionEditModal } from './todosHub/CollectionEditModal';

// Returns a callback with a stable identity across renders that always invokes
// the latest version of `fn`. Lets us pass handlers to React.memo'd rows without
// breaking memoization, and without the stale-closure risk of useCallback([]).
function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useRef(((...args: any[]) => ref.current(...args)) as T).current;
}

interface TodosHubViewProps {
  dayTodos: DayTodos[];
  // Collections available to assign (active-workspace scoped) + helpers.
  collectionOptions: CollectionOption[];
  onSetTaskCollection: (taskId: string, collectionId: string | null) => void;
  onCreateCollection: (name: string) => string;
  // Save an edited todo, moving it between date buckets when its date changes.
  onSaveTodo: (oldDate: string | null, newDate: string | null, updatedTodo: Todo) => void;
  onAddTodo: () => string;
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

  // ── Collapse state (persisted) ─────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  }, [collapsed]);
  const toggleCollapse = useStableCallback((id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    }));

  // ── Column widths (persisted) ──────────────────────────────────────────────
  const defaultWidths = Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultWidth]));
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(WIDTHS_KEY) || '{}');
      return { ...defaultWidths, ...saved };
    } catch {
      return defaultWidths;
    }
  });
  useEffect(() => {
    localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths));
  }, [widths]);

  // ── Sidebar selection (which collection / view the table shows) ────────────
  // Declared early so the per-view config block below can derive its storage key.
  const [selectedView, setSelectedView] = useState<string>(
    () => localStorage.getItem(VIEW_KEY) || 'all'
  );
  useEffect(() => { localStorage.setItem(VIEW_KEY, selectedView); }, [selectedView]);

  // ── Per-view config (field order, visibility, filters, sorts) ────────────────
  // Keyed by workspaceId:viewId so each sidebar tab in each workspace has its own
  // independent layout and filter/sort state.
  const [viewsConfig, setViewsConfig] = useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}'); }
    catch { return {}; }
  });
  useEffect(() => {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(viewsConfig));
  }, [viewsConfig]);

  // The config key for the currently-visible view.
  const viewConfigKey = `${activeWorkspaceId}:${selectedView}`;

  // Derive and reconcile the current view's config (field order may drift if
  // new columns are added; unknown keys are dropped, missing ones are appended).
  const allColKeys = COLUMNS.map((c) => c.key);
  const currentViewState = useMemo(() => {
    const raw = viewsConfig[viewConfigKey] ?? {};
    let fieldOrder: ColKey[] = Array.isArray(raw.fieldOrder)
      ? raw.fieldOrder.filter((k: string): k is ColKey => allColKeys.includes(k as ColKey))
      : [];
    fieldOrder = [
      NAME_COL_KEY,
      ...[...fieldOrder, ...allColKeys.filter((k) => !fieldOrder.includes(k))].filter(
        (k) => k !== NAME_COL_KEY
      ),
    ];
    const hiddenFields = new Set<ColKey>(
      (Array.isArray(raw.hiddenFields) ? raw.hiddenFields : []).filter(
        (k: string): k is ColKey => k !== NAME_COL_KEY && allColKeys.includes(k as ColKey)
      )
    );
    const raw_sections = raw.sections ?? {};
    const sections: SectionsConfig = {
      autoArchive:          raw_sections.autoArchive          ?? DEFAULT_SECTIONS_CONFIG.autoArchive,
      showLeafTasks:        raw_sections.showLeafTasks        ?? DEFAULT_SECTIONS_CONFIG.showLeafTasks,
      hideEmptyCollections: raw_sections.hideEmptyCollections ?? DEFAULT_SECTIONS_CONFIG.hideEmptyCollections,
      groupBy:              raw_sections.groupBy              ?? DEFAULT_SECTIONS_CONFIG.groupBy,
      groupSortDirection:   raw_sections.groupSortDirection   ?? DEFAULT_SECTIONS_CONFIG.groupSortDirection,
    };
    return {
      fieldOrder,
      hiddenFields,
      filters: (Array.isArray(raw.filters) ? raw.filters : []) as FilterRule[],
      sorts:   (Array.isArray(raw.sorts)   ? raw.sorts   : []) as SortRule[],
      sections,
    };
  }, [viewsConfig, viewConfigKey]);

  const { fieldOrder, hiddenFields, filters: activeFilters, sorts: activeSorts, sections: sectionsConfig } = currentViewState;

  // Persist any view-state update (partial merge).
  const updateViewState = (patch: {
    fieldOrder?: ColKey[];
    hiddenFields?: Set<ColKey>;
    filters?: FilterRule[];
    sorts?: SortRule[];
    sections?: SectionsConfig;
  }) => {
    setViewsConfig((prev) => ({
      ...prev,
      [viewConfigKey]: {
        fieldOrder:  patch.fieldOrder  ?? fieldOrder,
        hiddenFields: [...(patch.hiddenFields ?? hiddenFields)],
        filters:     patch.filters     ?? activeFilters,
        sorts:       patch.sorts       ?? activeSorts,
        sections:    patch.sections    ?? sectionsConfig,
      },
    }));
  };

  const colByKey = useMemo(() => new Map(COLUMNS.map((c) => [c.key, c])), []);

  const toggleField = (key: ColKey) => {
    if (key === NAME_COL_KEY) return;
    const n = new Set(hiddenFields);
    if (n.has(key)) n.delete(key); else n.add(key);
    updateViewState({ hiddenFields: n });
  };
  const moveField = (dragKey: ColKey, targetKey: ColKey, pos: 'before' | 'after') => {
    if (dragKey === NAME_COL_KEY || targetKey === NAME_COL_KEY) return;
    const order = fieldOrder.filter((k) => k !== dragKey);
    const ti = order.indexOf(targetKey);
    if (ti === -1) return;
    order.splice(pos === 'before' ? ti : ti + 1, 0, dragKey);
    updateViewState({ fieldOrder: [NAME_COL_KEY, ...order.filter((k) => k !== NAME_COL_KEY)] });
  };

  // Columns the table renders: ordered, with hidden ones removed (Name always first).
  const visibleColumns = useMemo(
    () =>
      fieldOrder
        .map((k) => colByKey.get(k)!)
        .filter((c): c is ColDef => !!c && (c.key === NAME_COL_KEY || !hiddenFields.has(c.key))),
    [fieldOrder, hiddenFields, colByKey]
  );
  const lastColKey = visibleColumns[visibleColumns.length - 1]?.key ?? NAME_COL_KEY;

  // ── Toolbar menu anchor states ────────────────────────────────────────────────
  const [sectionsMenu, setSectionsMenu] = useState<{ right: number; top: number } | null>(null);
  const [fieldsMenu, setFieldsMenu] = useState<{ right: number; top: number } | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ right: number; top: number } | null>(null);
  const [sortMenu, setSortMenu] = useState<{ right: number; top: number } | null>(null);

  // Close all toolbar menus when the sidebar view changes.
  useEffect(() => {
    setSectionsMenu(null);
    setFieldsMenu(null);
    setFilterMenu(null);
    setSortMenu(null);
  }, [selectedView]);

  const gridTemplateColumns = visibleColumns.map((c) => `${widths[c.key]}px`).join(' ');

  const startResize = (key: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_COL_WIDTH, startW + (ev.clientX - startX));
      setWidths((prev) => ({ ...prev, [key]: w }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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
  const POPOVER_COLS: ColKey[] = ['collection', 'notes', 'status', 'priority', 'date'];
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
  // color, strip the task-only fields, and move it to the UNDATED bucket so it
  // can never leak onto the daily checklist.
  const makeCollection = (entry: OrganizerEntry) => {
    onSaveTodo(entry.date, null, {
      ...entry.todo,
      isCollection: true,
      color: entry.todo.color || DEFAULT_COLLECTION_COLOR,
      parentId: null,
      completed: false,
      duePercentage: undefined,
      startTime: undefined,
      dueTime: undefined,
      xp: undefined,
      notes: undefined,
    });
  };
  const setCollectionColor = (entry: OrganizerEntry, color: string) =>
    onSaveTodo(entry.date, entry.date, { ...entry.todo, color });

  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const handleNewWorkspace = () => {
    const id = onAddWorkspace();
    setSelectedView('all');
    setRenamingWorkspaceId(id);
  };

  // ── Left-pane sizing (persisted) ───────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return saved >= MIN_SIDEBAR_WIDTH && saved <= MAX_SIDEBAR_WIDTH ? saved : DEFAULT_SIDEBAR_WIDTH;
  });
  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); }, [sidebarWidth]);
  const [sidebarHidden, setSidebarHidden] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1'
  );
  useEffect(() => { localStorage.setItem(SIDEBAR_HIDDEN_KEY, sidebarHidden ? '1' : '0'); }, [sidebarHidden]);

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
  }, [selectedCollectionId, collections]);

  // ── Sidebar collection tree (nested, expand/collapse) ──────────────────────
  const [collapsedColls, setCollapsedColls] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) || '[]'));
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify([...collapsedColls]));
  }, [collapsedColls]);
  const toggleCollColl = (id: string) =>
    setCollapsedColls((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

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

  // ── Sidebar drag-and-drop (reorder + nest collections) ─────────────────────
  // Drag a collection over another to nest it (hover the middle → highlight), or
  // between two to reorder it (hover an edge → drop line). The drop line sits at
  // the target's indent level, so re-parenting across nesting levels reads right.
  const [dragCollId, setDragCollId] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<{ id: string; pos: 'before' | 'inside' | 'after' } | null>(null);

  // The dragged collection can't land on itself or inside its own subtree.
  const inDraggedSubtree = (id: string) => {
    if (!dragCollId) return false;
    if (id === dragCollId) return true;
    const e = byId.get(id);
    return e ? isDescendantOf(e, dragCollId) : false;
  };

  const onCollDragOver = (e: React.DragEvent, targetId: string) => {
    if (!dragCollId) return;
    // preventDefault unconditionally so the cursor stays "move" — even over the
    // dragged item or its own subtree (where there's no valid drop), which would
    // otherwise flicker the no-drop icon.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (inDraggedSubtree(targetId)) { if (dropInfo) setDropInfo(null); return; } // not a valid target
    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientY - rect.top) / rect.height;
    const pos: 'before' | 'inside' | 'after' = r < 0.3 ? 'before' : r > 0.7 ? 'after' : 'inside';
    setDropInfo((prev) => (prev?.id === targetId && prev.pos === pos ? prev : { id: targetId, pos }));
  };

  // Re-parent / reorder the dragged collection relative to the drop target, then
  // persist a fresh full ordering. Only the dragged node moves; its subtree (and
  // every other node) keeps its parentId, so orderFromFlat re-nests everything.
  const moveCollection = (draggedId: string, targetId: string, pos: 'before' | 'inside' | 'after') => {
    const collIds = new Set(collections.map((c) => c.todo.id));
    const effParent = (id: string): string | null => {
      const p = byId.get(id)?.todo.parentId ?? null;
      return p && collIds.has(p) ? p : null;
    };
    const newParent = pos === 'inside' ? targetId : effParent(targetId);

    const nodes = flattenTree(entries)
      .map((n) => ({ id: n.id, parentId: n.parentId }))
      .filter((n) => n.id !== draggedId);
    const ti = nodes.findIndex((n) => n.id === targetId);
    if (ti === -1) return;
    nodes.splice(pos === 'before' ? ti : ti + 1, 0, { id: draggedId, parentId: newParent });

    onReorder(orderFromFlat(nodes));
    if (pos === 'inside') {
      setCollapsedColls((prev) => { const n = new Set(prev); n.delete(targetId); return n; });
    }
  };

  // Commit using the live dropInfo (what the highlight/line shows), not the DOM
  // element the drop happened to land on — the "after" line sits in the gap
  // between rows, so the release often lands off the intended row.
  const onCollDrop = () => {
    if (dragCollId && dropInfo && !inDraggedSubtree(dropInfo.id)) {
      moveCollection(dragCollId, dropInfo.id, dropInfo.pos);
    }
    setDragCollId(null);
    setDropInfo(null);
    sideScroll.stop();
  };

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
  }, [entries, selectedView, byId]);

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

  // Sidebar counts (tasks only, collections never counted).
  const allCount = entries.filter((e) => !e.todo.isCollection).length;
  const uncategorizedCount = entries.filter(
    (e) => !e.todo.isCollection && !hasCollectionAncestor(e)
  ).length;
  const collectionCount = (cid: string) =>
    entries.filter((e) => !e.todo.isCollection && isDescendantOf(e, cid)).length;

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

  // ── Drag & drop (sidebar-style: a drop indicator shows where the row will land;
  // nothing shifts until release) ─────────────────────────────────────────────
  // The dragged row id and the resolved drop: which row, whether it lands
  // before/after (reorder) or inside (nest), the resolved parent + indent depth
  // (to draw the line), and — in attribute-grouped mode — the destination section.
  type RowDrop = {
    id: string;
    pos: 'before' | 'inside' | 'after';
    depth: number;
    parentId: string | null;
    group?: string;
  };
  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [rowDrop, setRowDrop] = useState<RowDrop | null>(null);
  // Edge auto-scroll for the two drag surfaces (table body + sidebar list). Their
  // onDragOver/onDragEnter also keep the whole surface a valid drop zone.
  const tableScroll = useDragAutoScroll<HTMLDivElement>();
  const sideScroll = useDragAutoScroll<HTMLDivElement>();

  // Rendered rows for collection-grouped (default) mode. processedEntries respects
  // filters + hideEmptyCollections. leafPosition segregates tasks vs sub-collections.
  // The dragged row stays visible (dimmed), so nothing is excluded during a drag.
  const flattened = useMemo(
    () => flattenTree(processedEntries, {
      collapsed,
      sortFn,
      leafPosition: sectionsConfig.showLeafTasks !== 'none' ? sectionsConfig.showLeafTasks : undefined,
    }),
    [processedEntries, collapsed, sortFn, sectionsConfig.showLeafTasks]
  );
  const flatById = useMemo(() => new Map(flattened.map((n) => [n.id, n])), [flattened]);

  const resetDrag = useStableCallback(() => { setRowDragId(null); setRowDrop(null); tableScroll.stop(); });

  // Auto-archive: when a task is being completed and the setting is on, archive
  // it immediately instead of just toggling the checkbox.
  const handleToggleTodo = useStableCallback((id: string) => {
    if (sectionsConfig.autoArchive) {
      const entry = entries.find((e) => e.todo.id === id);
      if (entry && !entry.todo.completed) {
        onArchiveTodo(id);
        return;
      }
    }
    onToggleTodo(id);
  });

  // Nearest collection ancestor id (or null) — collections may only nest under
  // collections, so a collection drag snaps its parent up to one.
  const nearestCollectionId = (startId: string | null): string | null => {
    let cur = startId;
    const seen = new Set<string>();
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const e = byId.get(cur)!;
      if (e.todo.isCollection) return cur;
      cur = e.todo.parentId ?? null;
    }
    return null;
  };

  // Resolve the drop for collection-tree mode from the hovered row + cursor Y:
  // top/bottom thirds reorder (before/after, as a sibling); the middle nests
  // inside. Collections snap to a valid (collection/root) parent.
  const computeTreeDrop = (targetId: string, e: React.DragEvent): RowDrop | null => {
    if (!rowDragId || targetId === rowDragId) return null;
    const target = flatById.get(targetId);
    if (!target) return null;
    // Can't drop into the dragged node's own subtree.
    if (isDescendantOf(target.entry, rowDragId)) return null;

    const draggedIsColl = !!byId.get(rowDragId)?.todo.isCollection;
    const targetIsColl = !!target.entry.todo.isCollection;

    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientY - rect.top) / rect.height;

    // ── Section (collection) header target, dragging a TASK ──────────────────
    // A section's drop points must never yield a "no section" result. The top
    // zone appends the task to the section ABOVE (where the previous row lives);
    // the rest nests it inside this section. Sibling before/after on a section is
    // kept only for collection drags (below), so sections stay reorderable.
    if (targetIsColl && !draggedIsColl) {
      if (r < 0.3) {
        const idx = flattened.findIndex((n) => n.id === targetId);
        const prev = idx > 0 ? flattened[idx - 1] : null;
        if (prev && prev.id !== rowDragId && !isDescendantOf(prev.entry, rowDragId)) {
          // Land where the previous row lives: inside it if it's a (collapsed/
          // empty) section, else as its sibling — i.e. the section above.
          return prev.entry.todo.isCollection
            ? { id: targetId, pos: 'before', depth: prev.depth + 1, parentId: prev.id }
            : { id: targetId, pos: 'before', depth: prev.depth, parentId: prev.parentId };
        }
        // This section is the very first row — keep a top-of-list drop so a task
        // can become the first, top-level (section-less) item above it.
        if (idx === 0) return { id: targetId, pos: 'before', depth: 0, parentId: null };
        // Otherwise (the row above is the dragged one) nest into this section.
        return { id: targetId, pos: 'inside', depth: target.depth + 1, parentId: targetId };
      }
      return { id: targetId, pos: 'inside', depth: target.depth + 1, parentId: targetId };
    } // end this section

    // 'inside' (nest) only when the target can legally parent the dragged node.
    const canNest = draggedIsColl ? targetIsColl : true;
    const pos: RowDrop['pos'] = canNest
      ? (r < 0.3 ? 'before' : r > 0.7 ? 'after' : 'inside')
      : (r < 0.5 ? 'before' : 'after');

    let parentId: string | null;
    let depth: number;
    if (pos === 'inside') {
      parentId = targetId;
      depth = target.depth + 1;
    } else {
      parentId = target.parentId;
      depth = target.depth;
      // A collection sibling must still sit under a collection (or root); snap up.
      if (draggedIsColl && parentId && !byId.get(parentId)?.todo.isCollection) {
        parentId = nearestCollectionId(parentId);
        depth = parentId ? (flatById.get(parentId)?.depth ?? 0) + 1 : 0;
      }
    }

    // Merge the two redundant boundary drop points: "after A" equals "before B"
    // when both resolve to the same spot, so the shared gap shows one stable
    // indicator instead of flipping between two. (Differing levels keep both.)
    // Cases that coincide: B is a sibling at the same level; or B is the next
    // section header, whose top zone appends to this same section above it.
    if (pos === 'after') {
      const idx = flattened.findIndex((n) => n.id === targetId);
      const next = idx >= 0 ? flattened[idx + 1] : null;
      if (next && next.id !== rowDragId) {
        const sameLevelSibling = next.parentId === parentId && next.depth === depth;
        const nextSectionHeader = !draggedIsColl && !!next.entry.todo.isCollection;
        if (sameLevelSibling || nextSectionHeader) {
          return { id: next.id, pos: 'before', depth, parentId };
        }
      }
    }
    return { id: targetId, pos, depth, parentId };
  };

  const sameDrop = (a: RowDrop | null, b: RowDrop | null) =>
    (!a && !b) || (!!a && !!b && a.id === b.id && a.pos === b.pos && a.depth === b.depth);

  const onRowDragStart = useStableCallback((id: string) => {
    // Defer the state update: setting React state synchronously inside dragstart
    // re-renders the dragged row and aborts the native drag (the "first drag does
    // nothing / row stays dimmed" bug). A frame later the drag is committed.
    requestAnimationFrame(() => {
      setRowDragId(id);
      setRowDrop(null);
      setEditing(null);
      setMenu(null);
    });
  });

  // dragOver on a task/collection row — recompute and stash the resolved drop.
  const onRowDragOver = useStableCallback((targetId: string, e: React.DragEvent) => {
    if (!rowDragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    let next: RowDrop | null = null;
    if (sectionsConfig.groupBy === 'collection') {
      next = computeTreeDrop(targetId, e);
    } else if (targetId !== rowDragId) {
      // Attribute-grouped: reorder before/after; no nesting (depth stays fixed).
      const idx = groupedRows.findIndex((r) => r.type === 'task' && r.node.id === targetId);
      const row = idx >= 0 ? groupedRows[idx] : null;
      if (row && row.type === 'task') {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        if (ratio < 0.5) {
          next = { id: targetId, pos: 'before', depth: row.node.depth, parentId: null, group: row.group };
        } else {
          // 'after' — merge with the next task when it's in the same group, so the
          // single gap between two same-group siblings shows one stable indicator.
          const nxt = groupedRows[idx + 1];
          next = nxt && nxt.type === 'task' && nxt.group === row.group && nxt.node.id !== rowDragId
            ? { id: nxt.node.id, pos: 'before', depth: nxt.node.depth, parentId: null, group: nxt.group }
            : { id: targetId, pos: 'after', depth: row.node.depth, parentId: null, group: row.group };
        }
      }
    }
    setRowDrop((prev) => (sameDrop(prev, next) ? prev : next));
  });

  // dragOver on a section header (attribute-grouped mode) — drop at the top of it.
  const onHeaderDragOver = (headerId: string, group: string, e: React.DragEvent) => {
    if (!rowDragId || sectionsConfig.groupBy === 'collection') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const next: RowDrop = { id: headerId, pos: 'inside', depth: 1, parentId: null, group };
    setRowDrop((prev) => (sameDrop(prev, next) ? prev : next));
  };

  // Commit a collection-tree drop: set the moved node's parent, splice it next to
  // the target in the full order, then persist via orderFromFlat (children follow).
  const commitTreeDrop = (dragId: string, drop: RowDrop) => {
    const full = flattenTree(processedEntries).map((n) => ({ id: n.id, parentId: n.parentId }));
    const fromIdx = full.findIndex((n) => n.id === dragId);
    if (fromIdx === -1) return;
    const moved = { id: dragId, parentId: drop.parentId };
    const without = full.filter((_, i) => i !== fromIdx);
    let at = without.findIndex((n) => n.id === drop.id);
    if (at === -1) return;
    if (drop.pos === 'after' || drop.pos === 'inside') at += 1;
    without.splice(at, 0, moved);
    let order = orderFromFlat(without);
    // In a collection view the collection node is hidden, so its direct children
    // read as depth-0 (parentId null). Re-anchor them to the collection on save.
    if (selectedCollectionId) order = order.map((n) => ({ id: n.id, parentId: n.parentId ?? selectedCollectionId }));
    onReorder(order);
  };

  // Commit an attribute-grouped drop: optionally reassign the grouping attribute
  // (cross-section), then reorder within the global hub order (parentId preserved).
  const commitGroupedDrop = (dragId: string, drop: RowDrop) => {
    const activeEntry = byId.get(dragId);
    if (!activeEntry) return;
    const taskRows = groupedRows.filter((r): r is Extract<GroupRow, { type: 'task' }> => r.type === 'task');
    const activeGroup = taskRows.find((r) => r.node.id === dragId)?.group ?? '';
    const targetGroup = drop.group ?? '';

    if (targetGroup !== activeGroup) {
      const patch = groupAssignmentPatch(sectionsConfig.groupBy, targetGroup);
      if (patch) onSaveTodo(activeEntry.date, activeEntry.date, { ...activeEntry.todo, ...patch });
    }

    const ordered = [...entries]
      .sort((a, b) => (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt))
      .map((e) => e.todo.id);
    const without = ordered.filter((id) => id !== dragId);
    // Header drop ('inside') anchors before the first task already in that section.
    let targetId = drop.id;
    if (drop.pos === 'inside') {
      targetId = taskRows.find((r) => r.group === targetGroup && r.node.id !== dragId)?.node.id ?? '';
    }
    let at = without.indexOf(targetId);
    if (at !== -1) {
      if (drop.pos === 'after') at += 1;
      without.splice(at, 0, dragId);
      onReorder(without.map((id) => ({ id, parentId: byId.get(id)?.todo.parentId ?? null })));
    }
  };

  const onRowDrop = useStableCallback(() => {
    if (rowDragId && rowDrop) {
      if (sectionsConfig.groupBy === 'collection') commitTreeDrop(rowDragId, rowDrop);
      else commitGroupedDrop(rowDragId, rowDrop);
    }
    resetDrag();
  });

  // The popover (tags/notes/status/priority) edits the entry currently being edited.
  const editingEntry =
    editing && POPOVER_COLS.includes(editing.col)
      ? entries.find((e) => e.todo.id === editing.id) || null
      : null;

  const fullViewEntry = fullViewId ? entries.find((e) => e.todo.id === fullViewId) || null : null;

  const saveFullTodo = (updated: Todo, newDate: string) => {
    let oldDate: string | null = null;
    for (const d of dayTodos) {
      if ((d.todos || []).some((t) => t && t.id === updated.id)) {
        oldDate = hasDate(d.date) ? d.date : null;
        break;
      }
    }
    onSaveTodo(oldDate, newDate || null, updated);
  };

  const headerCellCls =
    'relative flex items-center px-2.5 text-xs font-semibold tracking-wide text-white/75 hover:bg-[#0f0f0f] select-none';

  const sidebarItemCls = (view: string, compact = false) =>
    `w-full flex items-center rounded-lg text-left transition-colors ${
      compact ? 'gap-1.5 px-2 py-1.5 text-[13px]' : 'gap-2 pl-2.5 pr-1.5 py-1.5 text-sm'
    } ${
      selectedView === view
        ? 'bg-white/10 text-white font-medium'
        : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
    }`;

  return (
    <div className="h-full flex">
      {/* Left pane — full-height collection picker (resizable) */}
      {!sidebarHidden && (
        <aside
          style={{ width: sidebarWidth }}
          className="group/pane relative shrink-0 flex flex-col min-h-0 border-r border-white/10"
        >
          {/* ── Workspaces section (top) — independent todo databases ───────── */}
          <div className="shrink-0 flex flex-col max-h-[38%] border-b border-white/10 p-2">
            <div className="shrink-0 px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30">
              Workspaces
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
              {workspaces.map((ws) => {
                const active = ws.id === activeWorkspaceId;
                if (renamingWorkspaceId === ws.id) {
                  return (
                    <input
                      key={ws.id}
                      type="text"
                      autoFocus
                      defaultValue={ws.name}
                      onChange={(e) => onRenameWorkspace(ws.id, e.target.value)}
                      onBlur={() => setRenamingWorkspaceId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                      }}
                      placeholder="Workspace name"
                      className="w-full rounded-lg px-2.5 py-1.5 text-sm font-medium bg-white/10 text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60 placeholder:text-white/40"
                    />
                  );
                }
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => onSelectWorkspace(ws.id)}
                    onDoubleClick={() => setRenamingWorkspaceId(ws.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${
                      active ? 'bg-white/10 text-white font-medium' : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
                    }`}
                    title={ws.name || 'Untitled workspace'}
                  >
                    <Box size={15} className="shrink-0 text-white/45" />
                    <span className="flex-1 truncate">{ws.name || 'Untitled workspace'}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleNewWorkspace}
              title="New workspace"
              className="shrink-0 mt-0.5 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <Plus size={15} />
              <span>New workspace</span>
            </button>
          </div>

          {/* ── Collections section (bottom) ────────────────────────────────── */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Fixed header: title + the two pseudo-views as separate rows */}
            <div className="shrink-0 p-2 pb-1 space-y-0.5">
              <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30">
                Collections
              </div>
              <button type="button" onClick={() => setSelectedView('all')} className={sidebarItemCls('all')} title="All Tasks">
                <Layers size={15} className="shrink-0 text-white/45" />
                <span className="flex-1 truncate">All Tasks</span>
                <span className="text-xs text-white/35 font-mono mr-1.5">{allCount}</span>
              </button>
              <button type="button" onClick={() => setSelectedView('uncategorized')} className={sidebarItemCls('uncategorized')} title="Uncategorized">
                <Inbox size={15} className="shrink-0 text-white/45" />
                <span className="flex-1 truncate">Uncategorized</span>
                <span className="text-xs text-white/35 font-mono mr-1.5">{uncategorizedCount}</span>
              </button>
            </div>

            

            {/* Scrollable list of collections — nested tree, indented by depth.
                The drop is handled here (not per-row) so releases that land in
                the gap between rows still commit the current drop target. */}
            <div
              ref={sideScroll.ref}
              className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
              onDragOver={dragCollId ? sideScroll.onDragOver : undefined}
              onDragEnter={dragCollId ? sideScroll.onDragEnter : undefined}
              onDrop={(e) => { e.preventDefault(); onCollDrop(); }}
            >
              {visibleCollections.map(({ entry: c, depth, hasChildren }) => {
                const color = c.todo.color || DEFAULT_COLLECTION_COLOR;
                const indent = depth * SIDEBAR_INDENT;
                const drop = dropInfo?.id === c.todo.id ? dropInfo.pos : null;
                return (
                  <div
                    key={c.todo.id}
                    className="relative"
                    draggable
                    onDragStart={(e) => {
                      setDragCollId(c.todo.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', c.todo.id);
                    }}
                    onDragEnd={() => { setDragCollId(null); setDropInfo(null); sideScroll.stop(); }}
                    onDragOver={(e) => onCollDragOver(e, c.todo.id)}
                  >
                    {/* Reorder line — drawn at the target's indent level */}
                    {drop === 'before' && (
                      <div className="pointer-events-none absolute -top-px left-0 right-1.5 z-10 h-0.5 rounded-full bg-[var(--accent2)]" style={{ marginLeft: 6 + indent }} />
                    )}
                    {drop === 'after' && (
                      <div className="pointer-events-none absolute -bottom-px left-0 right-1.5 z-10 h-0.5 rounded-full bg-[var(--accent2)]" style={{ marginLeft: 6 + indent }} />
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedView(c.todo.id)}
                      onContextMenu={(e) => { e.preventDefault(); openMenu(c.todo.id, e.clientX, e.clientY); }}
                      style={{ paddingLeft: 6 + indent }}
                      className={`${sidebarItemCls(c.todo.id)} ${dragCollId === c.todo.id ? 'opacity-40' : ''} ${
                        drop === 'inside' ? 'ring-2 ring-inset ring-[var(--accent2)] bg-[var(--accent2)]/10' : ''
                      }`}
                      title={c.todo.text || 'Untitled collection'}
                    >
                      <Shapes size={15} className="shrink-0" style={{ color }} />
                      <span className="flex-1 truncate">{c.todo.text || 'Untitled collection'}</span>
                      {/* Right slot: task count by default; on pane hover, collections
                          with nested children swap it for an expand/collapse toggle. */}
                      {hasChildren ? (
                        <>
                          <span className="text-xs text-white/35 group-hover/pane:hidden mr-1.5 font-mono">{collectionCount(c.todo.id)}</span>
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); toggleCollColl(c.todo.id); }}
                            className="hidden shrink-0 -my-0.5 items-center justify-center rounded p-0.5 text-white/45 hover:text-white hover:bg-white/10 transition-colors group-hover/pane:flex"
                            title={collapsedColls.has(c.todo.id) ? 'Expand' : 'Collapse'}
                          >
                            {collapsedColls.has(c.todo.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-white/35 font-mono mr-1.5">{collectionCount(c.todo.id)}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* New collection */}
          <button
            type="button"
            onClick={handleNewCollection}
            className="shrink-0 m-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <FolderPlus size={15} />
            <span>New collection</span>
          </button>

          {/* Drag handle to resize the pane */}
          <div
            onMouseDown={startSidebarResize}
            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent2)]/40 transition-colors"
          />
        </aside>
      )}

      {/* Right pane — header + task table */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Page header — tight, Notion-like */}
        <div className="shrink-0 flex items-center gap-2.5 px-4 pt-4 pb-3">
          <button
            type="button"
            onClick={() => setSidebarHidden((v) => !v)}
            title={sidebarHidden ? 'Show collections' : 'Hide collections'}
            className="shrink-0 p-1 -ml-0.5 rounded text-white/45 hover:text-white hover:bg-white/10 transition-colors"
          >
            {sidebarHidden ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <h1 className="text-lg font-bold">Task Planner</h1>
          <span className="text-xs text-white/25">/</span>
          {selectedCollectionId ? (
            <CollectionBreadcrumb
              path={collectionPath(selectedCollectionId, todoById).map((c) => ({
                id: c.id,
                name: c.text || 'Untitled',
                color: c.color,
              }))}
            />
          ) : (
            <span className="text-xs font-medium text-white/70 truncate max-w-[260px]">{viewLabel}</span>
          )}
          <span className="text-xs text-white/40">{currentCount} item{currentCount === 1 ? '' : 's'}</span>
        </div>

        {/* View toolbar — UI scaffold only; none of these are wired up yet. */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 pb-2.5">
          {/* View tabs */}
          <div className="flex items-center gap-1">
            {([
              { label: 'Table', icon: Table, active: true },
              { label: 'List', icon: List, active: false },
              { label: 'Timeline', icon: GanttChart, active: false },
            ] as const).map(({ label, icon: Icon, active }) => (
              <button
                key={label}
                type="button"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-1">
            {/* Sections */}
            <button
              type="button"
              onClick={(e) => {
                if (sectionsMenu) { setSectionsMenu(null); return; }
                setFieldsMenu(null); setFilterMenu(null); setSortMenu(null);
                const r = e.currentTarget.getBoundingClientRect();
                setSectionsMenu({ right: window.innerWidth - r.right, top: r.bottom + 6 });
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] transition-colors ${
                sectionsMenu ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white hover:bg-white/5'
              }`}
            >
              <Group size={14} /> Sections
            </button>

            {/* Fields */}
            <button
              type="button"
              onClick={(e) => {
                if (fieldsMenu) { setFieldsMenu(null); return; }
                setFilterMenu(null); setSortMenu(null);
                const r = e.currentTarget.getBoundingClientRect();
                setFieldsMenu({ right: window.innerWidth - r.right, top: r.bottom + 6 });
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] transition-colors ${
                fieldsMenu ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white hover:bg-white/5'
              }`}
            >
              <Columns3 size={14} /> Fields
            </button>

            {/* Filter */}
            <button
              type="button"
              onClick={(e) => {
                if (filterMenu) { setFilterMenu(null); return; }
                setFieldsMenu(null); setSortMenu(null);
                const r = e.currentTarget.getBoundingClientRect();
                setFilterMenu({ right: window.innerWidth - r.right, top: r.bottom + 6 });
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] transition-colors ${
                filterMenu ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white hover:bg-white/5'
              }`}
            >
              <Filter size={14} /> Filter
              {activeFilters.length > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[var(--accent2)] text-[10px] font-bold text-white px-1">
                  {activeFilters.length}
                </span>
              )}
            </button>

            {/* Sort */}
            <button
              type="button"
              onClick={(e) => {
                if (sortMenu) { setSortMenu(null); return; }
                setFieldsMenu(null); setFilterMenu(null);
                const r = e.currentTarget.getBoundingClientRect();
                setSortMenu({ right: window.innerWidth - r.right, top: r.bottom + 6 });
              }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] transition-colors ${
                sortMenu ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white hover:bg-white/5'
              }`}
            >
              <ArrowUpDown size={14} /> Sort
              {activeSorts.length > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[var(--accent2)] text-[10px] font-bold text-white px-1">
                  {activeSorts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Task table — single scroll container, both axes. */}
        <div
          ref={tableScroll.ref}
          onDragOver={tableScroll.onDragOver}
          onDragEnter={tableScroll.onDragEnter}
          // Fallback drop: releasing over the header bar / gaps (not a row) still
          // commits the current indicator. Row/header onDrop call stopPropagation
          // so this never double-fires.
          onDrop={(e) => { e.preventDefault(); onRowDrop(); }}
          className="flex-1 min-w-0 overflow-auto border-t border-white/10 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
        >
        
        {/* Header row — full-bleed bar: its background + bottom border span the
            whole width (no left/right gaps), but it carries the same TABLE_PAD
            padding and w-max width as the rows below, so the padding sits outside
            the grid tracks and the column borders line up with the body. */}
          <div
            className="grid sticky top-0 z-30 w-max min-w-full bg-[#0a0a0a] border-b border-white/10 h-9"
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
          onMove={moveField}
          onToggle={toggleField}
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

      {/* Tags / Notes popover editor (portal, escapes the scroll container) */}
      {editing && editingEntry && editing.rect && createPortal(
        <>
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              left: popoverPos?.left ?? editing.rect.left,
              top: popoverPos?.top ?? editing.rect.bottom + 4,
              width: editing.col === 'date'
                ? 240
                : Math.max(editing.rect.width, editing.col === 'status' || editing.col === 'priority' ? 180 : 260),
            }}
            className={
              editing.col === 'date'
                ? 'z-[58] shadow-2xl'
                : 'z-[58] rounded-lg border border-white/10 bg-[#1f1f1f] shadow-2xl p-2'
            }
          >
            {editing.col === 'status' || editing.col === 'priority' ? (
              <OptionSelectField
                options={editing.col === 'status' ? STATUS_OPTIONS : PRIORITY_OPTIONS}
                value={editing.col === 'status' ? editingEntry.todo.status : editingEntry.todo.priority}
                onChange={(val) => {
                  onSaveTodo(editingEntry.date, editingEntry.date, {
                    ...editingEntry.todo,
                    [editing.col]: val || undefined,
                    // Status drives the checkbox: Completed ⇒ checked, anything else ⇒ unchecked.
                    ...(editing.col === 'status' ? { completed: val === 'completed' } : {}),
                  });
                  stopEdit();
                }}
              />
            ) : editing.col === 'collection' ? (
              <CollectionSearchField
                value={collectionOf(editingEntry.todo, todoById)}
                currentPath={collPathFor(editingEntry.todo)}
                options={collectionOptions}
                onChange={(id) => { onSetTaskCollection(editingEntry.todo.id, id); stopEdit(); }}
                onCreate={onCreateCollection}
                autoFocus
              />
            ) : editing.col === 'date' ? (
              <CalendarInput
                value={editingEntry.date || ''}
                autoFocus
                showInDailyList={editingEntry.todo.showInDailyList ?? false}
                onShowInDailyListChange={(val) => {
                  onSaveTodo(editingEntry.date, editingEntry.date, {
                    ...editingEntry.todo,
                    showInDailyList: val,
                  });
                }}
                onChange={(val) => {
                  const updatedTodo = !val
                    ? { ...editingEntry.todo, showInDailyList: false }
                    : editingEntry.todo;
                  onSaveTodo(editingEntry.date, val || null, updatedTodo);
                }}
              />
            ) : (
              <NotesField
                value={editingEntry.todo.notes || ''}
                autoFocus
                minHeight={60}
                maxHeight={220}
                onChange={(val) =>
                  onSaveTodo(editingEntry.date, editingEntry.date, {
                    ...editingEntry.todo,
                    notes: val || undefined,
                  })
                }
                className="w-full bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none resize-none leading-relaxed [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full"
              />
            )}
          </div>
        </>,
        document.body
      )}

      {/* Right-click / 3-dot context menu */}
      {menu && createPortal(
        <>
          <div
            className="fixed inset-0 z-[65]"
            onMouseDown={closeMenu}
            onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}
          />
          <div
            ref={menuRef}
            style={{ position: 'fixed', left: menuPos?.left ?? menu.x, top: menuPos?.top ?? menu.y }}
            className="z-[66] min-w-[170px] rounded-lg border border-white/10 bg-[#1f1f1f] shadow-2xl p-1 text-sm"
          >
            {menuEntry?.todo.isCollection ? (
              <>
                <button
                  onClick={() => { setEditCollId(menu.id); closeMenu(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  onClick={() => {
                    const id = onAddSubtask(menu.id);
                    setCollapsed((prev) => { const n = new Set(prev); n.delete(menu.id); return n; });
                    closeMenu();
                    setEditing({ id, col: 'title', rect: null });
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <CornerDownRight size={14} /> Create task inside
                </button>
                <button
                  onClick={() => { handleNewNestedCollection(menu.id); closeMenu(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <FolderPlus size={14} /> Create nested collection
                </button>
                <button
                  onClick={() => setColorPickerOpen((v) => !v)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Palette size={14} /> Change color
                </button>
                {colorPickerOpen && (
                  <div className="grid grid-cols-4 gap-1.5 px-2.5 py-2">
                    {COLLECTION_COLORS.map((color) => {
                      const selected = (menuEntry.todo.color || DEFAULT_COLLECTION_COLOR) === color;
                      return (
                        <button
                          key={color}
                          title={color}
                          onClick={() => { setCollectionColor(menuEntry, color); closeMenu(); }}
                          className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                            selected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1f1f1f]' : 'ring-1 ring-white/15'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => { setFullViewId(menu.id); closeMenu(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Maximize2 size={14} /> Expand
                </button>
                <button
                  onClick={() => {
                    const id = onAddSubtask(menu.id);
                    setCollapsed((prev) => { const n = new Set(prev); n.delete(menu.id); return n; });
                    closeMenu();
                    setEditing({ id, col: 'title', rect: null });
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <CornerDownRight size={14} /> Create task inside
                </button>
                <button
                  onClick={() => { if (menuEntry) makeCollection(menuEntry); closeMenu(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <FolderPlus size={14} /> Create collection
                </button>
              </>
            )}
            <button
              onClick={() => { onArchiveTodo(menu.id); closeMenu(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Archive size={14} /> Archive
            </button>
            <button
              onClick={() => {
                // For a non-empty collection, ask whether to cascade or promote;
                // empty collections (and plain tasks) just delete straight away.
                if (
                  menuEntry?.todo.isCollection &&
                  entries.some((e) => (e.todo.parentId ?? null) === menu.id)
                ) {
                  setDeleteCollId(menu.id);
                } else {
                  onDeleteTodo(menu.id);
                }
                closeMenu();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-red-400 hover:bg-[#d93d42]/10 hover:text-red-300 transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>,
        document.body
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
              onSaveTodo(entry.date, entry.date, { ...entry.todo, text, color, parentId });
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
        const promoteTarget = parentColl?.todo.text || 'Uncategorized';
        return createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
            onMouseDown={() => setDeleteCollId(null)}
          >
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1c1c] p-5 shadow-2xl"
            >
              <h2 className="text-base font-bold text-white">
                Delete “{coll.todo.text || 'Untitled collection'}”
              </h2>
              <p className="mt-1.5 text-sm text-white/55">
                This collection contains tasks. What should happen to them?
              </p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => { onDeleteCollection(deleteCollId, 'promote'); setDeleteCollId(null); }}
                  className="w-full flex items-start gap-3 rounded-xl border border-white/10 p-3 text-left hover:bg-white/5 transition-colors"
                >
                  <Inbox size={18} className="shrink-0 mt-0.5 text-[var(--accent2)]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">Move tasks up one level</span>
                    <span className="block text-xs text-white/50">
                      Keep them — move into <span className="text-white/70 font-medium">{promoteTarget}</span> and delete only the collection.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => { onDeleteCollection(deleteCollId, 'cascade'); setDeleteCollId(null); }}
                  className="w-full flex items-start gap-3 rounded-xl border border-red-500/20 p-3 text-left hover:bg-[#d93d42]/10 transition-colors"
                >
                  <Trash2 size={18} className="shrink-0 mt-0.5 text-red-400" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-red-300">Delete all tasks</span>
                    <span className="block text-xs text-white/50">
                      Permanently remove the collection and everything nested inside it.
                    </span>
                  </span>
                </button>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteCollId(null)}
                  className="px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Expanded full view */}
      <AnimatePresence>
        {fullViewEntry && (
          <TodoFullView
            key={fullViewEntry.todo.id}
            todo={fullViewEntry.todo}
            date={fullViewEntry.date || ''}
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
