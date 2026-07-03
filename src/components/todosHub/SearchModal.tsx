import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { Todo } from '../../types';
import { OrganizerEntry } from '../../utils/todoFilters';
import { VARIANTS } from './variant';
import { TaskTable, TableInteraction, TableRowHandlers, buildTreeModel } from './TaskTable';

// A command-palette search over the active workspace's tasks — a nesting, name-only,
// chrome-less `search` variant of the shared TaskTable. It matches tasks (never
// collections) by title + notes, then includes each match's subtask subtree so the
// results keep their hierarchy (expand/collapse), rendering through the same HubRow
// stack as every other view. Clicking a result's title opens its full view; there
// is no add-row (read-only surface).
const RESULT_LIMIT = 50;
const NOOP = () => {};

export const SearchModal: React.FC<{
  entries: OrganizerEntry[];
  todoById: Map<string, Todo>;
  onSaveTodo: (updatedTodo: Todo) => void;
  onToggleTodo: (id: string) => void;
  onOpenResult: (id: string) => void;
  onClose: () => void;
}> = ({ entries, todoById, onSaveTodo, onToggleTodo, onOpenResult, onClose }) => {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // Match tasks on title + notes (capped), then pull in each match's subtask subtree
  // so a matched task keeps its children — the tree flatten renders them collapsibly.
  const entrySet = useMemo(() => {
    if (!q) return [];
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
    let n = 0;
    for (const e of entries) {
      if (e.todo.isCollection) continue;
      if ((e.todo.text ?? '').toLowerCase().includes(q) || (e.todo.notes ?? '').toLowerCase().includes(q)) {
        addSubtree(e);
        if (++n >= RESULT_LIMIT) break;
      }
    }
    return [...set.values()];
  }, [entries, q]);

  const model = useMemo(() => buildTreeModel(entrySet, todoById, { collapsed }), [entrySet, todoById, collapsed]);

  // Clicking a result's title opens its full view (startEdit is repurposed as the
  // row's open action); the expand/collapse chevron uses toggleCollapse.
  const interaction = useMemo<TableInteraction>(() => ({
    editing: null,
    startEdit: (id) => onOpenResult(id),
    stopEdit: NOOP,
    openMenu: NOOP,
    toggleCollapse,
  }), [onOpenResult]);

  const rowHandlers = useMemo<TableRowHandlers>(() => ({
    onSaveTodo,
    onToggleTodo,
    onAddSubtask: () => '',
    onQuickAddTask: NOOP,
    onQuickAddInGroup: NOOP,
    // onNewInView omitted → no add-row in the results list.
  }), [onSaveTodo, onToggleTodo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[65vh] flex flex-col rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search field */}
        <div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-white/10">
          <Search size={16} className="text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Results — nesting search-variant TaskTable, or a hint / empty message. */}
        <div className="flex-1 min-h-0 flex flex-col">
          {!q ? (
            <div className="px-4 py-6 text-xs text-white/40">Type to search tasks by name or notes.</div>
          ) : entrySet.length === 0 ? (
            <div className="px-4 py-6 text-xs text-white/40">No tasks match “{query.trim()}”.</div>
          ) : (
            <TaskTable
              variant={VARIANTS.search}
              model={model}
              interaction={interaction}
              rowHandlers={rowHandlers}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
