import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { Todo } from '../../types';
import { OrganizerEntry } from '../../utils/todoFilters';
import { VARIANTS } from './variant';
import { TaskTable, TableInteraction, TableRowHandlers, buildTreeModel } from './TaskTable';
import { useTaskFinderSearch } from './useTaskFinderSearch';

// A command-palette over the active workspace's tasks, driven by `onPick`: search
// wires it to open a task's full view, a picker (e.g. reparent) wires it to its own
// action. It matches tasks (never collections) by title + notes, pulls in each
// match's subtask subtree so results keep their hierarchy (expand/collapse), and
// renders them through the nesting, name-only, chrome-less `search` variant of the
// shared TaskTable. There is no add-row (read-only surface).
//
// Phase 1: the flat result list is the existing search list; fuzzy/all-fields search
// (Phase 2), the two-pane view (Phase 3), and the polished ranked list (Phase 5)
// build on this shell.
const RESULT_LIMIT = 50;
const NOOP = () => {};

export interface TaskFinderProps {
  entries: OrganizerEntry[];
  todoById: Map<string, Todo>;
  // Choosing a task: search opens its full view; a picker returns it to the caller.
  onPick: (id: string) => void;
  onClose: () => void;
  // Row mutations still available from the results (checkbox toggle / inline rename).
  onSaveTodo: (updatedTodo: Todo) => void;
  onToggleTodo: (id: string) => void;
  // Optional chrome — a picker sets a heading ("Move to…") and its own placeholder.
  title?: string;
  placeholder?: string;
}

export const TaskFinder: React.FC<TaskFinderProps> = ({
  entries,
  todoById,
  onPick,
  onClose,
  onSaveTodo,
  onToggleTodo,
  title,
  placeholder = 'Search tasks…',
}) => {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // Which tasks match — VSCode-style fuzzy on the name + all-fields haystack (§hook).
  const matches = useTaskFinderSearch(entries, todoById, query, RESULT_LIMIT);

  // Pull in each match's subtask subtree so a matched task keeps its children — the
  // tree flatten renders them collapsibly (interim list; Phase 5 replaces this).
  const entrySet = useMemo(() => {
    if (matches.length === 0) return [];
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
    for (const e of matches) addSubtree(e);
    return [...set.values()];
  }, [matches, entries]);

  const model = useMemo(() => buildTreeModel(entrySet, todoById, { collapsed }), [entrySet, todoById, collapsed]);

  // Clicking a result's title fires onPick (startEdit is repurposed as the row's
  // choose action); the expand/collapse chevron uses toggleCollapse.
  const interaction = useMemo<TableInteraction>(() => ({
    editing: null,
    startEdit: (id) => onPick(id),
    stopEdit: NOOP,
    openMenu: NOOP,
    toggleCollapse,
  }), [onPick]);

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
        {title && (
          <div className="shrink-0 px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-white/35">
            {title}
          </div>
        )}
        {/* Search field */}
        <div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-white/10">
          <Search size={16} className="text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
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
