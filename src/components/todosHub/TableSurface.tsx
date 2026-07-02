import React from 'react';
import { ColDef } from './types';
import { TABLE_PAD } from './constants';
import { TableVariant } from './variant';
import { RowDnD, TableModel } from './TaskTable';

// The scroll container + chrome for one table surface, chosen by `variant.chrome`:
//   • title  — a single centered Name column with a project-style heading (List).
//   • header — the full spreadsheet's sticky, resizable column-header bar (Table).
// It hosts the chrome-agnostic row region (`children`) in the right slot and owns
// the scroll ref + the fallback container drop. (`none` chrome — bare, for the
// upcoming column/search surfaces — is not handled yet.)
interface TableSurfaceProps {
  variant: TableVariant;
  model: TableModel;
  dnd?: RowDnD;
  effectiveColumns: ColDef[];
  effectiveGrid: string;
  children: React.ReactNode;
}

export const TableSurface: React.FC<TableSurfaceProps> = ({
  variant,
  model,
  dnd,
  effectiveColumns,
  effectiveGrid,
  children,
}) => {
  const headerCellCls =
    'relative flex items-center px-2.5 text-xs font-semibold tracking-wide text-white/75 hover:bg-[#0f0f0f] select-none';

  const titleChrome = variant.chrome === 'title';
  const scroll = dnd?.tableScroll;

  return (
    <div
      ref={scroll?.ref}
      onDragOver={scroll?.onDragOver}
      onDragEnter={scroll?.onDragEnter}
      // Fallback drop: releasing over the header bar / gaps (not a row) still
      // commits the current indicator. Row/header onDrop call stopPropagation so
      // this never double-fires.
      onDrop={dnd ? (e) => { e.preventDefault(); dnd.onRowDrop(); } : undefined}
      className={`flex-1 min-w-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full ${
        titleChrome ? 'overflow-y-auto overflow-x-hidden px-6' : 'overflow-auto [&::-webkit-scrollbar]:h-2 ml-4 pr-4'
      }`}
    >
      {titleChrome ? (
        <div className="max-w-2xl mx-auto w-full text-white">
          {/* Project-style title — the selected collection's name, else the view label. */}
          <div className="pt-5 pb-1">
            <h1 className="text-2xl font-bold text-white truncate">
              {model.selectedCollectionId ? (model.todoById.get(model.selectedCollectionId)?.text || 'Untitled') : model.viewLabel}
            </h1>
            <p className="mt-0.5 text-xs text-white/35">{model.currentCount} item{model.currentCount === 1 ? '' : 's'}</p>
          </div>
          {children}
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
                  onMouseDown={(e) => model.startResize(c.key, e)}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent2)]/40"
                />
              </div>
            ))}
            {/* Spacer: absorbs leftover width when the table doesn't scroll; gives
                the last column's resize handle room to expand into when it does. */}
            <div />
          </div>

          <div className="w-max min-w-full text-white" style={{ paddingLeft: TABLE_PAD, paddingRight: TABLE_PAD }}>
            {children}
          </div>
        </>
      )}
    </div>
  );
};
