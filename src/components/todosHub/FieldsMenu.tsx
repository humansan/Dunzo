import React, { useState } from 'react';
import { GripVertical, Eye, EyeOff, Lock } from 'lucide-react';
import { ColDef, ColKey, NAME_COL_KEY } from './types';
import { PopoverMenu } from './PopoverMenu';

// ── Fields menu ──────────────────────────────────────────────────────────────
// Dropdown listing every column. Name is pinned first and locked; the rest can
// be dragged to reorder (a drop line marks the target) and toggled hidden/shown.
// Mirrors the sidebar's HTML5 drag-reorder, minus nesting (order only).
export const FieldsMenu: React.FC<{
  anchor: { right: number; top: number };
  order: ColKey[];
  colByKey: Map<ColKey, ColDef>;
  hidden: Set<ColKey>;
  onMove: (dragKey: ColKey, targetKey: ColKey, pos: 'before' | 'after') => void;
  onToggle: (key: ColKey) => void;
  onClose: () => void;
}> = ({ anchor, order, colByKey, hidden, onMove, onToggle, onClose }) => {
  const [dragKey, setDragKey] = useState<ColKey | null>(null);
  const [dropInfo, setDropInfo] = useState<{ key: ColKey; pos: 'before' | 'after' } | null>(null);

  const onRowDragOver = (e: React.DragEvent, key: ColKey) => {
    if (!dragKey || key === NAME_COL_KEY) { if (dropInfo) setDropInfo(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const pos: 'before' | 'after' = (e.clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after';
    setDropInfo((prev) => (prev?.key === key && prev.pos === pos ? prev : { key, pos }));
  };
  const commitDrop = () => {
    if (dragKey && dropInfo && dropInfo.key !== dragKey) onMove(dragKey, dropInfo.key, dropInfo.pos);
    setDragKey(null);
    setDropInfo(null);
  };

  return (
    <PopoverMenu anchor={anchor} title="Fields" onClose={onClose} className="w-60 p-1">
        <div
          className="space-y-0.5"
          onDragOver={(e) => { if (dragKey) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); commitDrop(); }}
        >
          {order.map((key) => {
            const col = colByKey.get(key);
            if (!col) return null;
            const isName = key === NAME_COL_KEY;
            const isHidden = hidden.has(key);
            const drop = dropInfo?.key === key ? dropInfo.pos : null;
            return (
              <div
                key={key}
                className="relative"
                draggable={!isName}
                onDragStart={(e) => {
                  if (isName) return;
                  setDragKey(key);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', key);
                }}
                onDragEnd={() => { setDragKey(null); setDropInfo(null); }}
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
                    dragKey === key ? 'opacity-40' : 'hover:bg-white/[0.06]'
                  } ${isHidden ? 'text-white/40' : 'text-white/80'}`}
                >
                  {isName ? (
                    <Lock size={13} className="shrink-0 text-white/25" />
                  ) : (
                    <GripVertical size={14} className="shrink-0 cursor-grab active:cursor-grabbing text-white/25 hover:text-white/60" />
                  )}
                  <span className="flex-1 truncate text-[13px]">{col.label}</span>
                  {isName ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/25">Locked</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggle(key)}
                      title={isHidden ? 'Show field' : 'Hide field'}
                      className="shrink-0 p-0.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
    </PopoverMenu>
  );
};
