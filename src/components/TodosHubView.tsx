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
} from 'lucide-react';
import { DayTodos, Todo } from '../types';
import { getOrganizerTodos, OrganizerEntry, hasDate } from '../utils/todoFilters';
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
  TagsField,
} from './todoFields';

interface TodosHubViewProps {
  dayTodos: DayTodos[];
  allTags: string[];
  // Save an edited todo, moving it between date buckets when its date changes.
  onSaveTodo: (oldDate: string | null, newDate: string | null, updatedTodo: Todo) => void;
  onAddTodo: () => void;
  onAddSubtask: (parentId: string) => void;
  onDeleteTodo: (id: string) => void;
  onArchiveTodo: (id: string) => void;
  // Persist hub order + nesting (position = hubOrder, parentId = nesting).
  onReorder: (items: { id: string; parentId: string | null }[]) => void;
  onToggleTodo: (id: string) => void;
}

// ── Column model ─────────────────────────────────────────────────────────────
type ColKey = 'title' | 'date' | 'start' | 'end' | 'percent' | 'tags' | 'xp' | 'notes';

interface ColDef {
  key: ColKey;
  label: string;
  defaultWidth: number;
}

const COLUMNS: ColDef[] = [
  { key: 'title', label: 'Name', defaultWidth: 320 },
  { key: 'date', label: 'Date', defaultWidth: 150 },
  { key: 'start', label: 'Start', defaultWidth: 110 },
  { key: 'end', label: 'End', defaultWidth: 110 },
  { key: 'percent', label: '%', defaultWidth: 90 },
  { key: 'tags', label: 'Tags', defaultWidth: 220 },
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

const WIDTHS_KEY = 'dun-hub-col-widths';
const COLLAPSED_KEY = 'dun-hub-collapsed';

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
  // Collections are always top-level — never let one get nested under another node.
  if (activeItem.entry.todo.isCollection) return { depth: 0, parentId: null };
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

  const dragDepth = Math.round(dragOffset / indentWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  const depth = Math.max(minDepth, Math.min(projectedDepth, maxDepth));

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

  return { depth, parentId: getParentId() };
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
  allTags,
  onSaveTodo,
  onAddTodo,
  onAddSubtask,
  onDeleteTodo,
  onArchiveTodo,
  onReorder,
  onToggleTodo,
}) => {
  const entries = getOrganizerTodos(dayTodos);

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
  const popoverOpen = !!editing && (editing.col === 'tags' || editing.col === 'notes');
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
      tags: undefined,
      notes: undefined,
    });
  };
  const setCollectionColor = (entry: OrganizerEntry, color: string) =>
    onSaveTodo(entry.date, entry.date, { ...entry.todo, color });

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
    () => flattenTree(entries, { collapsed, excludeId: activeId ?? undefined }),
    [entries, collapsed, activeId]
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
      const cloned = flattenTree(entries); // full order, nothing hidden
      const overIndex = cloned.findIndex((i) => i.id === over.id);
      const activeIndex = cloned.findIndex((i) => i.id === active.id);
      if (activeIndex !== -1 && overIndex !== -1) {
        cloned[activeIndex] = { ...cloned[activeIndex], parentId: proj.parentId };
        const sorted = arrayMove(cloned, activeIndex, overIndex);
        onReorder(orderFromFlat(sorted.map((n) => ({ id: n.id, parentId: n.parentId }))));
      }
    }
    resetDrag();
  };

  // The tags/notes popover edits the entry currently being edited.
  const editingEntry =
    editing && (editing.col === 'tags' || editing.col === 'notes')
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

  return (
    <div className="h-full flex flex-col">
      {/* Page header — tight, Notion-like */}
      <div className="shrink-0 flex items-baseline gap-3 px-7.5 pt-4 pb-3">
        <h1 className="text-lg font-bold">Task Planner</h1>
        <span className="text-xs text-white/50">{entries.length} item{entries.length === 1 ? '' : 's'}</span>
      </div>

      {/* Single scroll container — both axes (spreadsheet style) */}
      <div className="flex-1 overflow-auto border-t border-white/10 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
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
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add row */}
          <button
            type="button"
            onClick={onAddTodo}
            className="flex items-center gap-2 w-full h-9 px-3 text-sm text-white/60 hover:text-white hover:bg-white/[0.03] border-b border-white/8 cursor-pointer transition-colors"
          >
            <Plus size={14} />
            <span>New</span>
          </button>

          {entries.length === 0 && (
            <div className="px-3 py-6 text-xs text-white/50">
              No database todos yet. Click “New”, or set <code>showInDatabase: true</code> on a todo.
            </div>
          )}

          {/* Bottom dead space so the last row isn't flush to the edge and the
              right-click context menu has room to open fully below it. */}
          <div aria-hidden style={{ height: BOTTOM_SPACER }} />
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
              width: Math.max(editing.rect.width, 260),
            }}
            className="z-[58] rounded-lg border border-white/10 bg-[#1f1f1f] shadow-2xl p-2"
          >
            {editing.col === 'tags' ? (
              <TagsField
                tags={editingEntry.todo.tags || []}
                allTags={allTags}
                autoFocus
                onChange={(tags) =>
                  onSaveTodo(editingEntry.date, editingEntry.date, {
                    ...editingEntry.todo,
                    tags: tags.length ? tags : undefined,
                  })
                }
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
              onClick={() => { onDeleteTodo(menu.id); closeMenu(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-red-400 hover:bg-[#d93d42]/10 hover:text-red-300 transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Expanded full view */}
      <AnimatePresence>
        {fullViewEntry && (
          <TodoFullView
            key={fullViewEntry.todo.id}
            todo={fullViewEntry.todo}
            date={fullViewEntry.date || ''}
            allTags={allTags}
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
}) => {
  const { entry, hasChildren } = node;
  const { todo, date } = entry;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
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
        style={{ transform: CSS.Transform.toString(transform), transition }}
        onContextMenu={(e) => { e.preventDefault(); openMenu(todo.id, e.clientX, e.clientY); }}
        className={`flex items-end w-full min-h-[58px] border-b border-white/8 group/row ${
          isDragging ? 'relative z-10 bg-[#262626] ring-1 ring-[var(--accent2)]/50 rounded-sm' : 'hover:bg-white/[0.015]'
        }`}
      >
        {/* Header group, pinned to the left so it stays visible while scrolling. */}
        <div
          style={{ paddingLeft: NAME_BASE_PAD }}
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
              style={{ backgroundColor: `${color}26`, color }}
              className="min-w-0 max-w-full rounded-full px-2.5 py-1 text-sm font-medium focus:outline-none placeholder:text-white/40"
            />
          ) : (
            <span
              onClick={(e) => startEdit(todo.id, 'title', e)}
              style={{ backgroundColor: `${color}26`, color }}
              className="min-w-0 max-w-full truncate rounded-full px-2.5 py-1 text-sm medium cursor-text"
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
      <DisplayCell col="tags">
        {(todo.tags || []).length ? (
          <div className="flex items-center gap-1 overflow-hidden">
            {todo.tags!.map((t) => (
              <span
                key={t}
                className="shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--accent2)]/15 text-[var(--accent2)] text-xs font-semibold whitespace-nowrap"
              >
                {t}
              </span>
            ))}
          </div>
        ) : (
          muted
        )}
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
