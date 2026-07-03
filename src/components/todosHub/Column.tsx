import React, { useMemo } from 'react';
import { Todo } from '../../types';
import { OrganizerEntry } from '../../utils/todoFilters';
import { DEFAULT_SECTIONS_CONFIG } from './types';
import { useRowDnD } from './useRowDnD';
import { VARIANTS } from './variant';
import { TaskTable, TableInteraction, TableRowHandlers, buildFlatModel } from './TaskTable';

// Shared data + handlers every column needs from the hub (assembled once in
// TodosHubView, forwarded through ColumnsView).
export interface ColumnContext {
  childrenOf: (id: string | null) => OrganizerEntry[];
  byId: Map<string, OrganizerEntry>;
  todoById: Map<string, Todo>;
  isDescendantOf: (e: OrganizerEntry, cid: string) => boolean;
  sortFn?: (a: OrganizerEntry, b: OrganizerEntry) => number;
  onReorder: (items: { id: string; parentId: string | null }[]) => void;
  onSaveTodo: (t: Todo) => void;
  onToggleTodo: (id: string) => void;
  onAddSubtask: (parentId: string) => string;
  // Add a task at this column's level (parented to nodeId) and edit its title.
  onAddInColumn: (parentId: string | null) => void;
  // Shared inline-edit + menu state, so one cell edits at a time across columns.
  editing: TableInteraction['editing'];
  startEdit: TableInteraction['startEdit'];
  stopEdit: TableInteraction['stopEdit'];
  openMenu: TableInteraction['openMenu'];
  clearInteraction: () => void;
}

// One level of the Finder columns view: the direct children of `nodeId`, rendered
// through the shared flat `column` TaskTable. This is a thin per-column adapter —
// its only reason to be a component (rather than a map callback) is that each
// column owns a `useRowDnD` instance for within-column reorder, and hooks can't be
// called in a loop. Everything visual is the reused TaskTable/HubRow stack.
export const Column: React.FC<{
  ctx: ColumnContext;
  nodeId: string | null;
  // The child whose column is open to the right (highlighted here), if any.
  selectedChildId: string | null;
  // Drill into a child collection (open a new column to the right).
  onDrill: (id: string) => void;
}> = ({ ctx, nodeId, selectedChildId, onDrill }) => {
  const slice = useMemo(() => ctx.childrenOf(nodeId), [ctx, nodeId]);
  // Flat model — parentless depth-0 nodes (buildFlatModel), so display and the
  // reorder commit agree; ordering carries via sortFn.
  const model = useMemo(
    () => buildFlatModel(slice, ctx.todoById, { sortFn: ctx.sortFn }),
    [slice, ctx.todoById, ctx.sortFn]
  );
  const flatById = useMemo(() => new Map(model.flattened.map((n) => [n.id, n])), [model.flattened]);

  // Within-column drag-to-reorder. The slice is one complete sibling group, so
  // dropping re-anchors to nodeId (via selectedCollectionId) exactly like a
  // collection view's depth-0 rows. Cross-column drag is out of scope.
  const dnd = useRowDnD({
    entries: slice,
    processedEntries: slice,
    flattened: model.flattened,
    flatById,
    groupedRows: [],
    byId: ctx.byId,
    isDescendantOf: ctx.isDescendantOf,
    selectedCollectionId: nodeId,
    sectionsConfig: DEFAULT_SECTIONS_CONFIG,
    onReorder: ctx.onReorder,
    onSaveTodo: ctx.onSaveTodo,
    clearInteraction: ctx.clearInteraction,
  });

  const interaction: TableInteraction = {
    editing: ctx.editing,
    startEdit: ctx.startEdit,
    stopEdit: ctx.stopEdit,
    openMenu: ctx.openMenu,
    toggleCollapse: () => {},
    onActivate: onDrill,
    selectedId: selectedChildId,
  };

  const rowHandlers: TableRowHandlers = {
    onSaveTodo: ctx.onSaveTodo,
    onToggleTodo: ctx.onToggleTodo,
    onAddSubtask: ctx.onAddSubtask,
    // A collection header's "+" drills into it and adds a task there, so the new
    // row lands in the freshly-opened column already in edit mode.
    onQuickAddTask: (parentId) => { onDrill(parentId); ctx.onAddInColumn(parentId); },
    onQuickAddInGroup: () => {},
    onNewInView: () => ctx.onAddInColumn(nodeId),
  };

  return (
    <TaskTable variant={VARIANTS.column} model={model} interaction={interaction} rowHandlers={rowHandlers} dnd={dnd} bottomSpacer />
  );
};
