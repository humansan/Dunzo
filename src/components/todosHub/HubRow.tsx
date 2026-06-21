import React, { useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { GripVertical, MoreHorizontal, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { Todo } from '../../types';
import { formatTime12h, percentageToTime, formatMinutes } from '../../utils/timeUtils';
import {
  CompletedToggle,
  PercentField,
  XpField,
  CollectionBreadcrumb,
  OptionChip,
  statusOption,
  priorityOption,
} from '../todoFields';
import { ColDef, ColKey, EditState, FlatNode, NAME_COL_KEY } from './types';
import { INDENT, NAME_BASE_PAD, DEFAULT_COLLECTION_COLOR, pillTextColor, cellEditCls } from './constants';
import { isDone } from '../../utils/todoStatus';

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
  onSaveTodo: (updatedTodo: Todo) => void;
  onAddSubtask: (parentId: string) => string;
  onToggleTodo: (id: string) => void;
  openMenu: (id: string, x: number, y: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  collPath: { id: string; name: string; color?: string }[];
  // Ordered, visible columns (Name first) — drives which cells render and in what order.
  columns: ColDef[];
  lastColKey: ColKey; // the rightmost visible column, which gets a right divider
  wrappedFields: Set<ColKey>;
  // When true the drag handle is hidden (drag-and-drop disabled for this row).
  hideDragHandle?: boolean;
  // Visible (post-filter) task count shown on collection header rows.
  taskCount?: number;
  // Quick-add a task under a collection: auto-expands and enters edit mode.
  onQuickAddTask?: (parentId: string) => void;
  // ── Native drag & drop (sidebar-style: indicator only, nothing shifts) ──────
  isDragSource?: boolean;          // this row is the one being dragged (dim it)
  dropIndicator?: DropIndicator;   // where the drop will land, drawn on this row
  onRowDragStart?: (id: string) => void;
  onRowDragOver?: (id: string, e: React.DragEvent) => void;
  onRowDrop?: () => void;
  onRowDragEnd?: () => void;
}

const HubRowImpl: React.FC<HubRowProps> = ({
  node,
  displayDepth,
  gridTemplateColumns,
  editing,
  startEdit,
  stopEdit,
  onSaveTodo,
  onToggleTodo,
  onAddSubtask,
  openMenu,
  isCollapsed,
  onToggleCollapse,
  collPath,
  columns,
  lastColKey,
  wrappedFields,
  hideDragHandle = false,
  taskCount,
  onQuickAddTask,
  isDragSource = false,
  dropIndicator = null,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
}) => {
  const { entry, hasChildren } = node;
  const { todo } = entry;
  // The name cell doubles as the drag image so the cursor carries a readable chip.
  const dragImageRef = useRef<HTMLDivElement>(null);
  const style: React.CSSProperties = { gridTemplateColumns };

  const isEditing = (col: ColKey) => editing?.id === todo.id && editing?.col === col;
  const saveField = (patch: Partial<Todo>) => onSaveTodo({ ...todo, ...patch });

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
        className={`shrink-0 h-5 flex items-center justify-center cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 opacity-0 group-hover/row:opacity-100 transition-opacity ${className}`}
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

  // A clickable display cell that switches into edit mode. `active` adds the
  // accent ring that inline-edited cells get from `cellEditCls`; cells whose
  // editor lives in a popover (currently the date column) opt into it so the
  // cell visibly reflects that it's being edited.
  // A clickable cell. Every cell stretches to the row height (the grid is
  // `items-stretch`) and TOP-aligns its content with a fixed vertical pad
  // (`py-2`). A single line of text and a chip are both ~20px tall, so in a
  // one-line (36px) row that pad visually centers them; when another column
  // wraps and grows the row, every cell's first line stays pinned to the top and
  // lines up with the wrapping cell's first line (which, filling the row, reads
  // as centered). Toggling wrap never shifts a one-line row's height.
  const DisplayCell: React.FC<{ col: ColKey; children: React.ReactNode; active?: boolean }> = ({ col, children, active = isEditing(col) }) => {
    const wrap = wrappedFields.has(col);
    return (
      <div
        onClick={(e) => startEdit(todo.id, col, e)}
        className={`flex items-start py-2 px-2.5 border-l border-white/8 cursor-pointer hover:bg-white/3 overflow-hidden ${
          wrap ? '[&_.truncate]:whitespace-normal [&_.truncate]:break-words' : ''
        } ${
          active ? 'ring-1 ring-inset ring-(--accent2)/60' : ''
        } ${
          col === lastColKey ? 'border-r border-white/8' : ''
        }`}
      >
        {children}
      </div>
    );
  };

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
        className={`relative grid items-end min-h-12 border-b pt-4 border-white/8 group/row ${
          isDragSource && 'opacity-50'
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
          className="sticky grid-col-200 left-0 z-20 flex items-center h-full min-w-0 overflow-hidden bg-[#0a0a0a]"
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(todo.id); }}
              className="shrink-0 p-0.5 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
              title={isCollapsed ? 'Expand collection' : 'Collapse collection'}
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
            </button>
          ) : (
            <span className="shrink-0 w-5.5" />
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
              className="w-auto min-w-0 max-w-full field-sizing-content rounded-full px-2.5 py-px text-sm font-medium focus:outline-none placeholder:text-white/40 ring-1 ring-current/60"
            />
          ) : (
            <span
              onClick={(e) => startEdit(todo.id, 'title', e)}
              style={{ backgroundColor: `${color}40`, color: pillTextColor(color) }}
              className="min-w-0 max-w-full truncate rounded-full px-2.5 py-px text-sm font-medium cursor-text"
            >
              {todo.text || 'Untitled collection'}
            </span>
          )}

          {taskCount !== undefined && (
            <span className="shrink-0 text-xs px-1.5 text-white/40 font-mono">{taskCount}</span>
          )}

          <button
            type="button"
            title="Options"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              openMenu(todo.id, r.left, r.bottom + 4);
            }}
            className="shrink-0 mr-0.5 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/row:opacity-100 transition-all"
          >
            <MoreHorizontal size={18} />
          </button>

          <button
            type="button"
            title="Add task"
            onClick={() => {
              onQuickAddTask ? onQuickAddTask(todo.id) : onAddSubtask(todo.id);
            }}
            className="shrink-0 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/row:opacity-100 transition-all"
          >
            <Plus size={18} />
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
        return (
          <DisplayCell col="date" active={isEditing('date')}>
            <span className="truncate text-sm text-white/90">
              {todo.dueDate ? format(parseISO(todo.dueDate), 'MMM d, yyyy') : muted}
            </span>
          </DisplayCell>
        );
      case 'startDate':
        return (
          <DisplayCell col="startDate" active={isEditing('startDate')}>
            <span className="truncate text-sm text-white/90">
              {todo.startDate ? format(parseISO(todo.startDate), 'MMM d, yyyy') : muted}
            </span>
          </DisplayCell>
        );
      case 'start':
        return (
          <DisplayCell col="start" active={isEditing('start')}>
            <span className="truncate text-sm text-white/90">{todo.startTime ? formatTime12h(todo.startTime) : muted}</span>
          </DisplayCell>
        );
      case 'end':
        return (
          <DisplayCell col="end" active={isEditing('end')}>
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
      case 'startPercent':
        return isEditing('startPercent') ? (
          <div className={editCellWrap}>
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              defaultValue={todo.startPercentage ?? ''}
              autoFocus
              onBlur={stopEdit}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') { saveField({ startPercentage: undefined }); return; }
                const num = parseFloat(val);
                if (!isNaN(num)) {
                  const t = percentageToTime(num);
                  saveField({ startPercentage: num, ...(t ? { startTime: t } : {}) });
                }
              }}
              style={{ colorScheme: 'dark' }}
              placeholder="e.g. 50"
              className={cellEditCls}
            />
          </div>
        ) : (
          <DisplayCell col="startPercent">
            <span className="truncate text-sm text-white/90">
              {todo.startPercentage !== undefined ? `${todo.startPercentage}%` : muted}
            </span>
          </DisplayCell>
        );
      case 'estimatedTime':
        return isEditing('estimatedTime') ? (
          <div className={editCellWrap}>
            <input
              type="number"
              min="0"
              step="1"
              defaultValue={todo.estimatedTime ?? ''}
              autoFocus
              onBlur={stopEdit}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') { saveField({ estimatedTime: undefined }); return; }
                const num = parseInt(val, 10);
                if (!isNaN(num) && num >= 0) saveField({ estimatedTime: num });
              }}
              style={{ colorScheme: 'dark' }}
              placeholder="min"
              className={cellEditCls}
            />
          </div>
        ) : (
          <DisplayCell col="estimatedTime">
            <span className="truncate text-sm text-white/90">
              {todo.estimatedTime !== undefined ? formatMinutes(todo.estimatedTime) : muted}
            </span>
          </DisplayCell>
        );
      case 'createdAt':
        return (
          <div
            className={`flex items-start h-full py-2 px-2.5 border-l border-white/8 overflow-hidden ${
              col === lastColKey ? 'border-r border-white/8' : ''
            }`}
          >
            <span className="truncate text-sm text-white/60">
              {format(new Date(todo.createdAt), 'MMM d, yyyy')}
            </span>
          </div>
        );
      case 'completedAt':
        return (
          <div
            className={`flex items-start h-full py-2 px-2.5 border-l border-white/8 overflow-hidden ${
              col === lastColKey ? 'border-r border-white/8' : ''
            }`}
          >
            <span className="truncate text-sm text-white/90">
              {todo.completedAt ? format(new Date(todo.completedAt), 'MMM d, yyyy') : muted}
            </span>
          </div>
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
        isDragSource ? 'opacity-40' : 'hover:bg-white/2'
      }`}
    >
      {dropLine('before')}
      {dropLine('after')}
      {insideOverlay}
      {/* Name group: indent + collapse + handle + checkbox + name.
          Frozen to the left edge; needs an opaque bg so scrolled cells don't show through. */}
      <div
        ref={dragImageRef}
        className="sticky left-0 z-20 flex items-start h-full overflow-hidden border-r border-white/8 bg-[#0a0a0a] group-hover/row:bg-[#0f0f0f] hover:bg-[#161616]"
      >
        {/* Name band. Each leading control is a line-height box (`h-5`) that centers
            its icon, so they line up on the title's first text line.
            • Wrapped title: `items-start` so the controls (and the title's first line)
              top-align while the text wraps below.
            • Unwrapped title: `items-center`; the band sizes to its content (one line)
              and the parent top-anchors it (`items-start`), so in a row grown tall by
              another column the band sits at the top, aligned with the other cells'
              first line, instead of floating to the middle.
            While inline-editing a non-wrapped title the band takes the fixed
            single-line height (`h-9` = the 36px row min-height) rather than the full
            cell, so it stays pinned to the top in a tall row (no jump to
            vertical-center) while in a single-line row that height equals the cell and
            the editor's ring lines up with the cell borders. */}
        <div
          style={{ paddingLeft: NAME_BASE_PAD + displayDepth * INDENT }}
          className={`flex min-w-0 flex-1 ${wrappedFields.has('title') ? 'items-start' : 'items-center'} ${
            isEditing('title') && !wrappedFields.has('title') ? 'h-9' : 'py-[7px]'
          }`}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(todo.id); }}
              className="shrink-0 h-5 p-0.5 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
              title={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
            </button>
          ) : (
            <span className="shrink-0 w-5.5" />
          )}

          {dragHandle()}

          <CompletedToggle completed={isDone(todo)} onToggle={() => onToggleTodo(todo.id)} size={18} className='mr-1 ml-1 h-5 flex items-center justify-center'/>

          {isEditing('title') ? (
            wrappedFields.has('title') ? (
              // Wrapped column → multi-line editor that grows with content, so the
              // text keeps the same wrapping/styling it had as a display cell.
              <textarea
                autoFocus
                rows={1}
                defaultValue={todo.text}
                onChange={(e) => saveField({ text: e.target.value })}
                onBlur={stopEdit}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                placeholder="Untitled"
                className="flex-1 min-w-0 resize-none field-sizing-content break-words bg-[#1e1e1e] py-0 pl-1 pr-1.5 text-sm text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60"
              />
            ) : (
              <input
                type="text"
                autoFocus
                defaultValue={todo.text}
                onChange={(e) => saveField({ text: e.target.value })}
                onBlur={stopEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Untitled"
                className="flex-1 min-w-0 h-full bg-[#1e1e1e] pl-1 pr-1.5 text-sm text-white focus:outline-none ring-1 ring-inset ring-[var(--accent2)]/60"
              />
            )
          ) : (
            <>
              <span
                onClick={(e) => startEdit(todo.id, 'title', e)}
                className={`flex-1 min-w-0 pl-1 text-sm cursor-text ${wrappedFields.has('title') ? 'break-words' : 'truncate'} ${isDone(todo) ? 'text-white/45 line-through' : 'text-white'}`}
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
                className="shrink-0 mr-1.5 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/row:opacity-100 transition-all"
              >
                <MoreHorizontal size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Field cells — rendered in the order/visibility set by the Fields menu. */}
      {columns
        .filter((c) => c.key !== NAME_COL_KEY)
        .map((c) => <React.Fragment key={c.key}>{renderCell(c.key)}</React.Fragment>)}
      {/* Spacer track — fills remaining width, mirrors the header spacer. */}
      <div />
    </div>
  );
};

// Memoized: with the parent passing stable callbacks + a stable collPath, rows
// only re-render when their own data/state actually changes (e.g. the row being
// dragged over), instead of all rows re-rendering on every parent render.
export const HubRow = React.memo(HubRowImpl);
