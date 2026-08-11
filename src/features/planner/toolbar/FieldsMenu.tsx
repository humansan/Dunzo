import React, { useRef, useState } from 'react';
import { GripVertical, Eye, EyeOff, Lock, WrapText } from 'lucide-react';
import { ColDef, ColKey, NAME_COL_KEY } from '@/features/planner/types';
import { PopoverMenu } from '@/common/ui';
import { SetForAllButton } from '@/features/planner/toolbar/SetForAllButton';

// ── Fields menu ──────────────────────────────────────────────────────────────
// Dropdown listing every column. Name is pinned first and locked; the rest can
// be dragged to reorder (a drop line marks the target) and toggled hidden/shown.
// Each column also has a word-wrap toggle (including Name).
// Mirrors the sidebar's HTML5 drag-reorder, minus nesting (order only).
export const FieldsMenu: React.FC<{
  anchor: { right: number; top: number };
  order: ColKey[];
  colByKey: Map<ColKey, ColDef>;
  hidden: Set<ColKey>;
  wrapped: Set<ColKey>;
  onMove: (dragKey: ColKey, targetKey: ColKey, pos: 'before' | 'after') => void;
  onToggle: (key: ColKey) => void;
  onToggleWrap: (key: ColKey) => void;
  onSetForAll?: () => void;
  onClose: () => void;
}> = ({ anchor, order, colByKey, hidden, wrapped, onMove, onToggle, onToggleWrap, onSetForAll, onClose }) => {
  const [dragKey, setDragKey] = useState<ColKey | null>(null);
  const [dropInfo, setDropInfo] = useState<{ key: ColKey; pos: 'before' | 'after' } | null>(null);
  // Same value as `dragKey`, written synchronously in onDragStart. The state update
  // only lands on the next render, and the first dragEnter/dragOver events arrive
  // before that - reading state there would refuse the drop for the first frames of
  // every drag. `dragKey` still drives rendering (the dragged row's dim).
  const dragKeyRef = useRef<ColKey | null>(null);

  // Bound to dragEnter AND dragOver. An element only becomes a drop target once one
  // of those two is cancelled on it, and a row is several nested elements (grip,
  // label, the two buttons) - so entering any of them with only dragOver handled
  // leaves a frame where the drop is refused and the cursor flips to circle-slash.
  const onRowDragOver = (e: React.DragEvent, key: ColKey) => {
    if (!dragKeyRef.current || key === NAME_COL_KEY) { if (dropInfo) setDropInfo(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const pos: 'before' | 'after' = (e.clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after';
    setDropInfo((prev) => (prev?.key === key && prev.pos === pos ? prev : { key, pos }));
  };
  const endDrag = () => {
    dragKeyRef.current = null;
    setDragKey(null);
    setDropInfo(null);
  };
  const commitDrop = () => {
    const key = dragKeyRef.current;
    if (key && dropInfo && dropInfo.key !== key) onMove(key, dropInfo.key, dropInfo.pos);
    endDrag();
  };

  // Panel-wide, so the title strip, the panel padding and the gaps between rows are
  // all still part of the drop zone - the cursor stays a drag cursor for the whole
  // sweep instead of flickering whenever the pointer leaves a row.
  const allowDrop = (e: React.DragEvent) => { if (dragKeyRef.current) e.preventDefault(); };

  return (
    <PopoverMenu
      anchor={anchor}
      title="Fields"
      onClose={onClose}
      className="w-60 p-1 space-y-2.5"
      headerAction={onSetForAll && <SetForAllButton onConfirm={onSetForAll} what="fields" />}
      onDragEnter={allowDrop}
      onDragOver={allowDrop}
      onDrop={(e) => { e.preventDefault(); commitDrop(); }}
    >
        <div className="space-y-0.5">
          {order.map((key) => {
            const col = colByKey.get(key);
            if (!col) return null;
            const isName = key === NAME_COL_KEY;
            const isHidden = hidden.has(key);
            const isWrapped = wrapped.has(key);
            const drop = dropInfo?.key === key ? dropInfo.pos : null;
            return (
              <div
                key={key}
                className="relative"
                draggable={!isName}
                onDragStart={(e) => {
                  if (isName) return;
                  dragKeyRef.current = key;
                  setDragKey(key);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', key);
                }}
                onDragEnd={endDrag}
                onDragEnter={(e) => onRowDragOver(e, key)}
                onDragOver={(e) => onRowDragOver(e, key)}
              >
                {drop === 'before' && (
                  <div className="pointer-events-none absolute -top-px left-2 right-2 z-10 h-0.5 rounded-full bg-[var(--accent2)]" />
                )}
                {drop === 'after' && (
                  <div className="pointer-events-none absolute -bottom-px left-2 right-2 z-10 h-0.5 rounded-full bg-[var(--accent2)]" />
                )}
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
                    dragKey === key ? 'opacity-40' : 'hover:bg-fill-subtle'
                  } ${isHidden ? 'text-fg-faint' : 'text-fg-muted'}`}
                >
                  {isName ? (
                    <Lock size={13} className="shrink-0 text-fg-ghost" />
                  ) : (
                    <GripVertical size={14} className="shrink-0 cursor-grab active:cursor-grabbing text-fg-ghost hover:text-fg-subtle" />
                  )}
                  <span className="flex-1 truncate text-[13px]">{col.label}</span>
                  {isName ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-ghost">Locked</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggle(key)}
                      title={isHidden ? 'Show field' : 'Hide field'}
                      className="shrink-0 p-0.5 rounded text-fg-faint hover:text-fg hover:bg-fill transition-colors cursor-pointer"
                    >
                      {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleWrap(key)}
                    title={isWrapped ? 'Disable wrap' : 'Enable wrap'}
                    className={`shrink-0 p-0.5 rounded hover:bg-fill transition-colors cursor-pointer ${
                      isWrapped ? 'text-info' : 'text-fg-faint hover:text-fg'
                    }`}
                  >
                    <WrapText size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
    </PopoverMenu>
  );
};
