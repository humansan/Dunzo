import React from 'react';
import { Clock, CheckSquare, Calendar, Timer, BarChart2, Blocks } from 'lucide-react';
import { motion } from 'motion/react';
import backgroundUrl from '../assets/background.jpg';
import logoSvg from '../assets/icon-balanced.svg';

interface SidebarProps {
  activeView: 'trackers' | 'todos' | 'hub' | 'calendar' | 'stats';
  onViewChange: (view: 'trackers' | 'todos' | 'hub' | 'calendar' | 'stats') => void;
  isVisible: boolean;
  isAuthenticated: boolean;
  onAccountClick: () => void;
  onStopwatchClick: () => void;
  isStopwatchActive: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, isVisible, isAuthenticated, onAccountClick, onStopwatchClick, isStopwatchActive }) => {
  if (!isVisible) return null;

  const items = [
    { key: 'todos' as const, icon: CheckSquare, title: 'Daily Todos', color: '--accent2' },
    { key: 'hub' as const, icon: Blocks, title: 'Task Planner', color: '--accent2' },
    { key: 'trackers' as const, icon: Clock, title: 'Trackers', color: '--accent2' },
    { key: 'calendar' as const, icon: Calendar, title: 'Calendar', color: '--accent2' },
    { key: 'stats' as const, icon: BarChart2, title: 'Stats', color: '--accent2' },
  ];

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="fixed left-0 top-0 bottom-0 w-14 bg-[#111] border-r border-white/5 flex flex-col items-center justify-between py-5 z-50"
    >
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key)}
              className={`group relative w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                isActive
                  ? `bg-[var(${item.color})] text-black shadow-lg shadow-[var(${item.color})]/20`
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
              }`}
              title={item.title}
            >
              <Icon size={18} strokeWidth={2.5} />
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className={`absolute -left-3 w-1 h-5 bg-[var(${item.color})] rounded-r-full`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onStopwatchClick}
          className="group relative w-9 h-9 rounded-xl flex items-center justify-center transition-all bg-white/5 hover:bg-white/10"
          title="Stopwatch"
        >
          <Timer
            size={18}
            strokeWidth={2.5}
            className={`transition-colors ${isStopwatchActive ? 'text-[var(--accent1)]' : 'text-white/40 group-hover:text-white'}`}
          />
        </button>
        <button
          onClick={onAccountClick}
          className="group relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden transition-all"
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
            className={`relative w-5 h-5 text-black transition-opacity ${
              isAuthenticated ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
            }`}
          />
        </button>
      </div>
    </motion.div>
  );
};
