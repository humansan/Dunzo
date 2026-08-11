import React from 'react';
import { Plus } from 'lucide-react';
import { NAME_BASE_PAD, LEADING_SLOT } from '@/features/planner/constants';
import { btnGhost } from '@/theme/buttons';
import { GroupRow } from '@/features/planner/types';
import { SectionHeader } from '@/features/planner/table/SectionHeader';

type GroupHeader = Extract<GroupRow, { type: 'header' }>;

// Section header for attribute groupings (Date / Status / Priority). Renders
// through the shared SectionHeader shell so its chrome and spacing - including the
// list-view variant - stay identical to collection headers; only the
// attribute-specific behavior (static label pill, quick-add seeded with the
// section value, drop-at-top indicator) lives here.
export const GroupHeaderRow: React.FC<{
  row: GroupHeader;
  gridTemplateColumns: string;
  onToggleCollapse: (id: string) => void;
  // Quick-add a task into this section, seeded with the section's attribute.
  // Receives the section's raw group value (e.g. a priority/status value, or a
  // date-bucket id).
  onAddTask?: (value: string) => void;
  // Drop target: highlighted while a task is dragged over it (drops at the top of
  // the section and reassigns the grouping attribute to this section's value).
  isDropTarget?: boolean;
  onHeaderDragOver?: (e: React.DragEvent) => void;
  onHeaderDrop?: () => void;
}> = ({ row, gridTemplateColumns, onToggleCollapse, onAddTask, isDropTarget = false, onHeaderDragOver, onHeaderDrop }) => {
  const { id, value, label, color, count, isCollapsed } = row;
  return (
    <SectionHeader
      gridTemplateColumns={gridTemplateColumns}
      color={color}
      label={label}
      isCollapsed={isCollapsed}
      onToggleCollapse={() => onToggleCollapse(id)}
      toggleTitle={{ expand: 'Expand group', collapse: 'Collapse group' }}
      count={count}
      // An attribute section has nothing to drag, but it still reserves the drag
      // handle's slot so its pill sits on the same column as the checkboxes below.
      leading={<span className={`shrink-0 ${LEADING_SLOT}`} />}
      actions={onAddTask ? (
        <button
          type="button"
          title="Add task"
          onClick={() => onAddTask(value)}
          className={`shrink-0 p-0.5 rounded opacity-0 group-hover/row:opacity-100 ${btnGhost()}`}
        >
          <Plus size={18} />
        </button>
      ) : undefined}
      dropDecorations={isDropTarget ? (
        // Drop line under the header - task lands at the top of this section, which
        // is indent 0 (the header costs no level), so the line starts at the base pad.
        <div
          className="pointer-events-none absolute left-0 right-0 bottom-[-1px] z-30 h-0.5 rounded-full bg-[var(--accent2)]"
          style={{ marginLeft: NAME_BASE_PAD }}
        />
      ) : undefined}
      // SectionHeader binds this to dragEnter as well - see the note there.
      onDragOver={onHeaderDragOver}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onHeaderDrop?.(); }}
    />
  );
};
