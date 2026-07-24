import React from 'react';

// Shared shell for the toolbar dropdown menus (Fields / Filter / Sort / Sections):
// a click-catching backdrop plus an anchored, styled panel with an uppercase
// title. Each menu keeps its own width/padding via `className` (Tailwind padding
// utilities conflict if duplicated, so the panel sets none of its own).
const DEFAULT_HEADER =
  'px-2 pt-1.5 text-xs font-bold text-fg';

export const PopoverMenu: React.FC<{
  anchor: { right: number; top: number };
  title: string;
  onClose: () => void;
  // Panel width + padding/spacing utilities (e.g. 'w-60 p-1').
  className?: string;
  // Override when the panel padding requires a different title inset.
  headerClassName?: string;
  // Optional right-aligned control in the header row (e.g. "Set for all"). The
  // header only becomes a flex row when this is present, so menus that pass a
  // custom headerClassName keep their exact previous layout without it.
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}> = ({ anchor, title, onClose, className = '', headerClassName = DEFAULT_HEADER, headerAction, children }) => (
  <>
    <div
      className="fixed inset-0 z-[65]"
      onMouseDown={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    />
    <div
      style={{ position: 'fixed', right: anchor.right, top: anchor.top }}
      className={`z-[66] rounded-lg border border-line bg-surface shadow-2xl ${className}`}
    >
      {headerAction ? (
        <div className={`${headerClassName} flex items-center justify-between gap-2`}>
          <span>{title}</span>
          {headerAction}
        </div>
      ) : (
        <div className={headerClassName}>{title}</div>
      )}
      {children}
    </div>
  </>
);
