import React from 'react';
import { Plus } from 'lucide-react';
import { Todo } from '../../types';
import { HubRow } from './HubRow';
import { GroupHeaderRow } from './GroupHeaderRow';
import { ColDef, ColKey, EditState, FlatNode, GroupRow, NAME_COL_KEY, SectionsConfig } from './types';
import { TABLE_PAD, BOTTOM_SPACER } from './constants';
import { useRowDnD } from './useRowDnD';
import { TableVariant, TableVariantContext } from './variant';

type RowDnD = ReturnType<typeof useRowDnD>;

// The scrollable view body shared by every variant of the Task Planner, selected
// by the `variant` descriptor (provided to the rows via context). `header` chrome
// renders the full spreadsheet (sticky header row, all visible columns, horizontal
// scroll); `title` chrome renders a single Name column — no header row, centered at
// reading width with a big project-style title — reusing the same rows (nesting,
// drag-and-drop, inline editing) via a single-column grid. The data hooks are
// unchanged; this is purely presentation.
interface HubBodyProps {
  variant: TableVariant;
  // Drag-and-drop + scroll surface (from useRowDnD).
  tableScroll: RowDnD['tableScroll'];
  rowDragId: RowDnD['rowDragId'];
  rowDrop: RowDnD['rowDrop'];
  onRowDragStart: RowDnD['onRowDragStart'];
  onRowDragOver: RowDnD['onRowDragOver'];
  onHeaderDragOver: RowDnD['onHeaderDragOver'];
  onRowDrop: RowDnD['onRowDrop'];
  resetDrag: RowDnD['resetDrag'];
  // Column layout (from useHubViewConfig).
  visibleColumns: ColDef[];
  gridTemplateColumns: string;
  startResize: (key: ColKey, e: React.MouseEvent) => void;
  lastColKey: ColKey;
  wrappedFields: Set<ColKey>;
  sectionsConfig: SectionsConfig;
  // Derived data (from useHubData).
  flattened: FlatNode[];
  groupedRows: GroupRow[];
  collPathById: Map<string, { id: string; name: string; color?: string }[]>;
  visibleTaskCounts: Map<string, number>;
  selectedCollectionId: string | null;
  selectedView: string;
  viewLabel: string;
  currentCount: number;
  todoById: Map<string, Todo>;
  // Editing + row handlers.
  editing: EditState;
  startEdit: (id: string, col: ColKey, e: React.MouseEvent) => void;
  stopEdit: () => void;
  onSaveTodo: (updatedTodo: Todo) => void;
  handleToggleTodo: (id: string) => void;
  onAddSubtask: (parentId: string) => string;
  handleQuickAddTask: (parentId: string) => void;
  handleQuickAddInGroup: (groupValue: string) => void;
  openMenu: (id: string, x: number, y: number) => void;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  handleNewInView: () => void;
}

export const HubBody: React.FC<HubBodyProps> = ({
  variant,
  tableScroll,
  rowDragId,
  rowDrop,
  onRowDragStart,
  onRowDragOver,
  onHeaderDragOver,
  onRowDrop,
  resetDrag,
  visibleColumns,
  gridTemplateColumns,
  startResize,
  lastColKey,
  wrappedFields,
  sectionsConfig,
  flattened,
  groupedRows,
  collPathById,
  visibleTaskCounts,
  selectedCollectionId,
  selectedView,
  viewLabel,
  currentCount,
  todoById,
  editing,
  startEdit,
  stopEdit,
  onSaveTodo,
  handleToggleTodo,
  onAddSubtask,
  handleQuickAddTask,
  handleQuickAddInGroup,
  openMenu,
  collapsed,
  toggleCollapse,
  handleNewInView,
}) => {
  const headerCellCls =
    'relative flex items-center px-2.5 text-xs font-semibold tracking-wide text-white/75 hover:bg-[#0f0f0f] select-none';

  // A name-only variant collapses to the single Name column; both the rows and the
  // (full-grid-only) width anchor use these so they never disagree. minmax(0,1fr)
  // lets the Name column shrink within the narrow centered container.
  const nameOnly = variant.columns === 'name';
  const titleCol = visibleColumns.find((c) => c.key === NAME_COL_KEY)!;
  const effectiveColumns = nameOnly ? [titleCol] : visibleColumns;
  const effectiveGrid = nameOnly ? 'minmax(0, 1fr)' : gridTemplateColumns;

  const isEmpty = sectionsConfig.groupBy === 'collection' ? flattened.length === 0 : groupedRows.length === 0;

  // Rows — collection-tree mode (default) or flat grouped mode. Native HTML5 DnD:
  // a drop indicator shows where the row will land; nothing shifts until release.
  const rows =
    sectionsConfig.groupBy === 'collection' ? (
      flattened.map((node) => (
        <HubRow
          key={node.id}
          node={node}
          displayDepth={node.depth}
          gridTemplateColumns={effectiveGrid}
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
          columns={effectiveColumns}
          lastColKey={lastColKey}
          wrappedFields={wrappedFields}
          taskCount={node.entry.todo.isCollection ? (visibleTaskCounts.get(node.id) ?? 0) : undefined}
          isDragSource={rowDragId === node.id}
          dropIndicator={rowDrop && rowDrop.id === node.id ? { pos: rowDrop.pos, depth: rowDrop.depth } : null}
          onRowDragStart={onRowDragStart}
          onRowDragOver={onRowDragOver}
          onRowDrop={onRowDrop}
          onRowDragEnd={resetDrag}
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
            onAddTask={handleQuickAddInGroup}
            isDropTarget={rowDrop?.id === row.id}
            onHeaderDragOver={(e) => onHeaderDragOver(row.id, row.value, e)}
            onHeaderDrop={onRowDrop}
          />
        ) : (
          <HubRow
            key={row.node.id}
            node={row.node}
            displayDepth={row.node.depth}
            gridTemplateColumns={effectiveGrid}
            editing={editing}
            startEdit={startEdit}
            stopEdit={stopEdit}
            onSaveTodo={onSaveTodo}
            onToggleTodo={handleToggleTodo}
            onAddSubtask={onAddSubtask}
            onQuickAddTask={handleQuickAddTask}
            openMenu={openMenu}
            isCollapsed={collapsed.has(row.node.id)}
            onToggleCollapse={toggleCollapse}
            collPath={collPathById.get(row.node.id) ?? []}
            columns={effectiveColumns}
            lastColKey={lastColKey}
            wrappedFields={wrappedFields}
            isDragSource={rowDragId === row.node.id}
            dropIndicator={rowDrop && rowDrop.id === row.node.id ? { pos: rowDrop.pos, depth: rowDrop.depth } : null}
            onRowDragStart={onRowDragStart}
            onRowDragOver={onRowDragOver}
            onRowDrop={onRowDrop}
            onRowDragEnd={resetDrag}
          />
        )
      )
    );

  // Shared body: rows + add-row + empty state + bottom spacer. The width anchor is
  // full-grid-only (a single 1fr column needs no intrinsic-width pin).
  const bodyInner = (
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

      {/* Add row */}
      <button
        type="button"
        onClick={handleNewInView}
        className={`flex w-full h-9 text-white/60 hover:text-white hover:bg-white/3 cursor-pointer transition-colors ${
          variant.mode === 'list' ? 'border-b border-white/5' : 'border-b border-white/8 bg-[#0a0a0a]'
        }`}
      >
        <div className="px-3 text-sm sticky left-0 z-10 flex items-center gap-2 ">
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
              : <>No todos in this collection. Click “+ New”.</>}
        </div>
      )}

      {/* Bottom dead space so the last row isn't flush to the edge and the
          right-click context menu has room to open fully below it. */}
      <div aria-hidden style={{ height: BOTTOM_SPACER }} />
    </>
  );

  const titleChrome = variant.chrome === 'title';

  return (
    <TableVariantContext.Provider value={variant}>
    <div
      ref={tableScroll.ref}
      onDragOver={tableScroll.onDragOver}
      onDragEnter={tableScroll.onDragEnter}
      // Fallback drop: releasing over the header bar / gaps (not a row) still
      // commits the current indicator. Row/header onDrop call stopPropagation so
      // this never double-fires.
      onDrop={(e) => { e.preventDefault(); onRowDrop(); }}
      className={`flex-1 min-w-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full ${
        titleChrome ? 'overflow-y-auto overflow-x-hidden px-6' : 'overflow-auto [&::-webkit-scrollbar]:h-2 ml-4 pr-4'
      }`}
    >
      {titleChrome ? (
        <div className="max-w-2xl mx-auto w-full text-white">
          {/* Project-style title — the selected collection's name, else the view label. */}
          <div className="pt-5 pb-1">
            <h1 className="text-2xl font-bold text-white truncate">
              {selectedCollectionId ? (todoById.get(selectedCollectionId)?.text || 'Untitled') : viewLabel}
            </h1>
            <p className="mt-0.5 text-xs text-white/35">{currentCount} item{currentCount === 1 ? '' : 's'}</p>
          </div>
          {bodyInner}
        </div>
      ) : (
        <>
          {/* Header row — full-bleed bar: its background + bottom border span the
              whole width (no left/right gaps), but it carries the same TABLE_PAD
              padding and w-max width as the rows below, so the padding sits outside
              the grid tracks and the column borders line up with the body. */}
          <div
            className="grid sticky top-0 z-30 w-max min-w-full bg-[#0a0a0a] border-y border-white/10 h-9"
            style={{ gridTemplateColumns: effectiveGrid, paddingLeft: TABLE_PAD, paddingRight: TABLE_PAD }}
          >
            {effectiveColumns.map((c, idx) => (
              <div
                key={c.key}
                // The Name header gets the row's left padding so its label lines up with the row content.
                style={idx === 0 ? { paddingLeft: 30 } : undefined}
                className={`${headerCellCls} ${idx > 0 ? 'border-l border-white/8' : ''} ${
                  idx === 0 ? 'sticky left-0 z-10 bg-[#0a0a0a] border-r border-white/8' : ''
                } ${idx === effectiveColumns.length - 1 ? 'border-r border-white/8' : ''}`}
              >
                <span className="truncate">{c.label}</span>
                {/* Resize handle on the right edge */}
                <div
                  onMouseDown={(e) => startResize(c.key, e)}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent2)]/40"
                />
              </div>
            ))}
            {/* Spacer: absorbs leftover width when the table doesn't scroll; gives
                the last column's resize handle room to expand into when it does. */}
            <div />
          </div>

          <div className="w-max min-w-full text-white" style={{ paddingLeft: TABLE_PAD, paddingRight: TABLE_PAD }}>
            {bodyInner}
          </div>
        </>
      )}
    </div>
    </TableVariantContext.Provider>
  );
};
