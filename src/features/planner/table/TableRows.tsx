import React from 'react';
import { Plus } from 'lucide-react';
import { HubRow } from '@/features/planner/table/HubRow';
import { GroupHeaderRow } from '@/features/planner/table/GroupHeaderRow';
import { ColDef } from '@/features/planner/types';
import { TableVariant, VARIANTS } from '@/features/planner/variant';
import { RowDnD, TableModel, TableInteraction, TableRowHandlers } from '@/features/planner/table/TaskTable';

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
  const { onSaveTodo, onToggleTodo, onQuickAddTask, onQuickAddInGroup, onNewInView, onOpenTask } = rowHandlers;
  const {
    sectionsConfig,
    flattened,
    groupedRows,
    collPathById,
    visibleTaskCounts,
    collapsed,
    lastColKey,
    wrappedFields,
    selectedCollectionId,
    selectedView,
    searchActive,
  } = model;

  const nameOnly = variant.columns === 'name';
  const isEmpty = sectionsConfig.groupBy === 'collection' ? flattened.length === 0 : groupedRows.length === 0;

  // Rows - collection-tree mode (default) or flat grouped mode. Native HTML5 DnD:
  // a drop indicator shows where the row will land; nothing shifts until release.
  const rows =
    sectionsConfig.groupBy === 'collection' ? (
      flattened.map((node) => (
        <HubRow
          key={node.id}
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
      ))
    ) : (
      groupedRows.map((row) =>
        row.type === 'header' ? (
          <GroupHeaderRow
            key={row.id}
            row={row}
            gridTemplateColumns={effectiveGrid}
            onToggleCollapse={toggleCollapse}
            onAddTask={onQuickAddInGroup}
            isDropTarget={dnd?.rowDrop?.id === row.id}
            onHeaderDragOver={dnd ? (e) => dnd.onHeaderDragOver(row.id, row.value, e) : undefined}
            onHeaderDrop={dnd?.onRowDrop}
          />
        ) : (
          <HubRow
            key={row.node.id}
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

      {rows}

      {/* Add row - editable surfaces only. A read-only surface (search) omits
          onNewInView, dropping both the add-row and its collection empty state. */}
      {onNewInView && (
        <button
          type="button"
          onClick={onNewInView}
          className={`flex w-full h-9 text-fg-subtle hover:text-fg hover:bg-fill-subtle cursor-pointer transition-colors ${
            variant.mode === 'table' ? 'border-b border-line-subtle bg-canvas' : 'border-b border-line-subtle'
          }`}
        >
          <div className="w-9"></div>
          <div className="px-3 text-sm sticky left-0 z-10 flex items-center gap-2 ">
            <Plus size={15} />
            <span>New</span>
          </div>
        </button>
      )}

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
