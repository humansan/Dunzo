import React, { useRef, useState } from 'react';
import { Clock, ListChecks, CalendarDays, Timer, BarChart2, Blocks, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { tabTarget } from '@/app/tabMemory';
import backgroundUrl from '@/assets/background.jpg';
import logoSvg from '@/assets/icon-balanced.svg';
import { AccountMenu } from '@/app/AccountMenu';
import { btnNeutral, btnToggle } from '@/theme/buttons';

interface SidebarProps {
  isVisible: boolean;
  isAuthenticated: boolean;
  email?: string;
  onOpenSettings: () => void;
  onLogout: () => void;
  onStopwatchClick: () => void;
  isStopwatchActive: boolean;
  onSearchClick: () => void;
  /** Validates a remembered planner collection id (see tabMemory). */
  isCollection: (id: string) => boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isVisible, isAuthenticated, email, onOpenSettings, onLogout, onStopwatchClick, isStopwatchActive, onSearchClick, isCollection }) => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accountBtnRef = useRef<HTMLButtonElement>(null);
  // Account menu anchored to the right of the logo button, growing upward.
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);

  const toggleAccountMenu = () => {
    if (menuPos) { setMenuPos(null); return; }
    const r = accountBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenuPos({ left: r.right + 8, bottom: window.innerHeight - r.bottom });
  };

  if (!isVisible) return null;

  // `base` drives the active highlight (and stays the plain section path); the
  // link itself points at wherever this tab was last left - the collection the
  // planner was showing, the day Today/Calendar were on. Clicking the tab you're
  // already on is a no-op: the remembered target *is* the current location.
  const items = [
    { tab: 'today', base: '/today', icon: ListChecks, title: 'Daily Todos' },
    { tab: 'planner', base: '/planner', icon: Blocks, title: 'Task Planner' },
    { tab: 'calendar', base: '/calendar', icon: CalendarDays, title: 'Calendar' },
    { tab: 'trackers', base: '/trackers', icon: Clock, title: 'Trackers' },
    { tab: 'stats', base: '/stats', icon: BarChart2, title: 'Stats' },
  ] as const;

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="fixed left-0 top-0 bottom-0 w-14 bg-surface border-r border-line-subtle flex flex-col items-center justify-between py-3 z-50"
    >
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.base);
          const target = tabTarget(item.tab, isCollection);
          return (
            <Link
              key={item.base}
              {...target}
              className={`group relative w-9 h-9 rounded-xl flex items-center justify-center ${btnToggle(isActive)}`}
              title={item.title}
            >
              <Icon size={18} strokeWidth={2.5} />
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute -left-3 w-1 h-5 bg-[var(--accent2)] rounded-r-full"
                />
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onSearchClick}
          className={`group relative w-9 h-9 rounded-xl flex items-center justify-center ${btnNeutral}`}
          title="Search tasks (⌘K)"
        >
          <Search size={18} strokeWidth={2.5} className="text-fg-faint group-hover:text-fg transition-colors" />
        </button>
        <button
          onClick={onStopwatchClick}
          className={`group relative w-9 h-9 rounded-xl flex items-center justify-center ${isStopwatchActive && "ring-3 ring-accent2"} ${btnNeutral}`}
          title="Stopwatch"
        >
          <Timer
            size={18}
            strokeWidth={2.5}
            className={`transition-colors ${isStopwatchActive ? 'text-accent2' : 'text-fg-faint group-hover:text-fg'}`}
          />
        </button>
        <button
          ref={accountBtnRef}
          onClick={toggleAccountMenu}
          className="group relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden transition-all cursor-pointer"
          title={isAuthenticated ? 'Account' : 'Sign In'}
        >
          {/* Vibrant sign-in background with the black logo on top (matches the
              sign-in screen and account subwindow). */}
          <img
            src={backgroundUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
          />
          <img
            src={logoSvg}
            alt="Account"
            className={`relative w-5.5 h-5.5 text-black transition-opacity ${
              isAuthenticated ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
            }`}
          />
        </button>
      </div>

      {menuPos && (
        <AccountMenu
          pos={menuPos}
          email={email}
          onOpenSettings={() => { setMenuPos(null); onOpenSettings(); }}
          onPremium={() => setMenuPos(null)}
          onLogout={() => { setMenuPos(null); onLogout(); }}
          onClose={() => setMenuPos(null)}
        />
      )}
    </motion.div>
  );
};
