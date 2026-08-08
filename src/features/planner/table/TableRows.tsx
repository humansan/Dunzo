import React from 'react';
import { HubRow } from '@/features/planner/table/HubRow';
import { GroupHeaderRow } from '@/features/planner/table/GroupHeaderRow';
import { AddRow } from '@/features/planner/table/AddRow';
import { ColDef } from '@/features/planner/types';
import { TableVariant, VARIANTS } from '@/features/planner/variant';
import { RowDnD, TableModel, TableInteraction, TableRowHandlers } from '@/features/planner/table/TaskTable';
import { addRowsByAnchor, type AddRowSpec } from '@/features/planner/table/addRows';

// The reusable row-list region shared by every chrome: the width anchor (full-grid
// only), the task/section rows (collection-tree or attribute-grouped), the add-row,
// the empty state, and the bottom spacer. Chrome-agnostic - `TableSurface` wraps
// this in whichever container the variant calls for. Drag handlers come from the
// optional `dnd` bundle; omit it and rows render without drag affordances.
interface TableRowsProps {
  variant: TableVariant;
  model: TableModel;
  interaction: TableInteraction;
  rowHandlers: TableRowHandlers;
  dnd?: RowDnD;
  effectiveColumns: ColDef[];
  effectiveGrid: string;
}

function getEmptyMessage(
  selectedCollectionId: string | null,
  selectedView: string,
  variant?: TableVariant,
  searchActive?: boolean
): React.ReactNode {
  if (variant !== VARIANTS.table && variant !== VARIANTS.list) {
    return null;
  }

  // A search miss is not an empty view: every message below invites the user to
  // add a task, which is the wrong thing to say when the tab has plenty of tasks
  // and the query just didn't match any of them.
  if (searchActive) {
    return 'No tasks match your search.';
  }

  if (selectedCollectionId) {
    return 'No tasks in this collection yet. Click “New” to add one.';
  }

  switch (selectedView) {
    case 'uncategorized':
      return 'No uncategorized tasks.';
    case 'categorized':
      return 'No tasks in any collection yet.';
    case 'in-daily-list':
      return 'No tasks in your daily list yet.';
    case 'archived':
      return 'No archived tasks.';
    case 'completed':
      return 'No completed tasks yet.';
    default:
      return <>No todos yet. Click “+ New”.</>;
  }
}

export const TableRows: React.FC<TableRowsProps> = ({
  variant,
  model,
  interaction,
  rowHandlers,
  dnd,
  effectiveColumns,
  effectiveGrid,
}) => {
  const { editing, startEdit, stopEdit, openMenu, toggleCollapse, onActivate, selectedId } = interaction;
  const { onSaveTodo, onToggleTodo, onQuickAddTask, onQuickAddInGroup, onCreateInside, onNewInView, onOpenTask } = rowHandlers;
  const {
    sectionsConfig,
    flattened,
    groupedRows,
    collPathById,
    visibleTaskCounts,
    todoById,
    collapsed,
    lastColKey,
    wrappedFields,
    selectedCollectionId,
    selectedView,
    viewLabel,
    searchActive,
    addRows,
  } = model;

  const nameOnly = variant.columns === 'name';
  const isEmpty = sectionsConfig.groupBy === 'collection' ? flattened.length === 0 : groupedRows.length === 0;

  // Contextual add-rows, keyed by the row each follows (null = before every row).
  // A surface with none - a read-only one like search - simply supplies no specs.
  const addAfter = React.useMemo(() => addRowsByAnchor(addRows ?? []), [addRows]);

  // Each add-row's create call, by container kind. Every one of these is an
  // existing operation - the same handler the matching "+" or context-menu item
  // runs - so an add-row is a new place to trigger a create, never a new kind of
  // create with a seed of its own.
  const runAdd = (spec: AddRowSpec) => {
    if (spec.kind === 'root') onNewInView?.();
    else if (spec.kind === 'collection' && spec.id) onQuickAddTask?.(spec.id);
    else if (spec.kind === 'group') onQuickAddInGroup?.(spec.groupValue ?? '');
    else if (spec.kind === 'task' && spec.id) onCreateInside?.(spec.id);
  };
  // Names the container in the add-row's tooltip; several are on screen at once.
  const labelFor = (spec: AddRowSpec): string | undefined => {
    if (spec.kind === 'root') return viewLabel || undefined;
    if (spec.kind === 'group') return spec.groupValue || undefined;
    return spec.id ? todoById.get(spec.id)?.text || 'Untitled' : undefined;
  };
  const addRowsAfter = (rowId: string | null) =>
    (addAfter.get(rowId) ?? []).map((spec) => (
      <AddRow
        key={`add:${spec.kind}:${spec.id ?? spec.groupValue ?? 'root'}`}
        indent={spec.indent}
        containerLabel={labelFor(spec)}
        onClick={() => runAdd(spec)}
      />
    ));

  // Rows - collection-tree mode (default) or flat grouped mode. Native HTML5 DnD:
  // a drop indicator shows where the row will land; nothing shifts until release.
  const rows =
    sectionsConfig.groupBy === 'collection' ? (
      flattened.map((node) => (
        <React.Fragment key={node.id}>
        <HubRow
          node={node}
          displayIndent={node.indent}
          gridTemplateColumns={effectiveGrid}
          editing={editing}
          startEdit={startEdit}
          stopEdit={stopEdit}
          onSaveTodo={onSaveTodo}
          onToggleTodo={onToggleTodo}
          onQuickAddTask={onQuickAddTask}
          openMenu={openMenu}
          isCollapsed={collapsed.has(node.id)}
          onToggleCollapse={toggleCollapse}
          collPath={collPathById.get(node.id) ?? []}
          columns={effectiveColumns}
          lastColKey={lastColKey}
          wrappedFields={wrappedFields}
          taskCount={node.entry.todo.isCollection ? (visibleTaskCounts.get(node.id) ?? 0) : undefined}
          hideDragHandle={!dnd}
          onOpenTask={onOpenTask}
          onActivate={onActivate}
          isSelected={selectedId === node.id}
          isDragSource={dnd?.rowDragId === node.id}
          dropIndicator={dnd?.rowDrop && dnd.rowDrop.id === node.id ? { pos: dnd.rowDrop.pos, indent: dnd.rowDrop.indent } : null}
          onRowDragStart={dnd?.onRowDragStart}
          onRowDragOver={dnd?.onRowDragOver}
          onRowDrop={dnd?.onRowDrop}
          onRowDragEnd={dnd?.resetDrag}
        />
        {addRowsAfter(node.id)}
        </React.Fragment>
      ))
    ) : (
      groupedRows.map((row) =>
        row.type === 'header' ? (
          <React.Fragment key={row.id}>
          <GroupHeaderRow
            row={row}
            gridTemplateColumns={effectiveGrid}
            onToggleCollapse={toggleCollapse}
            onAddTask={onQuickAddInGroup}
            isDropTarget={dnd?.rowDrop?.id === row.id}
            onHeaderDragOver={dnd ? (e) => dnd.onHeaderDragOver(row.id, row.value, e) : undefined}
            onHeaderDrop={dnd?.onRowDrop}
          />
          {addRowsAfter(row.id)}
          </React.Fragment>
        ) : (
          <React.Fragment key={row.node.id}>
          <HubRow
            node={row.node}
            displayIndent={row.node.indent}
            gridTemplateColumns={effectiveGrid}
            editing={editing}
            startEdit={startEdit}
            stopEdit={stopEdit}
            onSaveTodo={onSaveTodo}
            onToggleTodo={onToggleTodo}
              onQuickAddTask={onQuickAddTask}
            openMenu={openMenu}
            isCollapsed={collapsed.has(row.node.id)}
            onToggleCollapse={toggleCollapse}
            collPath={collPathById.get(row.node.id) ?? []}
            columns={effectiveColumns}
            lastColKey={lastColKey}
            wrappedFields={wrappedFields}
            hideDragHandle={!dnd}
            onOpenTask={onOpenTask}
            onActivate={onActivate}
            isSelected={selectedId === row.node.id}
            isDragSource={dnd?.rowDragId === row.node.id}
            dropIndicator={dnd?.rowDrop && dnd.rowDrop.id === row.node.id ? { pos: dnd.rowDrop.pos, indent: dnd.rowDrop.indent } : null}
            onRowDragStart={dnd?.onRowDragStart}
            onRowDragOver={dnd?.onRowDragOver}
            onRowDrop={dnd?.onRowDrop}
            onRowDragEnd={dnd?.resetDrag}
          />
          {addRowsAfter(row.node.id)}
          </React.Fragment>
        )
      )
    );

  const emptyMessage = getEmptyMessage(selectedCollectionId, selectedView, variant, searchActive);

  return (
    <>
      {!nameOnly && (
        // Width anchor: a zero-height grid mirroring the column tracks so the body
        // keeps the table's intrinsic width even when there are no rows.
        <div aria-hidden className="grid h-0 overflow-hidden" style={{ gridTemplateColumns: effectiveGrid }}>
          {effectiveColumns.map((c) => <div key={c.key} />)}
          <div />
        </div>
      )}

      {/* An add-row anchored to `null` renders BEFORE every row: it belongs to a
          container whose block is empty, and an empty block starts where the rows
          would have been. In practice that is the view root with no loose tasks -
          a new one really would appear up here, above the first collection. */}
      {addRowsAfter(null)}

      {rows}

      {/* `searchActive` joins the list because a search drops the add-row (see
          PlannerView), and without it the "nothing matched" message would be
          gated off by the very handler the search just removed. */}
      {isEmpty && emptyMessage && (onNewInView || searchActive || selectedView === 'archived' || selectedView === 'completed') && (
        <div className="px-3 py-6 text-xs text-fg-subtle">
          {emptyMessage}
        </div>
      )}
    </>
  );
};
