import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, List, Columns2, CornerLeftUp } from 'lucide-react';
import { Todo } from '@shared/types';
import { OrganizerEntry } from '@/features/tasks/model';
import { useSyncedLayout } from '@/lib/query/settings';
import { overlayBackdrop } from '@/common/ui/modalMotion';
import { VARIANTS } from '@/features/planner/variant';
import { TaskTable, TableInteraction, TableRowHandlers, buildTreeModel } from '@/features/planner/table/TaskTable';
import { useTaskFinderSearch } from '@/features/planner/task-finder/useTaskFinderSearch';
import { TwoPaneResults } from '@/features/planner/task-finder/TwoPaneResults';
import { btnGhost } from '@/theme/buttons';

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
  // The task universe searched by the two-pane (Collections) view and the pickers.
  // Global search passes its Planner-scoped organizer set here.
  entries: OrganizerEntry[];
  // Optional broader universe for the flat (list) view - global search passes every
  // unarchived task (Planner + daily-list-only) so daily-only tasks are findable.
  // Omitted by pickers, which fall back to `entries` in both views.
  flatEntries?: OrganizerEntry[];
  todoById: Map<string, Todo>;
  // Choosing a task: search opens its full view; a picker returns it to the caller.
  onPick: (id: string) => void;
  onClose: () => void;
  // Row mutations still available from the results (checkbox toggle / inline rename).
  onSaveTodo: (updatedTodo: Todo) => void;
  onToggleTodo: (id: string) => void;
  // Optional chrome - a picker sets a heading ("Move to…") and its own placeholder.
  title?: string;
  placeholder?: string;
  // Picker: hide candidates that can't be chosen (reparent excludes self + subtree).
  isDisabled?: (id: string) => boolean;
  // Picker: a pinned choice above the results (reparent's "Move to top level").
  rootOption?: { label: string; onSelect: () => void };
}

export const TaskFinder: React.FC<TaskFinderProps> = ({
  entries,
  flatEntries,
  todoById,
  onPick,
  onClose,
  onSaveTodo,
  onToggleTodo,
  title,
  placeholder = 'Search tasks…',
  isDisabled,
  rootOption,
}) => {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // Flat / Two-pane result layout - one preference remembered across all finder uses.
  const [layout, patchLayout] = useSyncedLayout();
  const finderView = layout.finderView ?? 'flat';
  const setFinderView = (v: 'flat' | 'twoPane') => patchLayout(() => ({ finderView: v }));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  // The flat (list) view searches the broader `flatEntries` universe when provided
  // (global search: every unarchived task, so daily-list-only tasks are findable);
  // the two-pane (Collections) view stays scoped to `entries` (the organizer set it
  // groups by collection). Pickers pass no `flatEntries`, so both views use `entries`.
  const activeEntries = finderView === 'flat' ? (flatEntries ?? entries) : entries;

  // A picker excludes candidates it can't accept - reparent → the moved task + its
  // whole subtree (a cycle guard). Removing them from the candidate universe up front
  // keeps them out of matches AND out of the subtree expansion below (an excluded
  // task can be nested under a non-excluded match). Collections stay (structure).
  const candidateEntries = useMemo(
    () => (isDisabled ? activeEntries.filter((e) => e.todo.isCollection || !isDisabled(e.todo.id)) : activeEntries),
    [activeEntries, isDisabled]
  );

  // Which tasks match - VSCode-style fuzzy on the name + all-fields haystack (§hook).
  const matches = useTaskFinderSearch(candidateEntries, todoById, query, RESULT_LIMIT);

  // The two-pane (Collections) view is a browsable table: with no query it shows the
  // full table so the user can explore collections/tabs before searching, then the
  // search filters it once they type. (The flat view stays empty until a query.)
  const twoPaneMatches = useMemo(
    () => (q ? matches : candidateEntries.filter((e) => !e.todo.isCollection)),
    [q, matches, candidateEntries]
  );

  // Pull in each match's subtask subtree so a matched task keeps its children - the
  // tree flatten renders them collapsibly (interim list; Phase 5 replaces this).
  const entrySet = useMemo(() => {
    if (matches.length === 0) return [];
    const childrenByParent = new Map<string, OrganizerEntry[]>();
    for (const e of candidateEntries) {
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
  }, [matches, candidateEntries]);

  const model = useMemo(() => buildTreeModel(entrySet, todoById, { collapsed }), [entrySet, todoById, collapsed]);

  // Clicking the cell picks the task via onOpenTask; expand/collapse uses toggleCollapse.
  const interaction = useMemo<TableInteraction>(() => ({
    editing: null,
    stopEdit: NOOP,
    openMenu: NOOP,
    toggleCollapse,
  }), []);

  const rowHandlers = useMemo<TableRowHandlers>(() => ({
    onSaveTodo,
    onToggleTodo,
    onAddSubtask: () => '',
    onQuickAddTask: NOOP,
    onQuickAddInGroup: NOOP,
    onOpenTask: onPick,
    // onNewInView omitted → no add-row in the results list.
  }), [onSaveTodo, onToggleTodo, onPick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 ${overlayBackdrop}`}
      onMouseDown={onClose}
    >
      <div
        className={`w-full ${finderView === 'twoPane' ? 'max-w-4xl' : 'max-w-xl'} max-h-[70vh] flex flex-col rounded-xl border border-line bg-canvas shadow-2xl overflow-hidden`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="shrink-0 px-3 pt-2.5 text-xs font-semibold text-fg-faint">
            {title}
          </div>
        )}
        {/* Search field + Flat / Two-pane toggle */}
        <div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-line">
          <Search size={16} className="text-fg-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <div className="shrink-0 flex items-center gap-0.5 rounded-lg bg-fill-subtle p-0.5">
            {([['flat', List, 'Flat list'], ['twoPane', Columns2, 'Collections']] as const).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFinderView(v)}
                title={label}
                className={`p-1 rounded-md transition-colors ${finderView === v ? 'bg-fill text-fg' : 'text-fg-faint hover:text-fg'}`}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 p-1 rounded transition-colors ${btnGhost()}`}
          >
            <X size={15} />
          </button>
        </div>

        {/* Optional pinned choice above the results (e.g. reparent's top level). */}
        {rootOption && (
          <button
            type="button"
            onClick={rootOption.onSelect}
            className="shrink-0 flex items-center gap-2 px-4 h-9 border-b border-line text-sm text-fg-muted hover:text-fg hover:bg-fill-subtle transition-colors"
          >
            <CornerLeftUp size={15} className="text-fg-faint" />
            {rootOption.label}
          </button>
        )}

        {/* Results. The two-pane view is always browsable (full table with no query,
            filtered once a query is typed). The flat view stays empty until the user
            types, then shows matches / a no-match message. */}
        <div className="flex-1 min-h-0 flex flex-col">
          {finderView === 'twoPane' ? (
            <TwoPaneResults
              entries={candidateEntries}
              todoById={todoById}
              matches={twoPaneMatches}
              onPick={onPick}
              onSaveTodo={onSaveTodo}
              onToggleTodo={onToggleTodo}
            />
          ) : !q ? (
            <div className="px-4 py-6 text-xs text-fg-faint">Type to search tasks by name or notes.</div>
          ) : matches.length === 0 ? (
            <div className="px-4 py-6 text-xs text-fg-faint">No tasks match “{query.trim()}”.</div>
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
