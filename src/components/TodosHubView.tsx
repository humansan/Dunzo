import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragMoveEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import {
  GripVertical,
  Plus,
  Archive,
  Trash2,
  Maximize2,
  MoreHorizontal,
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
import { formatTime12h } from '../utils/timeUtils';
import { TodoFullView } from './TodoFullView';
import {
  CompletedToggle,
  DateField,
  StartTimeField,
  EndTimeField,
  PercentField,
  XpField,
  NotesField,
  CollectionSearchField,
  CollectionBreadcrumb,
  OptionChip,
  OptionSelectField,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  statusOption,
  priorityOption,
} from './todoFields';

interface TodosHubViewProps {
  dayTodos: DayTodos[];
  // Collections available to assign (active-workspace scoped) + helpers.
  collectionOptions: CollectionOption[];
  onSetTaskCollection: (taskId: string, collectionId: string | null) => void;
  onCreateCollection: (name: string) => string;
  // Save an edited todo, moving it between date buckets when its date changes.
  onSaveTodo: (oldDate: string | null, newDate: string | null, updatedTodo: Todo) => void;
  onAddTodo: () => void;
  onAddSubtask: (parentId: string) => void;
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

// ── Column model ─────────────────────────────────────────────────────────────
type ColKey = 'title' | 'status' | 'priority' | 'date' | 'start' | 'end' | 'percent' | 'collection' | 'xp' | 'notes';

interface ColDef {
  key: ColKey;
  label: string;
  defaultWidth: number;
}

const COLUMNS: ColDef[] = [
  { key: 'title', label: 'Name', defaultWidth: 320 },
  { key: 'status', label: 'Status', defaultWidth: 140 },
  { key: 'priority', label: 'Priority', defaultWidth: 120 },
  { key: 'date', label: 'Date', defaultWidth: 150 },
  { key: 'start', label: 'Start', defaultWidth: 110 },
  { key: 'end', label: 'End', defaultWidth: 110 },
  { key: 'percent', label: '%', defaultWidth: 90 },
  { key: 'collection', label: 'Collection', defaultWidth: 240 },
  { key: 'xp', label: 'XP', defaultWidth: 80 },
  { key: 'notes', label: 'Notes', defaultWidth: 280 },
];

const MIN_COL_WIDTH = 80;
const INDENT = 22; // px per nesting level (must match getProjection)
const NAME_BASE_PAD = 6; // px of breathing room between the left edge and the top-level controls
const SPACER_WIDTH = 120; // trailing dead-space track so the last column's resize handle is reachable
const BOTTOM_SPACER = 260; // px of dead space below the last row so the context menu has room to open
const LAST_COL_KEY = COLUMNS[COLUMNS.length - 1].key; // gets a right divider to mark where the spacer begins

// Collection pill palette — 8 picks that read well as tinted-bg + colored-text on
// the dark table. The first is the default applied when a task becomes a collection.
const COLLECTION_COLORS = [
  '#9ca3af', // gray
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#4ade80', // green
  '#2dd4bf', // teal
  '#60a5fa', // blue
  '#c084fc', // purple
];
const DEFAULT_COLLECTION_COLOR = COLLECTION_COLORS[0];

// Pill label color: lighten the collection color toward white so the name reads
// with high contrast against the dark tinted-bg pill.
const pillTextColor = (color: string) => `color-mix(in srgb, ${color} 55%, white)`;

const WIDTHS_KEY = 'dun-hub-col-widths';
const COLLAPSED_KEY = 'dun-hub-collapsed';
const VIEW_KEY = 'dun-hub-view'; // which sidebar entry is selected ('all' | 'uncategorized' | collection id)
const SIDEBAR_WIDTH_KEY = 'dun-hub-sidebar-width';
const SIDEBAR_HIDDEN_KEY = 'dun-hub-sidebar-hidden';
const SIDEBAR_COLLAPSED_KEY = 'dun-hub-sidebar-collapsed'; // expand/collapse state of the collection tree
const SIDEBAR_INDENT = 14; // px per nesting level in the sidebar tree
const MIN_SIDEBAR_WIDTH = 170;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 224;

type EditState = { id: string; col: ColKey; rect: DOMRect } | null;

// A todo placed in the tree: its structural parent + depth + display order.
interface FlatNode {
  id: string;
  parentId: string | null;
  depth: number;
  entry: OrganizerEntry;
  hasChildren: boolean;
}

// Borderless input styling so the shared editors fill a spreadsheet cell.
const cellEditCls =
  'w-full h-full bg-[#1e1e1e] px-2.5 text-sm font-mono text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60';

// ── Tree helpers ─────────────────────────────────────────────────────────────

// Flatten the organizer todos into display order (depth-first by hubOrder),
// hiding collapsed nodes' children and, during a drag, the active node's subtree.
function flattenTree(
  entries: OrganizerEntry[],
  opts: { collapsed?: Set<string>; excludeId?: string } = {}
): FlatNode[] {
  const ids = new Set(entries.map((e) => e.todo.id));
  const byParent = new Map<string | null, OrganizerEntry[]>();
  for (const e of entries) {
    const pid = e.todo.parentId && ids.has(e.todo.parentId) ? e.todo.parentId : null;
    const arr = byParent.get(pid) ?? [];
    arr.push(e);
    byParent.set(pid, arr);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.todo.hubOrder ?? a.todo.createdAt) - (b.todo.hubOrder ?? b.todo.createdAt));
  }
  const out: FlatNode[] = [];
  const walk = (pid: string | null, depth: number) => {
    for (const e of byParent.get(pid) ?? []) {
      const id = e.todo.id;
      const hasChildren = (byParent.get(id)?.length ?? 0) > 0;
      out.push({ id, parentId: pid, depth, entry: e, hasChildren });
      const skip = opts.collapsed?.has(id) || opts.excludeId === id;
      if (!skip) walk(id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// Given the rendered list plus where the active item is being dropped and how far
// it's been dragged horizontally, compute its projected depth + new parent.
function getProjection(
  items: FlatNode[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentWidth: number
): { depth: number; parentId: string | null } | null {
  const overItemIndex = items.findIndex((i) => i.id === overId);
  const activeItemIndex = items.findIndex((i) => i.id === activeId);
  if (overItemIndex === -1 || activeItemIndex === -1) return null;

  const activeItem = items[activeItemIndex];
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

  const dragDepth = Math.round(dragOffset / indentWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  let depth = Math.max(minDepth, Math.min(projectedDepth, maxDepth));

  const getParentId = (): string | null => {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentId;
    if (depth > previousItem.depth) return previousItem.id;
    const candidate = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((i) => i.depth === depth);
    return candidate ? candidate.parentId : null;
  };

  let parentId = getParentId();

  // A collection may only sit at the top level or nested under another
  // collection — never under a task. Snap its computed parent up to the nearest
  // collection ancestor and re-derive its depth from there.
  if (activeItem.entry.todo.isCollection) {
    const nodeById = new Map(items.map((i) => [i.id, i]));
    const nearestColl = (id: string | null): string | null => {
      let cur = id;
      const seen = new Set<string>();
      while (cur && nodeById.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const n = nodeById.get(cur)!;
        if (n.entry.todo.isCollection) return cur;
        cur = n.parentId;
      }
      return null;
    };
    parentId = nearestColl(parentId);
    depth = parentId ? nodeById.get(parentId)!.depth + 1 : 0;
  }

  return { depth, parentId };
}

// Rebuild a contiguous parent-grouped order from a (possibly detached) flat list,
// so subtasks always follow their parent after a drop.
function orderFromFlat(
  nodes: { id: string; parentId: string | null }[]
): { id: string; parentId: string | null }[] {
  const byParent = new Map<string | null, string[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n.id);
    byParent.set(n.parentId, arr);
  }
  const out: { id: string; parentId: string | null }[] = [];
  const visited = new Set<string>();
  const walk = (pid: string | null) => {
    for (const id of byParent.get(pid) ?? []) {
      if (visited.has(id)) continue;
      visited.add(id);
      out.push({ id, parentId: pid });
      walk(id);
    }
  };
  walk(null);
  // Safety: any unreachable nodes (e.g. cycles) fall back to the root.
  for (const n of nodes) if (!visited.has(n.id)) { visited.add(n.id); out.push({ id: n.id, parentId: null }); }
  return out;
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
  const entries = getOrganizerTodos(dayTodos).filter(
    (e) => (e.todo.workspaceId ?? 'personal') === activeWorkspaceId
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
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

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

  // Trailing spacer track gives the last column breathing room and a draggable resize handle.
  const gridTemplateColumns = `${COLUMNS.map((c) => `${widths[c.key]}px`).join(' ')} ${SPACER_WIDTH}px`;

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
  const startEdit = (id: string, col: ColKey, e: React.MouseEvent) => {
    setEditing({ id, col, rect: e.currentTarget.getBoundingClientRect() });
  };
  const stopEdit = () => setEditing(null);

  // Close the tags/notes popover when clicking outside it. A non-blocking listener
  // (vs. a full-screen overlay) lets the click also land on another cell, so a single
  // click both closes this editor and opens the next one.
  const popoverRef = useRef<HTMLDivElement>(null);
  const POPOVER_COLS: ColKey[] = ['collection', 'notes', 'status', 'priority'];
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

  // ── Row context menu & full-view ───────────────────────────────────────────
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false); // "Change color" sub-panel
  // Id of the collection pending a delete decision (cascade vs. promote).
  const [deleteCollId, setDeleteCollId] = useState<string | null>(null);
  const [fullViewId, setFullViewId] = useState<string | null>(null);
  const openMenu = (id: string, x: number, y: number) => { setMenu({ id, x, y }); setColorPickerOpen(false); };
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
      percentageGoal: undefined,
      startTime: undefined,
      endTime: undefined,
      xp: undefined,
      notes: undefined,
    });
  };
  const setCollectionColor = (entry: OrganizerEntry, color: string) =>
    onSaveTodo(entry.date, entry.date, { ...entry.todo, color });
  const renameCollection = (entry: OrganizerEntry, text: string) =>
    onSaveTodo(entry.date, entry.date, { ...entry.todo, text });

  // ── Sidebar selection (which collection / view the table shows) ────────────
  const [selectedView, setSelectedView] = useState<string>(
    () => localStorage.getItem(VIEW_KEY) || 'all'
  );
  useEffect(() => { localStorage.setItem(VIEW_KEY, selectedView); }, [selectedView]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
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
    setSelectedView(id);
    setRenamingId(id);
  };
  // Context-menu "Create nested collection": add a child under the target,
  // ensure the parent is expanded so the new node is visible, then rename it.
  const handleNewNestedCollection = (parentId: string) => {
    const id = onAddCollection(parentId);
    setCollapsedColls((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    setRenamingId(id);
  };
  // The table's "New" button adds into the selected collection, else top-level.
  const handleNewInView = selectedCollectionId
    ? () => onAddSubtask(selectedCollectionId)
    : onAddTodo;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditing(null); setMenu(null); setColorPickerOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Drag (reorder + reparent) ──────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  // Rendered rows: collapsed children hidden, and the active subtree collapsed
  // into its single row while dragging.
  const flattened = useMemo(
    () => flattenTree(viewEntries, { collapsed, excludeId: activeId ?? undefined }),
    [viewEntries, collapsed, activeId]
  );
  const ids = flattened.map((f) => f.id);

  const projected = activeId && overId ? getProjection(flattened, activeId, overId, offsetLeft, INDENT) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const resetDrag = () => { setActiveId(null); setOverId(null); setOffsetLeft(0); };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string);
    setOverId(active.id as string);
    setOffsetLeft(0);
    setEditing(null);
    setMenu(null);
  };
  const handleDragMove = ({ delta }: DragMoveEvent) => setOffsetLeft(delta.x);
  const handleDragOver = ({ over }: DragOverEvent) => setOverId((over?.id as string) ?? null);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const proj =
      over ? getProjection(flattened, active.id as string, over.id as string, offsetLeft, INDENT) : null;
    if (over && proj) {
      const cloned = flattenTree(viewEntries); // full order of the visible view, nothing hidden
      const overIndex = cloned.findIndex((i) => i.id === over.id);
      const activeIndex = cloned.findIndex((i) => i.id === active.id);
      if (activeIndex !== -1 && overIndex !== -1) {
        cloned[activeIndex] = { ...cloned[activeIndex], parentId: proj.parentId };
        const sorted = arrayMove(cloned, activeIndex, overIndex);
        // In a collection view the collection node is hidden, so its direct
        // children read as depth-0 (parentId null). Re-anchor them to the
        // collection on save so they keep their membership.
        const order = orderFromFlat(sorted.map((n) => ({ id: n.id, parentId: n.parentId })));
        onReorder(
          selectedCollectionId
            ? order.map((n) => ({ id: n.id, parentId: n.parentId ?? selectedCollectionId }))
            : order
        );
      }
    }
    resetDrag();
  };

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
    'relative flex items-center px-2.5 text-xs font-semibold tracking-wide text-white/75 select-none';

  const sidebarItemCls = (view: string, compact = false) =>
    `w-full flex items-center rounded-md text-left transition-colors ${
      compact ? 'gap-1.5 px-2 py-1.5 text-[13px]' : 'gap-2 px-2.5 py-1.5 text-sm'
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
                      className="w-full rounded-md px-2.5 py-1.5 text-sm font-medium bg-white/10 text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60 placeholder:text-white/40"
                    />
                  );
                }
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => onSelectWorkspace(ws.id)}
                    onDoubleClick={() => setRenamingWorkspaceId(ws.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${
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
              className="shrink-0 mt-0.5 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
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
                <span className="text-xs text-white/35">{allCount}</span>
              </button>
              <button type="button" onClick={() => setSelectedView('uncategorized')} className={sidebarItemCls('uncategorized')} title="Uncategorized">
                <Inbox size={15} className="shrink-0 text-white/45" />
                <span className="flex-1 truncate">Uncategorized</span>
                <span className="text-xs text-white/35">{uncategorizedCount}</span>
              </button>
            </div>

            {/* Scrollable list of collections — nested tree, indented by depth */}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
              {visibleCollections.map(({ entry: c, depth, hasChildren }) => {
                const color = c.todo.color || DEFAULT_COLLECTION_COLOR;
                const indent = depth * SIDEBAR_INDENT;
                if (renamingId === c.todo.id) {
                  return (
                    <input
                      key={c.todo.id}
                      type="text"
                      autoFocus
                      defaultValue={c.todo.text}
                      onChange={(e) => renameCollection(c, e.target.value)}
                      onBlur={() => setRenamingId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                      }}
                      placeholder="Collection name"
                      style={{ marginLeft: indent, backgroundColor: `${color}26`, color: pillTextColor(color) }}
                      className="rounded-md px-2.5 py-1.5 text-sm font-medium focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60 placeholder:text-white/40"
                    />
                  );
                }
                return (
                  <button
                    key={c.todo.id}
                    type="button"
                    onClick={() => setSelectedView(c.todo.id)}
                    onDoubleClick={() => setRenamingId(c.todo.id)}
                    onContextMenu={(e) => { e.preventDefault(); openMenu(c.todo.id, e.clientX, e.clientY); }}
                    style={{ paddingLeft: 6 + indent }}
                    className={sidebarItemCls(c.todo.id)}
                    title={c.todo.text || 'Untitled collection'}
                  >
                    <Shapes size={15} className="shrink-0" style={{ color }} />
                    <span className="flex-1 truncate">{c.todo.text || 'Untitled collection'}</span>
                    {/* Right slot: task count by default; on pane hover, collections
                        with nested children swap it for an expand/collapse toggle. */}
                    {hasChildren ? (
                      <>
                        <span className="text-xs text-white/35 group-hover/pane:hidden">{collectionCount(c.todo.id)}</span>
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); toggleCollColl(c.todo.id); }}
                          className="hidden shrink-0 items-center justify-center rounded text-white/45 hover:text-white hover:bg-white/10 transition-colors group-hover/pane:flex"
                          title={collapsedColls.has(c.todo.id) ? 'Expand' : 'Collapse'}
                        >
                          {collapsedColls.has(c.todo.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-white/35">{collectionCount(c.todo.id)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* New collection */}
          <button
            type="button"
            onClick={handleNewCollection}
            className="shrink-0 m-2 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
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
          <span className="text-xs font-medium text-white/70 truncate max-w-[260px]">{viewLabel}</span>
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
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
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
            {([
              { label: 'Sections', icon: Group },
              { label: 'Fields', icon: Columns3 },
              { label: 'Filter', icon: Filter },
              { label: 'Sort', icon: ArrowUpDown },
            ] as const).map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] text-white/45 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Task table — single scroll container, both axes. */}
        <div className="flex-1 min-w-0 overflow-auto border-t border-white/10 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
        <div className="w-max min-w-full text-white">
          {/* Header row */}
          <div
            className="grid sticky top-0 z-30 bg-[#141414] border-b border-white/10 h-9"
            style={{ gridTemplateColumns }}
          >
            {COLUMNS.map((c, idx) => (
              <div
                key={c.key}
                // The Name header gets the row's left padding so its label lines up with the row content.
                style={idx === 0 ? { paddingLeft: 30 } : undefined}
                className={`${headerCellCls} ${idx > 0 ? 'border-l border-white/8' : ''} ${
                  idx === 0 ? 'sticky left-0 z-10 bg-[#141414]' : ''
                } ${idx === COLUMNS.length - 1 ? 'border-r border-white/8' : ''}`}
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

          {/* Rows */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={resetDrag}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {flattened.map((node) => (
                <HubRow
                  key={node.id}
                  node={node}
                  displayDepth={activeId === node.id && projected ? projected.depth : node.depth}
                  gridTemplateColumns={gridTemplateColumns}
                  editing={editing}
                  startEdit={startEdit}
                  stopEdit={stopEdit}
                  onSaveTodo={onSaveTodo}
                  onToggleTodo={onToggleTodo}
                  openMenu={openMenu}
                  isCollapsed={collapsed.has(node.id)}
                  onToggleCollapse={toggleCollapse}
                  collPath={collPathFor(node.entry.todo)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add row */}
          <button
            type="button"
            onClick={handleNewInView}
            className="flex items-center gap-2 w-full h-9 px-3 text-sm text-white/60 hover:text-white hover:bg-white/[0.03] border-b border-white/8 cursor-pointer transition-colors"
          >
            <Plus size={14} />
            <span>New</span>
          </button>

          {flattened.length === 0 && (
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

      {/* Tags / Notes popover editor (portal, escapes the scroll container) */}
      {editing && editingEntry && editing.rect && createPortal(
        <>
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              left: editing.rect.left,
              top: editing.rect.bottom + 4,
              width: Math.max(editing.rect.width, editing.col === 'status' || editing.col === 'priority' ? 180 : 260),
            }}
            className="z-[58] rounded-lg border border-white/10 bg-[#1f1f1f] shadow-2xl p-2"
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
            style={{ position: 'fixed', left: menu.x, top: menu.y }}
            className="z-[66] min-w-[170px] rounded-lg border border-white/10 bg-[#1f1f1f] shadow-2xl p-1 text-sm"
          >
            {menuEntry?.todo.isCollection ? (
              <>
                <button
                  onClick={() => { setRenamingId(menu.id); closeMenu(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  onClick={() => {
                    onAddSubtask(menu.id);
                    setCollapsed((prev) => { const n = new Set(prev); n.delete(menu.id); return n; });
                    closeMenu();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <CornerDownRight size={14} /> Create subtask
                </button>
                <button
                  onClick={() => { handleNewNestedCollection(menu.id); closeMenu(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <FolderPlus size={14} /> Create nested collection
                </button>
                <button
                  onClick={() => setColorPickerOpen((v) => !v)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
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
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Maximize2 size={14} /> Expand
                </button>
                <button
                  onClick={() => {
                    onAddSubtask(menu.id);
                    setCollapsed((prev) => { const n = new Set(prev); n.delete(menu.id); return n; });
                    closeMenu();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <CornerDownRight size={14} /> Create subtask
                </button>
                <button
                  onClick={() => { if (menuEntry) makeCollection(menuEntry); closeMenu(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <FolderPlus size={14} /> Create collection
                </button>
              </>
            )}
            <button
              onClick={() => { onArchiveTodo(menu.id); closeMenu(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-white/80 hover:bg-white/10 hover:text-white transition-colors"
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
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-red-400 hover:bg-[#d93d42]/10 hover:text-red-300 transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>,
        document.body
      )}

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

// ── Row ──────────────────────────────────────────────────────────────────────
interface HubRowProps {
  node: FlatNode;
  displayDepth: number;
  gridTemplateColumns: string;
  editing: EditState;
  startEdit: (id: string, col: ColKey, e: React.MouseEvent) => void;
  stopEdit: () => void;
  onSaveTodo: (oldDate: string | null, newDate: string | null, updatedTodo: Todo) => void;
  onToggleTodo: (id: string) => void;
  openMenu: (id: string, x: number, y: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  collPath: { id: string; name: string; color?: string }[];
}

const HubRow: React.FC<HubRowProps> = ({
  node,
  displayDepth,
  gridTemplateColumns,
  editing,
  startEdit,
  stopEdit,
  onSaveTodo,
  onToggleTodo,
  openMenu,
  isCollapsed,
  onToggleCollapse,
  collPath,
}) => {
  const { entry, hasChildren } = node;
  const { todo, date } = entry;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    gridTemplateColumns,
  };

  const isEditing = (col: ColKey) => editing?.id === todo.id && editing?.col === col;
  const saveField = (patch: Partial<Todo>) => onSaveTodo(date, date, { ...todo, ...patch });
  const saveDate = (v: string) => onSaveTodo(date, v || null, todo);

  // A clickable display cell that switches into edit mode.
  const DisplayCell: React.FC<{ col: ColKey; children: React.ReactNode }> = ({ col, children }) => (
    <div
      onClick={(e) => startEdit(todo.id, col, e)}
      className={`flex items-center h-full px-2.5 border-l border-white/8 overflow-hidden cursor-pointer hover:bg-white/[0.03] ${
        col === LAST_COL_KEY ? 'border-r border-white/8' : ''
      }`}
    >
      {children}
    </div>
  );

  const editCellWrap = 'flex items-stretch h-full border-l border-white/8';
  // Empty fields render nothing — a placeholder dash just adds clutter.
  const muted = null;

  // ── Collection row ──────────────────────────────────────────────────────────
  // A section header, not a task: full-width (no column cells / dividers), taller,
  // no checkbox, with the name as a bottom-anchored colored pill.
  if (todo.isCollection) {
    const color = todo.color || DEFAULT_COLLECTION_COLOR;
    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        onContextMenu={(e) => { e.preventDefault(); openMenu(todo.id, e.clientX, e.clientY); }}
        className={`flex items-end w-full min-h-[58px] border-b border-white/8 group/row ${
          isDragging ? 'relative z-10 bg-[#262626] ring-1 ring-[var(--accent2)]/50 rounded-sm' : 'hover:bg-white/[0.015]'
        }`}
      >
        {/* Header group, pinned to the left so it stays visible while scrolling.
            Indents by nesting depth so sub-collections sit under their parent. */}
        <div
          style={{ paddingLeft: NAME_BASE_PAD + displayDepth * INDENT }}
          className="sticky left-0 flex items-end gap-1 pb-2 pr-4 min-w-0 max-w-full"
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(todo.id); }}
              className="shrink-0 mb-1 p-0.5 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title={isCollapsed ? 'Expand collection' : 'Collapse collection'}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : (
            <span className="shrink-0 w-[20px]" />
          )}

          <button
            {...attributes}
            {...listeners}
            className="shrink-0 mb-1.5 cursor-grab active:cursor-grabbing text-white/20 hover:text-white/60 opacity-0 group-hover/row:opacity-100 transition-opacity"
            title="Drag to reorder"
          >
            <GripVertical size={14} className="mr-1" />
          </button>

          {isEditing('title') ? (
            <input
              type="text"
              autoFocus
              defaultValue={todo.text}
              onChange={(e) => saveField({ text: e.target.value })}
              onBlur={stopEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="Collection name"
              size={1}
              style={{ backgroundColor: `${color}26`, color: pillTextColor(color) }}
              className="w-auto min-w-[60px] max-w-full [field-sizing:content] rounded-full px-2.5 py-1 text-sm font-medium focus:outline-none placeholder:text-white/40"
            />
          ) : (
            <span
              onClick={(e) => startEdit(todo.id, 'title', e)}
              style={{ backgroundColor: `${color}26`, color: pillTextColor(color) }}
              className="min-w-0 max-w-full truncate rounded-full px-2.5 py-1 text-sm font-medium cursor-text"
            >
              {todo.text || 'Untitled collection'}
            </span>
          )}

          <button
            type="button"
            title="Options"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              openMenu(todo.id, r.left, r.bottom + 4);
            }}
            className="shrink-0 mb-1.5 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/row:opacity-100 transition-all"
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onContextMenu={(e) => { e.preventDefault(); openMenu(todo.id, e.clientX, e.clientY); }}
      className={`grid items-stretch min-h-[36px] border-b border-white/8 group/row ${
        isDragging ? 'relative z-10 bg-[#262626] ring-1 ring-[var(--accent2)]/50 rounded-sm' : 'hover:bg-white/[0.015]'
      }`}
    >
      {/* Name group: indent + collapse + handle + checkbox + name.
          Frozen to the left edge; needs an opaque bg so scrolled cells don't show through. */}
      <div
        className={`sticky left-0 z-20 flex items-center h-full overflow-hidden border-r border-white/8 ${
          isDragging ? 'bg-[#262626]' : 'bg-[#0a0a0a] group-hover/row:bg-[#0e0e0e]'
        }`}
      >
        <div style={{ paddingLeft: NAME_BASE_PAD + displayDepth * INDENT }} className="flex items-center h-full min-w-0 flex-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(todo.id); }}
              className="shrink-0 p-0.5 flex items-center justify-center rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
            >
              {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            </button>
          ) : (
            <span className="shrink-0 w-[19px]" />
          )}

          <button
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab active:cursor-grabbing text-white/20 hover:text-white/60 opacity-0 group-hover/row:opacity-100 transition-opacity"
            title="Drag to reorder / nest"
          >
            <GripVertical size={14} className='mr-1' />
          </button>

          <CompletedToggle completed={todo.completed} onToggle={() => onToggleTodo(todo.id)} size={16} className='mr-1'/>

          {isEditing('title') ? (
            <input
              type="text"
              autoFocus
              defaultValue={todo.text}
              onChange={(e) => saveField({ text: e.target.value })}
              onBlur={stopEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="Untitled"
              className="flex-1 min-w-0 ml-1 h-full bg-[#1e1e1e] px-1.5 text-[15px] text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60"
            />
          ) : (
            <>
              <span
                onClick={(e) => startEdit(todo.id, 'title', e)}
                className={`flex-1 truncate ml-1 text-[15px] cursor-text ${todo.completed ? 'text-white/45 line-through' : 'text-white'}`}
              >
                {todo.text || <span className="text-white/40">Untitled</span>}
              </span>
              <button
                type="button"
                title="Options"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu(todo.id, r.left, r.bottom + 4);
                }}
                className="shrink-0 mr-1 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/row:opacity-100 transition-all"
              >
                <MoreHorizontal size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status (opens popover) */}
      <DisplayCell col="status">
        {todo.status ? <OptionChip option={statusOption(todo.status)!} /> : muted}
      </DisplayCell>

      {/* Priority (opens popover) */}
      <DisplayCell col="priority">
        {todo.priority ? <OptionChip option={priorityOption(todo.priority)!} /> : muted}
      </DisplayCell>

      {/* Date */}
      {isEditing('date') ? (
        <div className={editCellWrap}>
          <DateField value={date || ''} autoFocus onBlur={stopEdit} onChange={saveDate} className={cellEditCls} />
        </div>
      ) : (
        <DisplayCell col="date">
          <span className="truncate text-sm text-white/90">
            {date ? format(parseISO(date), 'MMM d, yyyy') : muted}
          </span>
        </DisplayCell>
      )}

      {/* Start time */}
      {isEditing('start') ? (
        <div className={editCellWrap}>
          <StartTimeField value={todo.startTime} autoFocus onBlur={stopEdit} onChange={saveField} className={cellEditCls} />
        </div>
      ) : (
        <DisplayCell col="start">
          <span className="truncate text-sm text-white/90">{todo.startTime ? formatTime12h(todo.startTime) : muted}</span>
        </DisplayCell>
      )}

      {/* End time */}
      {isEditing('end') ? (
        <div className={editCellWrap}>
          <EndTimeField value={todo.endTime} autoFocus onBlur={stopEdit} onChange={saveField} className={cellEditCls} />
        </div>
      ) : (
        <DisplayCell col="end">
          <span className="truncate text-sm text-white/90">{todo.endTime ? formatTime12h(todo.endTime) : muted}</span>
        </DisplayCell>
      )}

      {/* Percent */}
      {isEditing('percent') ? (
        <div className={editCellWrap}>
          <PercentField value={todo.percentageGoal} autoFocus onBlur={stopEdit} onChange={saveField} className={cellEditCls} />
        </div>
      ) : (
        <DisplayCell col="percent">
          <span className="truncate text-sm text-white/90">
            {todo.percentageGoal !== undefined ? `${todo.percentageGoal}%` : muted}
          </span>
        </DisplayCell>
      )}

      {/* Tags (opens popover) */}
      <DisplayCell col="collection">
        {collPath.length ? <CollectionBreadcrumb path={collPath} /> : muted}
      </DisplayCell>

      {/* XP */}
      {isEditing('xp') ? (
        <div className={editCellWrap}>
          <XpField value={todo.xp} autoFocus onBlur={stopEdit} onChange={(val) => saveField({ xp: val })} className={cellEditCls} />
        </div>
      ) : (
        <DisplayCell col="xp">
          <span className="truncate text-sm text-white/90">{todo.xp !== undefined ? `${todo.xp}` : muted}</span>
        </DisplayCell>
      )}

      {/* Notes (opens popover) */}
      <DisplayCell col="notes">
        {todo.notes ? (
          <span className="truncate text-sm text-white/90">{todo.notes}</span>
        ) : (
          muted
        )}
      </DisplayCell>
    </div>
  );
};
