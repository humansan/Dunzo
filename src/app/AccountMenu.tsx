import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Sparkles, LogOut } from 'lucide-react';
import { btnGhost } from '@/theme/buttons';

// Account context menu opened from the ribbon logo button (bottom of the left
// sidebar). Mirrors the app's other context menus (RowContextMenu / PopoverMenu):
// a click-catching backdrop plus a portaled panel with shared item styling.
// It anchors to the right of the button and grows upward (hence `bottom`, since
// the button sits at the very bottom of the ribbon).
const itemCls =
  `w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors  ${btnGhost()}`;

// Wraps a wave "cell" (the icon or one letter): all share the same hue-rotate
// loop, but a staggered negative delay offsets the colors so they ripple as a
// wave. Pastel base color keeps every hue soft to match the rest of the app.
const waveCell = (i: number): React.CSSProperties => ({
  color: '#f099c9',
  animation: 'premium-wave 4s linear infinite',
  animationDelay: `${i * -0.36}s`,
  display: 'inline-block',
});

// Icon (wave cell 0) + "Premium" letters (cells 1..n) so the ripple runs
// continuously from the icon through the word.
const PremiumItem: React.FC = () => (
  <>
    <span style={waveCell(0)}><Sparkles size={14} /></span>
    <span aria-label="Premium" className="font-bold">
      {'wip...'.split('').map((ch, i) => (
        <span key={i} style={waveCell(i + 1)}>{ch}</span>
      ))}
    </span>
  </>
);

export const AccountMenu: React.FC<{
  pos: { left: number; bottom: number };
  email?: string;
  onOpenSettings: () => void;
  onPremium: () => void;
  onLogout: () => void;
  onClose: () => void;
}> = ({ pos, email, onOpenSettings, onPremium, onLogout, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[65]"
        onMouseDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        style={{ position: 'fixed', left: pos.left, bottom: pos.bottom }}
        className="z-[66] min-w-[190px] rounded-lg border border-line bg-surface shadow-2xl p-1 text-sm"
      >
        <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-fg-faint truncate">
          {email ?? 'Signed in'}
        </div>
        <div className="my-1 border-t border-line" />
        <button
          onClick={onPremium}
          className="group relative w-full overflow-hidden rounded-lg px-2.5 py-1.5 text-left text-fg-muted transition-colors cursor-pointer"
        >
          {/* Hover background: the same hue-rotate wave as the label, at low
              opacity, instead of the plain white hover fill. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ backgroundColor: 'rgba(240, 153, 201, 0.12)', animation: 'premium-wave 4s linear infinite' }}
          />
          <span className="relative z-10 flex items-center gap-2.5">
            <PremiumItem />
          </span>
        </button>
        <button onClick={onOpenSettings} className={itemCls}>
          <Settings size={14} /> Settings
        </button>
        <div className="my-1 border-t border-line" />
        <button onClick={onLogout} className={itemCls}>
          <LogOut size={14} /> Log Out
        </button>
      </div>
    </>,
    document.body
  );
};