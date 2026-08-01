import React, { useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { GripVertical, MoreHorizontal, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { Todo } from '@shared/types';
import { btnGhost } from '@/theme/buttons';
import { formatTime12h, formatMinutes } from '@/common/lib/time';
import {
  CompletedToggle,
  PercentField,
  CollectionBreadcrumb,
  OptionChip,
  statusOption,
  priorityOption,
} from '@/features/tasks/fields';
import { ColDef, ColKey, EditState, FlatNode, NAME_COL_KEY } from '@/features/planner/types';
import { collectionColor } from '@/theme/collectionColor';
import { INDENT, NAME_BASE_PAD, cellEditCls } from '@/features/planner/constants';
import { pill } from '@/theme/pill';
import { SectionHeader } from '@/features/planner/table/SectionHeader';
import { useTableVariant } from '@/features/planner/variant';
import { isDone, startPercent, duePercent, percentLabel } from '@/features/tasks/model';

// Where the dragged row will land relative to this row: a line before/after it
// (reorder) or nested inside it. `indent` is the indent level to draw the line at.
export type DropIndicator = { pos: 'before' | 'inside' | 'after'; indent: number } | null;

// ── Row ──────────────────────────────────────────────────────────────────────
interface HubRowProps {
  node: FlatNode;
  // Indent steps to draw this row at (FlatNode.indent), not its structural depth.
  displayIndent: number;
  gridTemplateColumns: string;
  editing: EditState;
  startEdit?: (id: string, col: ColKey, e: React.MouseEvent) => void;
  stopEdit: () => void;
  onSaveTodo: (updatedTodo: Todo) => void;
  onAddSubtask: (parentId: string) => string;
  // Omitted → the completion check is read-only (like `startEdit` for the title).
  onToggleTodo?: (id: string) => void;
  openMenu: (id: string, x: number, y: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  collPath: { id: string; name: string; color?: string }[];
  // Ordered, visible columns (Name first) - drives which cells render and in what order.
  columns: ColDef[];
  lastColKey: ColKey; // the rightmost visible column, which gets a right divider
  wrappedFields: Set<ColKey>;
  // When true the drag handle is hidden (drag-and-drop disabled for this row).
  hideDragHandle?: boolean;
  // Visible (post-filter) task count shown on collection header rows.
  taskCount?: number;
  // Quick-add a task under a collection: auto-expands and enters edit mode.
  onQuickAddTask?: (parentId: string) => void;
  // Open task in full view (via clicking the surrounding area of the name cell).
  onOpenTask?: (id: string) => void;
  // ── Finder-columns drill (columns view only) ────────────────────────────────
  // When set, a collection row "opens" (drills into a new column) on click via
  // onActivate instead of collapsing inline, showing a › affordance; isSelected
  // marks the row whose column is currently open. Undefined elsewhere.
  onActivate?: (id: string) => void;
  isSelected?: boolean;
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
  displayIndent,
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
  onOpenTask,
  onActivate,
  isSelected = false,
  isDragSource = false,
  dropIndicator = null,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
}) => {
  const { entry, hasChildren } = node;
  const { todo } = entry;
  const variant = useTableVariant();
  // A non-nesting variant (the flat search list) drops the indent + collapse
  // affordance even if handed hierarchical data; both live variants nest.
  const nested = variant.showNesting;
  const indent = nested ? displayIndent : 0;
  // The name cell doubles as the drag image so the cursor carries a readable chip.
  const dragImageRef = useRef<HTMLDivElement>(null);
  const style: React.CSSProperties = { gridTemplateColumns };
  // A name-only variant always wraps the title (there's only the one column to
  // read), so the per-column wrap setting only governs the title in a full table.
  const titleWrapped = variant.columns === 'name' || wrappedFields.has('title');

  const isEditing = (col: ColKey) => editing?.id === todo.id && editing?.col === col;
  const saveField = (patch: Partial<Todo>) => onSaveTodo({ ...todo, ...patch });

  // Drop handlers shared by both row variants. stopPropagation so the table's
  // container-level onDrop (a fallback for releases over the header/gaps) doesn't
  // also fire and double-commit.
  const dropProps = {
    onDragOver: (e: React.DragEvent) => onRowDragOver?.(todo.id, e),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); onRowDrop?.(); },
  };

  // The grip - the only draggable element, so cell clicks/edits stay intact.
  // NOTE: this must be a plain function call (not an inner <Component/>), or each
  // re-render would create a new component type, remounting the <button> and
  // aborting any in-progress native drag (dragend never fires → stuck indicator).
  const dragHandle = (className = '') =>
    hideDragHandle ? null : (
      <button
        type="button"
        draggable
        onClick={(e) => e.stopPropagation()}
        onDragStart={(e) => {
          if (dragImageRef.current) e.dataTransfer.setDragImage(dragImageRef.current, 8, 8);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', todo.id);
          onRowDragStart?.(todo.id);
        }}
        onDragEnd={() => onRowDragEnd?.()}
        className={`shrink-0 h-5 flex items-center justify-center cursor-grab active:cursor-grabbing text-fg-ghost hover:text-fg-subtle opacity-0 group-hover/row:opacity-100 transition-opacity ${className}`}
        title="Drag to reorder / nest"
      >
        <GripVertical size={16} />
      </button>
    );

  // The drop indicator: a line at the target indent (before/after), or a ring on
  // the row (inside = nest under this row).
  const dropIndent = NAME_BASE_PAD + (dropIndicator?.indent ?? 0) * INDENT;
  const dropLine = (where: 'before' | 'after') =>
    dropIndicator?.pos === where ? (
      <div
        className="pointer-events-none absolute left-0 right-0 z-30 h-0.5 rounded-full bg-[var(--accent2)]"
        style={{ [where === 'before' ? 'top' : 'bottom']: -1, marginLeft: dropIndent }}
      />
    ) : null;
  // 'inside' (nest) highlight: an overlay so it sits ABOVE the sticky Name cell
  // (z-20) and spans the whole row - a ring on the grid would be painted over by
  // that opaque cell, leaving only the scrollable part highlighted.
  const insideOverlay = dropIndicator?.pos === 'inside' ? (
    <div className="pointer-events-none absolute inset-0 z-30 ring-2 ring-inset ring-[var(--accent2)] bg-[var(--accent2)]/5" />
  ) : null;

  const editCellWrap = 'flex items-stretch h-full border-l border-line-subtle';
  // Empty fields render nothing - a placeholder dash just adds clutter.
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
        onClick={(e) => startEdit?.(todo.id, col, e)}
        className={`flex items-start py-2 px-2.5 border-l border-line-subtle ${startEdit ? 'cursor-pointer hover:bg-fill-subtle' : ''} overflow-hidden ${
          wrap ? '[&_.truncate]:whitespace-normal [&_.truncate]:break-words' : ''
        } ${
          active ? 'ring-2 ring-inset ring-(--accent2)' : ''
        } ${
          col === lastColKey ? 'border-r border-line-subtle' : ''
        }`}
      >
        {children}
      </div>
    );
  };

  // ── Collection row ──────────────────────────────────────────────────────────
  // A section header, not a task: rendered through the shared SectionHeader shell
  // (same chrome/spacing as attribute-group headers) with the collection-specific
  // bits - inline-rename pill, drag handle, options + add buttons - passed in.
  if (todo.isCollection) {
    const color = collectionColor(todo.color);
    // Columns view: the header opens a child column on click (drill) rather than
    // inline-renaming, so the rename pill/editor is swapped for the drill wiring
    // (rename stays available via the ⋯ menu → Edit collection).
    const drill = !!onActivate;
    return (
      <SectionHeader
        gridTemplateColumns={gridTemplateColumns}
        color={color}
        label={todo.text || 'Untitled collection'}
        onActivate={drill ? () => onActivate!(todo.id) : undefined}
        isSelected={isSelected}
        onPillClick={drill || !startEdit ? undefined : (e) => startEdit?.(todo.id, 'title', e)}
        pillOverride={!drill && isEditing('title') ? (
          <input
            type="text"
            autoFocus
            defaultValue={todo.text}
            onChange={(e) => saveField({ text: e.target.value })}
            onBlur={stopEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="Collection name"
            size={1}
            style={pill(color)}
            className={`w-auto min-w-0 max-w-full field-sizing-content rounded-full px-2.5 py-px font-medium focus:outline-none placeholder:text-fg-faint animate-[ring-grow_150ms_linear_both] ${variant.mode === 'list' ? 'text-base' : 'text-sm'}`}
          />
        ) : undefined}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => onToggleCollapse(todo.id)}
        hasToggle={nested && hasChildren}
        toggleTitle={{ expand: 'Expand collection', collapse: 'Collapse collection' }}
        count={taskCount}
        depth={indent}
        leading={dragHandle('mr-1')}
        actions={
          <>
            <button
              type="button"
              title="Options"
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                openMenu(todo.id, r.left, r.bottom + 4);
              }}
              className={`shrink-0 mr-0.5 p-0.5 rounded opacity-0 group-hover/row:opacity-100 ${btnGhost()}`}
            >
              <MoreHorizontal size={18} />
            </button>
            <button
              type="button"
              title="Add task"
              onClick={() => { onQuickAddTask ? onQuickAddTask(todo.id) : onAddSubtask(todo.id); }}
              className={`shrink-0 p-0.5 rounded opacity-0 group-hover/row:opacity-100 ${btnGhost()}`}
            >
              {onQuickAddTask && <Plus size={18} />}
            </button>
          </>
        }
        dropDecorations={<>{dropLine('before')}{dropLine('after')}{insideOverlay}</>}
        isDragSource={isDragSource}
        dragImageRef={dragImageRef}
        onContextMenu={(e) => { e.preventDefault(); openMenu(todo.id, e.clientX, e.clientY); }}
        onDragOver={dropProps.onDragOver}
        onDrop={dropProps.onDrop}
      />
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
            <span className="truncate text-sm text-fg-muted">
              {todo.dueDate ? format(parseISO(todo.dueDate), 'MMM d, yyyy') : muted}
            </span>
          </DisplayCell>
        );
      case 'startDate':
        return (
          <DisplayCell col="startDate" active={isEditing('startDate')}>
            <span className="truncate text-sm text-fg-muted">
              {todo.startDate ? format(parseISO(todo.startDate), 'MMM d, yyyy') : muted}
            </span>
          </DisplayCell>
        );
      case 'start':
        return (
          <DisplayCell col="start" active={isEditing('start')}>
            <span className="truncate text-sm text-fg-muted">{todo.startTime ? formatTime12h(todo.startTime) : muted}</span>
          </DisplayCell>
        );
      case 'end':
        return (
          <DisplayCell col="end" active={isEditing('end')}>
            <span className="truncate text-sm text-fg-muted">{todo.dueTime ? formatTime12h(todo.dueTime) : muted}</span>
          </DisplayCell>
        );
      case 'percent':
        return isEditing('percent') ? (
          <div className={editCellWrap}>
            <PercentField kind="due" value={duePercent(todo)} autoFocus onBlur={stopEdit} onChange={saveField} className={cellEditCls} />
          </div>
        ) : (
          <DisplayCell col="percent">
            <span className="truncate text-sm text-fg-muted">
              {percentLabel(duePercent(todo)) || muted}
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
        return (
          <DisplayCell col="xp">
            <span className="truncate text-sm text-fg-muted">{todo.xp !== undefined ? `${todo.xp}` : muted}</span>
          </DisplayCell>
        );
      case 'notes':
        return (
          <DisplayCell col="notes">
            {todo.notes ? <span className="truncate text-sm text-fg-muted">{todo.notes}</span> : muted}
          </DisplayCell>
        );
      case 'startPercent':
        return isEditing('startPercent') ? (
          <div className={editCellWrap}>
            <PercentField kind="start" value={startPercent(todo)} autoFocus onBlur={stopEdit} onChange={saveField} className={cellEditCls} />
          </div>
        ) : (
          <DisplayCell col="startPercent">
            <span className="truncate text-sm text-fg-muted">
              {percentLabel(startPercent(todo)) || muted}
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
                            placeholder="min"
              className={cellEditCls}
            />
          </div>
        ) : (
          <DisplayCell col="estimatedTime">
            <span className="truncate text-sm text-fg-muted">
              {todo.estimatedTime !== undefined ? formatMinutes(todo.estimatedTime) : muted}
            </span>
          </DisplayCell>
        );
      case 'createdAt':
        return (
          <div
            className={`flex items-start h-full py-2 px-2.5 border-l border-line-subtle overflow-hidden ${
              col === lastColKey ? 'border-r border-line-subtle' : ''
            }`}
          >
            <span className="truncate text-sm text-fg-muted">
              {format(new Date(todo.createdAt), 'MMM d, yyyy')}
            </span>
          </div>
        );
      case 'completedAt':
        return (
          <div
            className={`flex items-start h-full py-2 px-2.5 border-l border-line-subtle overflow-hidden ${
              col === lastColKey ? 'border-r border-line-subtle' : ''
            }`}
          >
            <span className="truncate text-sm text-fg-muted">
              {todo.completedAt ? format(new Date(todo.completedAt), 'MMM d, yyyy') : muted}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  // A context row - an ancestor kept only so its matching descendant stays nested
  // (see FlatNode.matchesView) - renders dimmed, so "the tab didn't match this, it's
  // here for its child" reads at a glance. It lifts to full opacity on hover, since
  // it's still a live, editable row.
  const contextDim = node.matchesView ? '' : 'opacity-40';

  return (
    <div
      style={style}
      {...dropProps}
      onContextMenu={(e) => { e.preventDefault(); openMenu(todo.id, e.clientX, e.clientY); }}
      className={`relative grid items-stretch min-h-[36px] border-b border-line-subtle group/row transition-opacity ${
        isDragSource ? 'opacity-40' : `hover:bg-fill-subtle ${contextDim}`
      }`}
    >
      {dropLine('before')}
      {dropLine('after')}
      {insideOverlay}
      {/* Name group: indent + collapse + handle + checkbox + name.
          Frozen to the left edge; needs an opaque bg so scrolled cells don't show through. */}
      <div
        ref={dragImageRef}
        className={`group/name sticky left-0 z-20 flex items-start h-full overflow-hidden cursor-pointer ${
          variant.columns === 'all' ? 'border-r border-line-subtle bg-canvas' : ''
        }
        ${isEditing('title') && "ring-2 ring-inset ring-[var(--accent2)]"}
        `}
      >
        {/* The frozen Name cell needs an opaque bg so scrolled cells don't show through
            it - which also hides the row's translucent hover fill. These two overlays
            replay it: one on row hover, one more on cell hover. Stacking the same 5%
            fill twice is exactly what the scrolling cells do (transparent cell hover
            fill over the row's), so the Name cell lands on the same two brightness
            steps instead of its own ramp. */}
        {variant.columns === 'all' && (
          <>
            <div className="pointer-events-none absolute inset-0 z-0 hidden group-hover/row:block bg-fill-subtle" />
            <div className="pointer-events-none absolute inset-0 z-0 hidden group-hover/name:block bg-fill-subtle" />
          </>
        )}
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
            the editor's ring lines up with the cell borders.
            
            ring-1 ring-inset ring-[var(--accent2)]/60
            */}
        <div
          style={{ paddingLeft: NAME_BASE_PAD + indent * INDENT }}
          className={`relative z-10 flex min-w-0 flex-1 ${titleWrapped ? 'items-start' : 'items-center'} ${
            isEditing('title') && !titleWrapped ? 'h-9' : 'py-2'
          } `}
          onClick={() => !isEditing('title') && onOpenTask?.(todo.id)}
        >
          {/* Collapse chevron (nesting variants only) - a spacer keeps the checkbox
              aligned when a row has no children. A flat variant drops both. */}
          {nested && (hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(todo.id); }}
              className={"shrink-0 h-5 w-5 mr-0.5 flex items-center justify-center rounded transition-colors " + btnGhost()}
              title={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
            </button>
          ) : (
            <span className="shrink-0 w-5.5" />
          ))}

          {dragHandle()}

          <CompletedToggle completed={isDone(todo)} onToggle={onToggleTodo ? () => onToggleTodo(todo.id) : undefined} size={18} className='mr-1 ml-1 h-5 flex items-center justify-center'/>

          {isEditing('title') ? (
            titleWrapped ? (
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
                className="flex-1 min-w-0 resize-none field-sizing-content break-words py-0 pl-1 pr-1.5 text-sm text-fg font-medium focus:outline-none"
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
                className="flex-1 min-w-0 h-full pl-1 pr-1.5 text-sm text-fg font-medium focus:outline-none"
              />
            )
          ) : (
            <>
              <span
                onClick={(e) => { if (startEdit) e.stopPropagation(); startEdit?.(todo.id, 'title', e); }}
                className={`flex-1 min-w-0 pl-1 text-sm rounded ${startEdit ? 'cursor-text hover:bg-fill' : ''} ${titleWrapped ? 'break-words' : 'truncate'} ${isDone(todo) ? 'text-fg-subtle line-through' : 'text-fg font-medium'}`}
              >
                {todo.text || <span className="text-fg-faint">Untitled</span>}
              </span>
              <button
                type="button"
                title="Options"
                onClick={(e) => {
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu(todo.id, r.left, r.bottom + 4);
                }}
                className={`shrink-0 mr-1.5 p-0.5 rounded opacity-0 group-hover/row:opacity-100 ${btnGhost()}`}
              >
                <MoreHorizontal size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Field cells - rendered in the order/visibility set by the Fields menu. */}
      {columns
        .filter((c) => c.key !== NAME_COL_KEY)
        .map((c) => <React.Fragment key={c.key}>{renderCell(c.key)}</React.Fragment>)}
      {/* Spacer track - fills remaining width, mirrors the header spacer. A
          single Name column has no such track, so it's for the full-column grid. */}
      {variant.columns === 'all' && <div />}
    </div>
  );
};

// Memoized: with the parent passing stable callbacks + a stable collPath, rows
// only re-render when their own data/state actually changes (e.g. the row being
// dragged over), instead of all rows re-rendering on every parent render.
export const HubRow = React.memo(HubRowImpl);
