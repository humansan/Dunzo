import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { Todo } from '../../types';
import { OrganizerEntry } from '../../utils/todoFilters';
import { COLUMNS, DEFAULT_SECTIONS_CONFIG } from './types';
import { flattenTree } from './treeUtils';
import { VARIANTS } from './variant';
import { TaskTable, TableModel, TableInteraction, TableRowHandlers } from './TaskTable';

// A command-palette search over the active workspace's tasks — the first live use
// of a flat, name-only, chrome-less `search` variant of the shared TaskTable. It
// filters tasks (never collections) by title + notes, flattens them (no nesting),
// and renders them through the same HubRow stack as every other view. Clicking a
// result opens that task's full view; there is no add-row (read-only surface).
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

  // Match tasks on title + notes, capped so a broad query stays responsive.
  const matches = useMemo(() => {
    if (!q) return [];
    const out: OrganizerEntry[] = [];
    for (const e of entries) {
      if (e.todo.isCollection) continue;
      if ((e.todo.text ?? '').toLowerCase().includes(q) || (e.todo.notes ?? '').toLowerCase().includes(q)) {
        out.push(e);
        if (out.length >= RESULT_LIMIT) break;
      }
    }
    return out;
  }, [entries, q]);

  const flattened = useMemo(() => flattenTree(matches, { flat: true }), [matches]);

  const model = useMemo<TableModel>(() => ({
    columns: COLUMNS,
    gridTemplateColumns: '',
    lastColKey: 'title',
    wrappedFields: new Set(),
    startResize: NOOP,
    sectionsConfig: DEFAULT_SECTIONS_CONFIG,
    flattened,
    groupedRows: [],
    collPathById: new Map(),
    visibleTaskCounts: new Map(),
    todoById,
    collapsed: new Set(),
    selectedCollectionId: null,
    selectedView: 'all',
    viewLabel: '',
    currentCount: matches.length,
  }), [flattened, matches.length, todoById]);

  // Clicking a result's title opens its full view (startEdit is repurposed as the
  // row's open action — a name-only surface has no other clickable cell).
  const interaction = useMemo<TableInteraction>(() => ({
    editing: null,
    startEdit: (id) => onOpenResult(id),
    stopEdit: NOOP,
    openMenu: NOOP,
    toggleCollapse: NOOP,
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

        {/* Results — flat search-variant TaskTable, or a hint / empty message. */}
        <div className="flex-1 min-h-0 flex flex-col">
          {!q ? (
            <div className="px-4 py-6 text-xs text-white/40">Type to search tasks by name or notes.</div>
          ) : matches.length === 0 ? (
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
