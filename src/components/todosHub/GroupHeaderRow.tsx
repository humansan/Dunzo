import React from 'react';
import { Plus } from 'lucide-react';
import { NAME_BASE_PAD, INDENT } from './constants';
import { GroupRow } from './types';
import { SectionHeader } from './SectionHeader';

type GroupHeader = Extract<GroupRow, { type: 'header' }>;

// Section header for attribute groupings (Date / Status / Priority). Renders
// through the shared SectionHeader shell so its chrome and spacing — including the
// list-view variant — stay identical to collection headers; only the
// attribute-specific behavior (static label pill, quick-add seeded with the
// section value, drop-at-top indicator) lives here.
export const GroupHeaderRow: React.FC<{
  row: GroupHeader;
  gridTemplateColumns: string;
  listView: boolean;
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
}> = ({ row, gridTemplateColumns, listView, onToggleCollapse, onAddTask, isDropTarget = false, onHeaderDragOver, onHeaderDrop }) => {
  const { id, value, label, color, count, isCollapsed } = row;
  return (
    <SectionHeader
      listView={listView}
      gridTemplateColumns={gridTemplateColumns}
      color={color}
      label={label}
      isCollapsed={isCollapsed}
      onToggleCollapse={() => onToggleCollapse(id)}
      toggleTitle={{ expand: 'Expand group', collapse: 'Collapse group' }}
      count={count}
      actions={onAddTask ? (
        <button
          type="button"
          title="Add task"
          onClick={() => onAddTask(value)}
          className="shrink-0 p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/row:opacity-100 transition-all"
        >
          <Plus size={18} />
        </button>
      ) : undefined}
      dropDecorations={isDropTarget ? (
        // Drop line under the header — task lands at the top of this section.
        <div
          className="pointer-events-none absolute left-0 right-0 bottom-[-1px] z-30 h-0.5 rounded-full bg-[var(--accent2)]"
          style={{ marginLeft: NAME_BASE_PAD + INDENT }}
        />
      ) : undefined}
      onDragOver={onHeaderDragOver}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onHeaderDrop?.(); }}
    />
  );
};
