import React from 'react';
import { Plus } from 'lucide-react';
import { Todo } from '../../types';
import { HubRow } from './HubRow';
import { ColKey, EditState, FlatNode, NAME_COL_KEY, COLUMNS } from './types';
import { BOTTOM_SPACER } from './constants';

// Gantt view — Phase 1 (scaffold + row list). Renders ONLY the sticky left-hand
// Name pane for now: the exact same rows (nesting, indent, collapse/expand,
// inline rename, checkbox, context menu, add-task) that Table/List already draw,
// reusing `HubRow` with a single Name column — driven by the same `flattened`
// tree and `collapsed`/`toggleCollapse` state. The date grid and task bars are
// added in later phases (this pane becomes the frozen left column beside them).
interface HubGanttProps {
  // Derived data (from useHubData) — collection-tree row list + lookups.
  flattened: FlatNode[];
  collPathById: Map<string, { id: string; name: string; color?: string }[]>;
  visibleTaskCounts: Map<string, number>;
  todoById: Map<string, Todo>;
  selectedCollectionId: string | null;
  selectedView: string;
  // Editing + row handlers (shared with the Table/List bodies).
  editing: EditState;
  startEdit: (id: string, col: ColKey, e: React.MouseEvent) => void;
  stopEdit: () => void;
  onSaveTodo: (updatedTodo: Todo) => void;
  handleToggleTodo: (id: string) => void;
  onAddSubtask: (parentId: string) => string;
  handleQuickAddTask: (parentId: string) => void;
  openMenu: (id: string, x: number, y: number) => void;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  handleNewInView: () => void;
}

// The single Name column, reused from the shared column model. `minmax(0, 1fr)`
// lets the sticky Name cell shrink within the pane; the trailing implicit grid
// track absorbs HubRow's (table-mode) spacer div at zero width.
const NAME_ONLY_GRID = 'minmax(0, 1fr)';
const titleCol = COLUMNS.find((c) => c.key === NAME_COL_KEY)!;
const NO_WRAP: Set<ColKey> = new Set();

export const HubGantt: React.FC<HubGanttProps> = ({
  flattened,
  collPathById,
  visibleTaskCounts,
  todoById,
  selectedCollectionId,
  selectedView,
  editing,
  startEdit,
  stopEdit,
  onSaveTodo,
  handleToggleTodo,
  onAddSubtask,
  handleQuickAddTask,
  openMenu,
  collapsed,
  toggleCollapse,
  handleNewInView,
}) => {
  const isEmpty = flattened.length === 0;

  return (
    <div className="flex-1 min-w-0 overflow-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
      {/* Left Name pane. Rendered table-style (opaque bg + right divider, no title
          wrapping) so every row is a uniform height — the pane the timeline grid
          and bars will later be pinned beside. */}
      <div className="w-max min-w-full text-white border-t border-white/10">
        {flattened.map((node) => (
          <HubRow
            key={node.id}
            node={node}
            displayDepth={node.depth}
            gridTemplateColumns={NAME_ONLY_GRID}
            listView={false}
            columns={[titleCol]}
            lastColKey={titleCol.key}
            wrappedFields={NO_WRAP}
            hideDragHandle
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
            taskCount={node.entry.todo.isCollection ? (visibleTaskCounts.get(node.id) ?? 0) : undefined}
          />
        ))}

        {/* Add row */}
        <button
          type="button"
          onClick={handleNewInView}
          className="flex w-full h-9 text-white/60 hover:text-white hover:bg-white/3 cursor-pointer transition-colors border-b border-white/8 bg-[#0a0a0a]"
        >
          <div className="px-3 text-sm sticky left-0 z-10 flex items-center gap-2">
            <Plus size={15} />
            <span>New</span>
          </div>
        </button>

        {isEmpty && (
          <div className="px-3 py-6 text-xs text-white/60">
            {selectedCollectionId
              ? 'No tasks in this collection yet. Click “New” to add one.'
              : selectedView === 'uncategorized'
                ? 'No uncategorized tasks.'
                : 'No todos yet. Click “New”.'}
          </div>
        )}

        {/* Bottom dead space so the last row isn't flush to the edge and the
            right-click context menu has room to open fully below it. */}
        <div aria-hidden style={{ height: BOTTOM_SPACER }} />
      </div>
    </div>
  );
};
