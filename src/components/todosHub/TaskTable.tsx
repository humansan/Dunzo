import React from 'react';
import { Todo } from '../../types';
import { ColDef, ColKey, EditState, FlatNode, GroupRow, NAME_COL_KEY, SectionsConfig } from './types';
import { useRowDnD } from './useRowDnD';
import { TableVariant, TableVariantContext } from './variant';
import { TableSurface } from './TableSurface';
import { TableRows } from './TableRows';

export type RowDnD = ReturnType<typeof useRowDnD>;

// One Task Planner surface: a scroll/chrome shell (`TableSurface`) hosting a
// reusable row-list generator (`TableRows`), selected by a `variant` descriptor
// (provided to the rows via context). The props are a few cohesive bundles rather
// than ~40 loose ones, so a view can instantiate the table more than once (Finder
// columns, list-as-sections) without prop-drilling everything N times.

// What renders + how it's laid out — assembled from useHubData + useHubViewConfig.
export interface TableModel {
  // Column layout.
  columns: ColDef[];
  gridTemplateColumns: string;
  lastColKey: ColKey;
  wrappedFields: Set<ColKey>;
  startResize: (key: ColKey, e: React.MouseEvent) => void;
  sectionsConfig: SectionsConfig;
  // Rows + per-row lookups.
  flattened: FlatNode[];
  groupedRows: GroupRow[];
  collPathById: Map<string, { id: string; name: string; color?: string }[]>;
  visibleTaskCounts: Map<string, number>;
  todoById: Map<string, Todo>;
  collapsed: Set<string>;
  // View identity — drives the title chrome + empty-state copy.
  selectedCollectionId: string | null;
  selectedView: string;
  viewLabel: string;
  currentCount: number;
}

// Editing / menu / collapse state + the callbacks that change it.
export interface TableInteraction {
  editing: EditState;
  startEdit: (id: string, col: ColKey, e: React.MouseEvent) => void;
  stopEdit: () => void;
  openMenu: (id: string, x: number, y: number) => void;
  toggleCollapse: (id: string) => void;
}

// Task mutations triggered from within a row or the add-row button.
export interface TableRowHandlers {
  onSaveTodo: (updatedTodo: Todo) => void;
  onToggleTodo: (id: string) => void;
  onAddSubtask: (parentId: string) => string;
  onQuickAddTask: (parentId: string) => void;
  onQuickAddInGroup: (groupValue: string) => void;
  onNewInView: () => void;
}

export interface TaskTableProps {
  variant: TableVariant;
  model: TableModel;
  interaction: TableInteraction;
  rowHandlers: TableRowHandlers;
  // Omit to render without drag-to-reorder (flat / column surfaces).
  dnd?: RowDnD;
}

export const TaskTable: React.FC<TaskTableProps> = ({
  variant,
  model,
  interaction,
  rowHandlers,
  dnd,
}) => {
  // A name-only variant collapses to the single Name column; the header, rows, and
  // width anchor all read these so they never disagree. minmax(0,1fr) lets the Name
  // column shrink within a narrow centered container.
  const nameOnly = variant.columns === 'name';
  const titleCol = model.columns.find((c) => c.key === NAME_COL_KEY)!;
  const effectiveColumns = nameOnly ? [titleCol] : model.columns;
  const effectiveGrid = nameOnly ? 'minmax(0, 1fr)' : model.gridTemplateColumns;

  return (
    <TableVariantContext.Provider value={variant}>
      <TableSurface
        variant={variant}
        model={model}
        dnd={dnd}
        effectiveColumns={effectiveColumns}
        effectiveGrid={effectiveGrid}
      >
        <TableRows
          variant={variant}
          model={model}
          interaction={interaction}
          rowHandlers={rowHandlers}
          dnd={dnd}
          effectiveColumns={effectiveColumns}
          effectiveGrid={effectiveGrid}
        />
      </TableSurface>
    </TableVariantContext.Provider>
  );
};
