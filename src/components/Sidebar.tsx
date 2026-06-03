import React from 'react';
import { Clock, CheckSquare, Calendar, User, Settings, Timer, BarChart2, Database } from 'lucide-react';
import { motion } from 'motion/react';

interface SidebarProps {
  activeView: 'trackers' | 'todos' | 'hub' | 'calendar' | 'stats';
  onViewChange: (view: 'trackers' | 'todos' | 'hub' | 'calendar' | 'stats') => void;
  isVisible: boolean;
  isAuthenticated: boolean;
  onAccountClick: () => void;
  onSettingsClick: () => void;
  onStopwatchClick: () => void;
  isStopwatchActive: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, isVisible, isAuthenticated, onAccountClick, onSettingsClick, onStopwatchClick, isStopwatchActive }) => {
  if (!isVisible) return null;

  const items = [
    { key: 'todos' as const, icon: CheckSquare, title: 'Daily Todos', color: '--accent2' },
    { key: 'hub' as const, icon: Database, title: 'Todos Hub', color: '--accent1' },
    { key: 'trackers' as const, icon: Clock, title: 'Trackers', color: '--accent1' },
    { key: 'calendar' as const, icon: Calendar, title: 'Calendar', color: '--accent2' },
    { key: 'stats' as const, icon: BarChart2, title: 'Stats', color: '--accent1' },
  ];

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="fixed left-0 top-0 bottom-0 w-20 bg-[#111] border-r border-white/5 flex flex-col items-center justify-between py-8 z-50"
    >
      <div className="flex flex-col gap-6">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key)}
              className={`group relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                isActive
                  ? `bg-[var(${item.color})] text-black shadow-lg shadow-[var(${item.color})]/20`
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
              }`}
              title={item.title}
            >
              <Icon size={22} strokeWidth={2.5} />
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className={`absolute -left-4 w-1 h-6 bg-[var(${item.color})] rounded-r-full`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-6">
        <button
          onClick={onStopwatchClick}
          className="group relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all bg-white/5 hover:bg-white/10"
          title="Stopwatch"
        >
          <Timer
            size={22}
            strokeWidth={2.5}
            className={`transition-colors ${isStopwatchActive ? 'text-[var(--accent1)]' : 'text-white/40 group-hover:text-white'}`}
          />
        </button>
        <button
          onClick={onSettingsClick}
          className="group relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
          title="Settings"
        >
          <Settings size={22} strokeWidth={2.5} />
        </button>
        <button
          onClick={onAccountClick}
          className="group relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all bg-white/5 hover:bg-white/10"
          title={isAuthenticated ? 'Account' : 'Sign In'}
        >
          <User
            size={22}
            strokeWidth={2.5}
            className={`transition-colors ${isAuthenticated ? 'text-[var(--accent1)]' : 'text-white/40 group-hover:text-white'}`}
          />
        </button>
      </div>
    </motion.div>
  );
};
