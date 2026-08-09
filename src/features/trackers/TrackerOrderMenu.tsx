import React, { useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { Tracker } from '@shared/types';
import { PopoverMenu } from '@/common/ui';

// ── Widget order menu ────────────────────────────────────────────────────────
// Dropdown listing every time widget in its current order; drag a row to move it
// (a drop line marks the target). The order applies everywhere widgets are listed
// - this page and the daily page's left rail.
//
// Deliberately a sibling of the Planner's FieldsMenu rather than a shared
// component: the drag machinery is the same, but that menu is about columns (a
// locked first field, show/hide, word wrap) and this one is about rows and nothing
// else. Sharing would mean a prop for each of those differences.
export const TrackerOrderMenu: React.FC<{
  anchor: { right: number; top: number };
  // In display order - the same list the page renders.
  trackers: Tracker[];
  onMove: (dragId: string, targetId: string, pos: 'before' | 'after') => void;
  onClose: () => void;
}> = ({ anchor, trackers, onMove, onClose }) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropInfo, setDropInfo] = useState<{ id: string; pos: 'before' | 'after' } | null>(null);
  // Same value as `dragId`, written synchronously in onDragStart. The state update
  // only lands on the next render, and the first dragEnter/dragOver events arrive
  // before that - reading state there would refuse the drop for the first frames of
  // every drag. `dragId` still drives rendering (the dragged row's dim).
  const dragIdRef = useRef<string | null>(null);

  // Bound to dragEnter AND dragOver: an element is only a drop target once one of
  // the two is cancelled on it, and a row is several nested elements (grip, colour
  // dot, label) - handling dragOver alone leaves a frame on entering each one where
  // the drop is refused and the cursor flips to circle-slash.
  const onRowDragOver = (e: React.DragEvent, id: string) => {
    if (!dragIdRef.current) { if (dropInfo) setDropInfo(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const pos: 'before' | 'after' = (e.clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after';
    setDropInfo((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }));
  };
  const endDrag = () => {
    dragIdRef.current = null;
    setDragId(null);
    setDropInfo(null);
  };
  const commitDrop = () => {
    const id = dragIdRef.current;
    if (id && dropInfo && dropInfo.id !== id) onMove(id, dropInfo.id, dropInfo.pos);
    endDrag();
  };

  // Panel-wide, so the title strip, the panel padding and the gaps between rows stay
  // part of the drop zone - the cursor holds its drag shape for the whole sweep
  // instead of flickering whenever the pointer leaves a row.
  const allowDrop = (e: React.DragEvent) => { if (dragIdRef.current) e.preventDefault(); };

  return (
    <PopoverMenu
      anchor={anchor}
      title="Order"
      onClose={onClose}
      className="w-60 p-1 space-y-2.5"
      onDragEnter={allowDrop}
      onDragOver={allowDrop}
      onDrop={(e) => { e.preventDefault(); commitDrop(); }}
    >
      <div className="space-y-0.5">
        {trackers.length === 0 && (
          <div className="px-2 py-1.5 text-[13px] text-fg-faint">No widgets yet</div>
        )}
        {trackers.map((tracker) => {
          const drop = dropInfo?.id === tracker.id ? dropInfo.pos : null;
          return (
            <div
              key={tracker.id}
              className="relative"
              draggable
              onDragStart={(e) => {
                dragIdRef.current = tracker.id;
                setDragId(tracker.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tracker.id);
              }}
              onDragEnd={endDrag}
              onDragEnter={(e) => onRowDragOver(e, tracker.id)}
              onDragOver={(e) => onRowDragOver(e, tracker.id)}
            >
              {drop === 'before' && (
                <div className="pointer-events-none absolute -top-px left-2 right-2 z-10 h-0.5 rounded-full bg-[var(--accent2)]" />
              )}
              {drop === 'after' && (
                <div className="pointer-events-none absolute -bottom-px left-2 right-2 z-10 h-0.5 rounded-full bg-[var(--accent2)]" />
              )}
              <div
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-fg-muted ${
                  dragId === tracker.id ? 'opacity-40' : 'hover:bg-fill-subtle'
                }`}
              >
                <GripVertical size={14} className="shrink-0 cursor-grab active:cursor-grabbing text-fg-ghost hover:text-fg-subtle" />
                {/* The widget's own colour, so a row is identifiable even when
                    several share a name. */}
                <span className="shrink-0 h-2 w-2 rounded-full" style={{ backgroundColor: tracker.color }} />
                <span className="flex-1 truncate text-[13px]">{tracker.name || 'Untitled'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </PopoverMenu>
  );
};
