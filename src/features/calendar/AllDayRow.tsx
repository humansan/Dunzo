import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Circle, CheckCircle2 } from 'lucide-react';
import { Todo } from '@shared/types';
import { isDone } from '@/features/tasks/model';
import { ALL_DAY_CHIP_HEIGHT, allDayChipTop } from './allDay';

// ─── All-day row ────────────────────────────────────────────────────────────
// The band under the date headers holding each day's untimed tasks. Presentational
// only: it is handed the columns, the per-date lists and the row height, and reports
// interactions back up - CalendarView owns the data and (from phase 3) the drag.
//
// It sits OUTSIDE the grid's scroll container, as a flex sibling of the header row,
// so it stays pinned with no sticky positioning of its own.

// A chip is the all-day counterpart of EventCard: same accent treatment (fill mixed
// with the canvas, spine, completion dot), without the things a chip has no room or
// need for - no time text (there is no time), no duration, no resize handles, no
// overlap cascade.
const AllDayChip: React.FC<{
  todo: Todo;
  accent: string;
  top: number;
  onMouseDown?: (e: React.MouseEvent) => void;
  onToggle?: () => void;
  // The drag/settle preview: outlined in the task's accent, like the grid's ghost.
  isGhost?: boolean;
}> = ({ todo, accent, top, onMouseDown, onToggle, isGhost = false }) => {
  const [isHovered, setIsHovered] = useState(false);
  const done = isDone(todo);

  return (
    <div
      data-event-card
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`absolute left-1 right-1 rounded-md overflow-hidden cursor-pointer flex items-center ${
        done ? 'opacity-40' : 'opacity-100'
      } ${isGhost ? 'z-50' : 'ring-1 ring-canvas'}`}
      style={{
        top: `${top}px`,
        height: `${ALL_DAY_CHIP_HEIGHT}px`,
        ...(isGhost ? { boxShadow: `0 0 0 1px ${accent}` } : {}),
        backgroundColor: done
          ? ((isHovered || isGhost) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)')
          : ((isHovered || isGhost)
            ? `color-mix(in srgb, ${accent} 50%, canvas 50%)`
            : `color-mix(in srgb, ${accent} 40%, canvas 60%)`),
      }}
    >
      {!done && <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: accent }} />}
      <div className="flex items-center gap-1.5 min-w-0 pl-2 pr-1.5">
        {/* Same dot-to-check swap as EventCard, including the reason the accent
            lives on a plain wrapper rather than the motion.div. */}
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 flex items-center justify-center relative"
          onClick={(e) => { if (onToggle) { e.stopPropagation(); onToggle(); } }}
          onMouseDown={(e) => { if (onToggle) e.stopPropagation(); }}
        >
          {(isHovered && onToggle) ? (
            <div className="absolute cursor-pointer flex items-center justify-center z-50" style={{ color: accent }}>
              <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 0.8, opacity: 1 }}>
                {done ? <CheckCircle2 size={15} strokeWidth={2.5} /> : <Circle size={15} strokeWidth={2.5} />}
              </motion.div>
            </div>
          ) : (
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${done ? 'bg-fill-stronger' : ''}`}
              style={done ? undefined : { backgroundColor: accent }}
            />
          )}
        </div>
        <span className={`text-[12px] font-semibold truncate ${done ? 'text-fg-ghost line-through' : 'text-fg'}`}>
          {todo.text || 'Untitled'}
        </span>
      </div>
    </div>
  );
};

// One chip's worth of a column: a real task, or the preview of one being dropped in.
export interface AllDayItem {
  todo: Todo;
  isGhost: boolean;
}

export const AllDayRow: React.FC<{
  // The row's columns - the same array (and therefore the same widths) the header
  // and the grid use.
  days: { key: string; dateStr: string }[];
  // Per column, in display order, ghost included - CalendarView decides what belongs
  // where (and what's hidden mid-drag) so the row never has to reason about it.
  itemsByDate: Map<string, AllDayItem[]>;
  height: number;
  gutterWidth: number;
  accentFor: (todo: Todo) => string;
  onToggleTodo: (id: string) => void;
  // Grabbing a chip: to move it to another column, or down into the time grid.
  onChipMouseDown: (e: React.MouseEvent, todo: Todo, dateStr: string) => void;
  rowRef?: React.Ref<HTMLDivElement>;
  // The day-columns strip, gutter excluded - the measuring rod for "which column is
  // the pointer over" during a drag.
  stripRef?: React.Ref<HTMLDivElement>;
}> = ({ days, itemsByDate, height, gutterWidth, accentFor, onToggleTodo, onChipMouseDown, rowRef, stripRef }) => (
  <div
    ref={rowRef}
    className="flex flex-shrink-0 border-b border-line-subtle"
    style={{ height: `${height}px` }}
  >
    <div
      className="flex-shrink-0 flex items-start justify-end pr-2 pt-1 text-[10px] font-mono text-fg-ghost"
      style={{ width: gutterWidth }}
    >
      all-day
    </div>
    <div ref={stripRef} className="flex flex-1 min-w-0">
      {days.map(({ key, dateStr }) => {
        const items = itemsByDate.get(dateStr) ?? [];
        return (
          <div key={key} className="flex-1 relative border-l border-line-subtle">
            {items.map(({ todo, isGhost }, i) => (
              <AllDayChip
                key={isGhost ? 'ghost' : todo.id}
                todo={todo}
                accent={accentFor(todo)}
                top={allDayChipTop(i)}
                isGhost={isGhost}
                // A ghost is a preview of a drop in flight; it isn't the task, so it
                // neither offers the completion toggle nor starts a drag of its own.
                onToggle={isGhost ? undefined : () => onToggleTodo(todo.id)}
                onMouseDown={isGhost ? undefined : (e) => onChipMouseDown(e, todo, dateStr)}
              />
            ))}
          </div>
        );
      })}
    </div>
  </div>
);
