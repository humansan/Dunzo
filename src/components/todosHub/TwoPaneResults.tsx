import React, { useState } from 'react';
import { Todo } from '@shared/types';
import { OrganizerEntry } from '../../utils/todoFilters';
import { VARIANTS } from './variant';
import { TaskTable, TableInteraction, TableRowHandlers } from './TaskTable';
import { useTaskFinderData } from './useTaskFinderData';
import { CollectionTree } from './CollectionTree';

const NOOP = () => {};
const toggleId = (set: (fn: (prev: Set<string>) => Set<string>) => void) => (id: string) =>
  set((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

// The Task Finder's two-pane result view: a collection list (left) scoping a
// TABLE-variant TaskTable of the selected view's matching tasks (right). Reuses the
// full planner table for the right pane; clicking a row picks the task. Owns its own
// view-selection + collapse state (ephemeral to the finder session).
export const TwoPaneResults: React.FC<{
  entries: OrganizerEntry[];
  todoById: Map<string, Todo>;
  matches: OrganizerEntry[];
  onPick: (id: string) => void;
  onSaveTodo: (updatedTodo: Todo) => void;
  onToggleTodo: (id: string) => void;
}> = ({ entries, todoById, matches, onPick, onSaveTodo, onToggleTodo }) => {
  const [selectedView, setSelectedView] = useState('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapsedColls, setCollapsedColls] = useState<Set<string>>(new Set());

  const { visibleCollections, allCount, uncategorizedCount, collectionCount, bodyModel } =
    useTaskFinderData({ entries, todoById, matches, selectedView, collapsed, collapsedColls });

  // Clicking any cell picks the task (startEdit is repurposed as the row's choose
  // action, as in the flat view); the checkbox still toggles completion.
  const interaction: TableInteraction = {
    editing: null,
    startEdit: (id) => onPick(id),
    stopEdit: NOOP,
    openMenu: NOOP,
    toggleCollapse: toggleId(setCollapsed),
  };
  const rowHandlers: TableRowHandlers = {
    onSaveTodo,
    onToggleTodo,
    onAddSubtask: () => '',
    onQuickAddTask: NOOP,
    onQuickAddInGroup: NOOP,
  };

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="w-56 shrink-0 min-h-0 flex flex-col border-r border-line">
        <CollectionTree
          visibleCollections={visibleCollections}
          selectedView={selectedView}
          onSelectView={setSelectedView}
          allCount={allCount}
          uncategorizedCount={uncategorizedCount}
          collectionCount={collectionCount}
          collapsedColls={collapsedColls}
          toggleCollColl={toggleId(setCollapsedColls)}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        {bodyModel.flattened.length === 0 ? (
          <div className="px-4 py-6 text-xs text-fg-faint">No matching tasks in this collection.</div>
        ) : (
          <TaskTable variant={VARIANTS.table} model={bodyModel} interaction={interaction} rowHandlers={rowHandlers} />
        )}
      </div>
    </div>
  );
};
