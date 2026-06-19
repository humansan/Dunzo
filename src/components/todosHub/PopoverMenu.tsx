import React from 'react';

// Shared shell for the toolbar dropdown menus (Fields / Filter / Sort / Sections):
// a click-catching backdrop plus an anchored, styled panel with an uppercase
// title. Each menu keeps its own width/padding via `className` (Tailwind padding
// utilities conflict if duplicated, so the panel sets none of its own).
const DEFAULT_HEADER =
  'px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/30';

export const PopoverMenu: React.FC<{
  anchor: { right: number; top: number };
  title: string;
  onClose: () => void;
  // Panel width + padding/spacing utilities (e.g. 'w-60 p-1').
  className?: string;
  // Override when the panel padding requires a different title inset.
  headerClassName?: string;
  children: React.ReactNode;
}> = ({ anchor, title, onClose, className = '', headerClassName = DEFAULT_HEADER, children }) => (
  <>
    <div
      className="fixed inset-0 z-[65]"
      onMouseDown={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    />
    <div
      style={{ position: 'fixed', right: anchor.right, top: anchor.top }}
      className={`z-[66] rounded-lg border border-white/10 bg-[#1f1f1f] shadow-2xl ${className}`}
    >
      <div className={headerClassName}>{title}</div>
      {children}
    </div>
  </>
);
