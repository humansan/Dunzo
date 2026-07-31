import React from 'react';
import { Plus } from 'lucide-react';
import { HubRow } from '@/features/planner/table/HubRow';
import { GroupHeaderRow } from '@/features/planner/table/GroupHeaderRow';
import { ColDef } from '@/features/planner/types';
import { TableVariant } from '@/features/planner/variant';
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
  const { onSaveTodo, onToggleTodo, onAddSubtask, onQuickAddTask, onQuickAddInGroup, onNewInView, onOpenTask } = rowHandlers;
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
          onAddSubtask={onAddSubtask}
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
            onAddSubtask={onAddSubtask}
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
          <div className="px-3 text-sm sticky left-0 z-10 flex items-center gap-2 ">
            <Plus size={15} />
            <span>New</span>
          </div>
        </button>
      )}

      {isEmpty && (onNewInView || selectedView === 'archived' || selectedView === 'completed') && (
        <div className="px-3 py-6 text-xs text-fg-subtle">
          {selectedCollectionId
            ? 'No tasks in this collection yet. Click “New” to add one.'
            : selectedView === 'uncategorized'
              ? 'No uncategorized tasks.'
              : selectedView === 'categorized'
                ? 'No tasks in any collection yet.'
                : selectedView === 'in-daily-list'
                  ? 'No tasks in your daily list yet.'
                  : selectedView === 'archived'
                    ? 'No archived tasks.'
                    : selectedView === 'completed'
                      ? 'No completed tasks yet.'
                      : <>No todos yet. Click “+ New”.</>}
        </div>
      )}
    </>
  );
};
