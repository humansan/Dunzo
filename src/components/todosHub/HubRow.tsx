import React, { useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { GripVertical, MoreHorizontal, ChevronRight, ChevronDown } from 'lucide-react';
import { Todo } from '../../types';
import { formatTime12h } from '../../utils/timeUtils';
import {
  CompletedToggle,
  DateField,
  StartTimeField,
  EndTimeField,
  PercentField,
  XpField,
  CollectionBreadcrumb,
  OptionChip,
  statusOption,
  priorityOption,
} from '../todoFields';
import { ColDef, ColKey, EditState, FlatNode, NAME_COL_KEY } from './types';
import { INDENT, NAME_BASE_PAD, DEFAULT_COLLECTION_COLOR, pillTextColor, cellEditCls } from './constants';

// Where the dragged row will land relative to this row: a line before/after it
// (reorder) or nested inside it. `depth` is the indent level to draw the line at.
export type DropIndicator = { pos: 'before' | 'inside' | 'after'; depth: number } | null;

// ── Row ──────────────────────────────────────────────────────────────────────
interface HubRowProps {
  node: FlatNode;
  displayDepth: number;
  gridTemplateColumns: string;
  editing: EditState;
  startEdit: (id: string, col: ColKey, e: React.MouseEvent) => void;
  stopEdit: () => void;
  onSaveTodo: (oldDate: string | null, newDate: string | null, updatedTodo: Todo) => void;
  onToggleTodo: (id: string) => void;
  openMenu: (id: string, x: number, y: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  collPath: { id: string; name: string; color?: string }[];
  // Ordered, visible columns (Name first) — drives which cells render and in what order.
  columns: ColDef[];
  lastColKey: ColKey; // the rightmost visible column, which gets a right divider
  // When true the drag handle is hidden (e.g. in grouped mode where DnD has no effect).
  hideDragHandle?: boolean;
  // Visible (post-filter) task count shown on collection header rows.
  taskCount?: number;
  // ── Native drag & drop (sidebar-style: indicator only, nothing shifts) ──────
  isDragSource?: boolean;          // this row is the one being dragged (dim it)
  dropIndicator?: DropIndicator;   // where the drop will land, drawn on this row
  onRowDragStart?: (id: string) => void;
  onRowDragOver?: (id: string, e: React.DragEvent) => void;
  onRowDrop?: () => void;
  onRowDragEnd?: () => void;
}

export const HubRow: React.FC<HubRowProps> = ({
  node,
  displayDepth,
  gridTemplateColumns,
  editing,
  startEdit,
  stopEdit,
  onSaveTodo,
  onToggleTodo,
  openMenu,
  isCollapsed,
  onToggleCollapse,
  collPath,
  columns,
  lastColKey,
  hideDragHandle = false,
  taskCount,
  isDragSource = false,
  dropIndicator = null,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
}) => {
  const { entry, hasChildren } = node;
  const { todo, date } = entry;
  // The name cell doubles as the drag image so the cursor carries a readable chip.
  const dragImageRef = useRef<HTMLDivElement>(null);
  const style: React.CSSProperties = { gridTemplateColumns };

  const isEditing = (col: ColKey) => editing?.id === todo.id && editing?.col === col;
  const saveField = (patch: Partial<Todo>) => onSaveTodo(date, date, { ...todo, ...patch });
  const saveDate = (v: string) => onSaveTodo(date, v || null, todo);

  // Drop handlers shared by both row variants. stopPropagation so the table's
  // container-level onDrop (a fallback for releases over the header/gaps) doesn't
  // also fire and double-commit.
  const dropProps = {
    onDragOver: (e: React.DragEvent) => onRowDragOver?.(todo.id, e),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); onRowDrop?.(); },
  };

  // The grip — the only draggable element, so cell clicks/edits stay intact.
  // NOTE: this must be a plain function call (not an inner <Component/>), or each
  // re-render would create a new component type, remounting the <button> and
  // aborting any in-progress native drag (dragend never fires → stuck indicator).
  const dragHandle = (className = '') =>
    hideDragHandle ? null : (
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          if (dragImageRef.current) e.dataTransfer.setDragImage(dragImageRef.current, 8, 8);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', todo.id);
          onRowDragStart?.(todo.id);
        }}
        onDragEnd={() => onRowDragEnd?.()}
        className={`shrink-0 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 opacity-0 group-hover/row:opacity-100 transition-opacity ${className}`}
        title="Drag to reorder / nest"
      >
        <GripVertical size={14} />
      </button>
    );

  // The drop indicator: a line at the target indent (before/after), or a ring on
  // the row (inside = nest under this row).
  const indent = NAME_BASE_PAD + (dropIndicator?.depth ?? 0) * INDENT;
  const dropLine = (where: 'before' | 'after') =>
    dropIndicator?.pos === where ? (
      <div
        className="pointer-events-none absolute left-0 right-0 z-30 h-0.5 rounded-full bg-[var(--accent2)]"
        style={{ [where === 'before' ? 'top' : 'bottom']: -1, marginLeft: indent }}
      />
    ) : null;
  // 'inside' (nest) highlight: an overlay so it sits ABOVE the sticky Name cell
  // (z-20) and spans the whole row — a ring on the grid would be painted over by
  // that opaque cell, leaving only the scrollable part highlighted.
  const insideOverlay = dropIndicator?.pos === 'inside' ? (
    <div className="pointer-events-none absolute inset-0 z-30 ring-2 ring-inset ring-[var(--accent2)] bg-[var(--accent2)]/5" />
  ) : null;

  const editCellWrap = 'flex items-stretch h-full border-l border-white/8';
  // Empty fields render nothing — a placeholder dash just adds clutter.
  const muted = null;

  // A clickable display cell that switches into edit mode.
  const DisplayCell: React.FC<{ col: ColKey; children: React.ReactNode }> = ({ col, children }) => (
    <div
      onClick={(e) => startEdit(todo.id, col, e)}
      className={`flex items-center h-full px-2.5 border-l border-white/8 overflow-hidden cursor-pointer hover:bg-white/[0.03] ${
        col === lastColKey ? 'border-r border-white/8' : ''
      }`}
    >
      {children}
    </div>
  );

  // ── Collection row ──────────────────────────────────────────────────────────
  // A section header, not a task: full-width (no column cells / dividers), taller,
  // no checkbox, with the name as a bottom-anchored colored pill.
  if (todo.isCollection) {
    const color = todo.color || DEFAULT_COLLECTION_COLOR;
    return (
      <div
        style={style}
        {...dropProps}
        onContextMenu={(e) => { e.preventDefault(); openMenu(todo.id, e.clientX, e.clientY); }}
        className={`relative grid items-center min-h-11 border-b pt-3 border-white/8 group/row ${
          isDragSource ? 'opacity-40' : 'hover:bg-white/[0.015]'
        }`}
      >
        {dropLine('before')}
        {dropLine('after')}
        {insideOverlay}
        {/* Header group, pinned to the left so it stays visible while scrolling.
            Indents by nesting depth so sub-collections sit under their parent. */}
        <div
          ref={dragImageRef}
          style={{ paddingLeft: NAME_BASE_PAD + displayDepth * INDENT }}
          className="col-span-full sticky left-0 flex items-center min-w-0 max-w-full"
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(todo.id); }}
              className="shrink-0 p-0.5 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
              title={isCollapsed ? 'Expand collection' : 'Collapse collection'}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : (
            <span className="shrink-0 w-5" />
          )}

          {dragHandle('mr-1')}

          {isEditing('title') ? (
            <input
              type="text"
              autoFocus
              defaultValue={todo.text}
              onChange={(e) => saveField({ text: e.target.value })}
              onBlur={stopEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="Collection name"
              size={1}
              style={{ backgroundColor: `${color}40`, color: pillTextColor(color) }}
              className="w-auto min-w-[60px] max-w-full [field-sizing:content] rounded-full px-2.5 text-sm font-medium focus:outline-none placeholder:text-white/40 ring-1 ring-current/60"
            />
          ) : (
            <span
              onClick={(e) => startEdit(todo.id, 'title', e)}
              style={{ backgroundColor: `${color}40`, color: pillTextColor(color) }}
              className="min-w-0 max-w-full truncate rounded-full px-2.5 text-sm font-medium cursor-text"
            >
              {todo.text || 'Untitled collection'}
            </span>
          )}

          {taskCount !== undefined && !isEditing('title') && (
            <span className="shrink-0 text-xs px-1.5 text-white/35 font-mono">{taskCount}</span>
          )}

          <button
            type="button"
            title="Options"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              openMenu(todo.id, r.left, r.bottom + 4);
            }}
            className="shrink-0 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/row:opacity-100 transition-all"
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>
    );
  }

  // Render a single non-Name cell by key. The cells are emitted in the order the
  // Fields menu dictates (via the `columns` prop), so this switch maps key→JSX.
  const renderCell = (col: ColKey) => {
    switch (col) {
      case 'status':
        return (
          <DisplayCell col="status">
            {todo.status ? <OptionChip option={statusOption(todo.status)!} /> : muted}
          </DisplayCell>
        );
      case 'priority':
        return (
          <DisplayCell col="priority">
            {todo.priority ? <OptionChip option={priorityOption(todo.priority)!} /> : muted}
          </DisplayCell>
        );
      case 'date':
        return isEditing('date') ? (
          <div className={editCellWrap}>
            <DateField value={date || ''} autoFocus onBlur={stopEdit} onChange={saveDate} className={cellEditCls} />
          </div>
        ) : (
          <DisplayCell col="date">
            <span className="truncate text-sm text-white/90">
              {date ? format(parseISO(date), 'MMM d, yyyy') : muted}
            </span>
          </DisplayCell>
        );
      case 'start':
        return isEditing('start') ? (
          <div className={editCellWrap}>
            <StartTimeField value={todo.startTime} autoFocus onBlur={stopEdit} onChange={saveField} className={cellEditCls} />
          </div>
        ) : (
          <DisplayCell col="start">
            <span className="truncate text-sm text-white/90">{todo.startTime ? formatTime12h(todo.startTime) : muted}</span>
          </DisplayCell>
        );
      case 'end':
        return isEditing('end') ? (
          <div className={editCellWrap}>
            <EndTimeField value={todo.dueTime} autoFocus onBlur={stopEdit} onChange={saveField} className={cellEditCls} />
          </div>
        ) : (
          <DisplayCell col="end">
            <span className="truncate text-sm text-white/90">{todo.dueTime ? formatTime12h(todo.dueTime) : muted}</span>
          </DisplayCell>
        );
      case 'percent':
        return isEditing('percent') ? (
          <div className={editCellWrap}>
            <PercentField value={todo.duePercentage} autoFocus onBlur={stopEdit} onChange={saveField} className={cellEditCls} />
          </div>
        ) : (
          <DisplayCell col="percent">
            <span className="truncate text-sm text-white/90">
              {todo.duePercentage !== undefined ? `${todo.duePercentage}%` : muted}
            </span>
          </DisplayCell>
        );
      case 'collection':
        return (
          <DisplayCell col="collection">
            {collPath.length ? <CollectionBreadcrumb path={collPath} /> : muted}
          </DisplayCell>
        );
      case 'xp':
        return isEditing('xp') ? (
          <div className={editCellWrap}>
            <XpField value={todo.xp} autoFocus onBlur={stopEdit} onChange={(val) => saveField({ xp: val })} className={cellEditCls} />
          </div>
        ) : (
          <DisplayCell col="xp">
            <span className="truncate text-sm text-white/90">{todo.xp !== undefined ? `${todo.xp}` : muted}</span>
          </DisplayCell>
        );
      case 'notes':
        return (
          <DisplayCell col="notes">
            {todo.notes ? <span className="truncate text-sm text-white/90">{todo.notes}</span> : muted}
          </DisplayCell>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={style}
      {...dropProps}
      onContextMenu={(e) => { e.preventDefault(); openMenu(todo.id, e.clientX, e.clientY); }}
      className={`relative grid items-stretch min-h-[36px] border-b border-white/8 group/row ${
        isDragSource ? 'opacity-40' : 'hover:bg-white/[0.015]'
      }`}
    >
      {dropLine('before')}
      {dropLine('after')}
      {insideOverlay}
      {/* Name group: indent + collapse + handle + checkbox + name.
          Frozen to the left edge; needs an opaque bg so scrolled cells don't show through. */}
      <div
        ref={dragImageRef}
        className="sticky left-0 z-20 flex items-center h-full overflow-hidden border-r border-white/8 bg-[#0a0a0a] group-hover/row:bg-[#0e0e0e]"
      >
        <div style={{ paddingLeft: NAME_BASE_PAD + displayDepth * INDENT }} className="flex items-center h-full min-w-0 flex-1">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(todo.id); }}
              className="shrink-0 p-0.5 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
              title={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
          ) : (
            <span className="shrink-0 w-5" />
          )}

          {dragHandle()}

          <CompletedToggle completed={todo.completed} onToggle={() => onToggleTodo(todo.id)} size={16} className='mr-2 ml-1'/>

          {isEditing('title') ? (
            <input
              type="text"
              autoFocus
              defaultValue={todo.text}
              onChange={(e) => saveField({ text: e.target.value })}
              onBlur={stopEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="Untitled"
              className="flex-1 min-w-0 h-full bg-[#1e1e1e] px-1.5 text-sm text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60"
            />
          ) : (
            <>
              <span
                onClick={(e) => startEdit(todo.id, 'title', e)}
                className={`flex-1 truncate text-sm cursor-text ${todo.completed ? 'text-white/45 line-through' : 'text-white'}`}
              >
                {todo.text || <span className="text-white/40">Untitled</span>}
              </span>
              <button
                type="button"
                title="Options"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu(todo.id, r.left, r.bottom + 4);
                }}
                className="shrink-0 mr-1 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/row:opacity-100 transition-all"
              >
                <MoreHorizontal size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Field cells — rendered in the order/visibility set by the Fields menu. */}
      {columns
        .filter((c) => c.key !== NAME_COL_KEY)
        .map((c) => <React.Fragment key={c.key}>{renderCell(c.key)}</React.Fragment>)}
    </div>
  );
};
