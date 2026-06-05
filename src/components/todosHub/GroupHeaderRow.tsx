import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { NAME_BASE_PAD, INDENT, pillTextColor } from './constants';
import { GroupRow } from './types';

type GroupHeader = Extract<GroupRow, { type: 'header' }>;

export const GroupHeaderRow: React.FC<{
  row: GroupHeader;
  onToggleCollapse: (id: string) => void;
  // Drop target: highlighted while a task is dragged over it (drops at the top of
  // the section and reassigns the grouping attribute to this section's value).
  isDropTarget?: boolean;
  onHeaderDragOver?: (e: React.DragEvent) => void;
  onHeaderDrop?: () => void;
}> = ({ row, onToggleCollapse, isDropTarget = false, onHeaderDragOver, onHeaderDrop }) => {
  const { id, label, color, count, isCollapsed } = row;
  return (
    <div
      onDragOver={onHeaderDragOver}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onHeaderDrop?.(); }}
      className="relative flex items-center w-full min-h-11 border-b pt-3 border-white/8 hover:bg-white/[0.015]"
    >
      {/* Drop line under the header — task lands at the top of this section. */}
      {isDropTarget && (
        <div
          className="pointer-events-none absolute left-0 right-0 bottom-[-1px] z-30 h-0.5 rounded-full bg-[var(--accent2)]"
          style={{ marginLeft: NAME_BASE_PAD + INDENT }}
        />
      )}
      <div
        style={{ paddingLeft: NAME_BASE_PAD }}
        className="sticky left-0 flex items-center gap-1.5 min-w-0 max-w-full"
      >
        <button
          type="button"
          onClick={() => onToggleCollapse(id)}
          className="shrink-0 p-0.5 flex items-center justify-center rounded text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors"
          title={isCollapsed ? 'Expand group' : 'Collapse group'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <span
          style={{ backgroundColor: `${color}40`, color: pillTextColor(color) }}
          className="min-w-0 truncate rounded-full px-2.5 text-sm font-medium"
        >
          {label}
        </span>
        <span className="text-xs text-white/35 font-mono">{count}</span>
      </div>
    </div>
  );
};
