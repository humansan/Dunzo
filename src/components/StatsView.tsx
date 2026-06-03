import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from 'recharts';
import { 
  subDays, 
  subMonths, 
  format, 
  parseISO, 
  addDays, 
  startOfMonth, 
  endOfMonth 
} from 'date-fns';
import { 
  BarChart2, 
  Sparkles, 
  Star, 
  ChevronDown, 
  ChevronUp,
  Tag,
  Download
} from 'lucide-react';
import { DayTodos, Todo } from '../types';
import { hasDate } from '../utils/todoFilters';
import { motion, AnimatePresence } from 'motion/react';

interface StatsViewProps {
  dayTodos: DayTodos[];
}

const GOLD = '#ffc24b';
const VIOLET = '#a78bfa';

// Category color mapper
const getCategoryColor = (tag: string) => {
  const normalized = tag.toLowerCase().trim();
  if (normalized === 'work') return 'var(--accent1)';
  if (normalized === 'personal') return 'var(--accent2)';
  
  // Custom hash for category tags
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [35, 140, 200, 260, 310, 340];
  const hue = hues[Math.abs(hash) % hues.length];
  return `hsl(${hue}, 80%, 65%)`;
};

export const StatsView: React.FC<StatsViewProps> = ({ dayTodos }) => {
  const [chartInterval, setChartInterval] = useState<'day' | 'fourDays' | 'week' | 'month'>(() => {
    const saved = localStorage.getItem('chronos-stats-interval');
    return (saved as any) || 'day';
  });

  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  const [tableMode, setTableMode] = useState<'log' | 'raw'>(() => {
    const saved = localStorage.getItem('chronos-stats-table-mode');
    return (saved as any) || 'log';
  });

  const handleSetTableMode = (mode: 'log' | 'raw') => {
    setTableMode(mode);
    localStorage.setItem('chronos-stats-table-mode', mode);
  };

  const handleSetInterval = (interval: 'day' | 'fourDays' | 'week' | 'month') => {
    setChartInterval(interval);
    localStorage.setItem('chronos-stats-interval', interval);
  };

  const toggleExpand = (dateStr: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  // 1. Build Pre-Aggregated Data Maps for Speed
  const { xpMap, completedMap, totalTasksMap, completedTodosMap, allTimeBestDay, totalXp } = useMemo(() => {
    const xpM = new Map<string, number>();
    const compM = new Map<string, number>();
    const totM = new Map<string, number>();
    const todosM = new Map<string, Todo[]>();
    
    let best = 0;
    let sumXp = 0;

    dayTodos.forEach(d => {
      if (!hasDate(d.date)) return; // skip the undated Todos Hub bucket
      let dailyXp = 0;
      let compCount = 0;
      const compList: Todo[] = [];

      (d.todos || []).forEach(t => {
        if (t) {
          if (t.completed) {
            compCount++;
            dailyXp += t.xp || 0;
            compList.push(t);
          }
        }
      });

      xpM.set(d.date, dailyXp);
      compM.set(d.date, compCount);
      totM.set(d.date, (d.todos || []).length);
      todosM.set(d.date, compList);

      sumXp += dailyXp;
      if (dailyXp > best) {
        best = dailyXp;
      }
    });

    return {
      xpMap: xpM,
      completedMap: compM,
      totalTasksMap: totM,
      completedTodosMap: todosM,
      allTimeBestDay: best,
      totalXp: sumXp
    };
  }, [dayTodos]);

  // 2. Trailing 7 Days Best
  const bestDay7d = useMemo(() => {
    const today = new Date();
    let best = 0;
    for (let i = 0; i < 7; i++) {
      const dStr = format(subDays(today, i), 'yyyy-MM-dd');
      const val = xpMap.get(dStr) || 0;
      if (val > best) best = val;
    }
    return best;
  }, [xpMap]);

  // 3. Streak Calculations (Current & Best)
  const streakInfo = useMemo(() => {
    const recordedDates = dayTodos.map(d => d.date).filter(hasDate).sort();
    if (recordedDates.length === 0) return { current: 0, best: 0 };

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    let current = 0;
    let best = 0;

    const earnedOf = (s: string) => xpMap.get(s) ?? 0;
    const completedOf = (s: string) => completedMap.get(s) ?? 0;

    const avg7Of = (parsed: Date) => {
      let sum = 0;
      for (let i = 1; i <= 7; i++) {
        sum += earnedOf(format(subDays(parsed, i), 'yyyy-MM-dd'));
      }
      return sum / 7;
    };

    const starsOf = (dStr: string) => {
      const parsed = parseISO(dStr);
      const e = earnedOf(dStr);
      const avg = avg7Of(parsed);
      const prev = earnedOf(format(subDays(parsed, 1), 'yyyy-MM-dd'));
      if (e > 0 && e >= avg && e >= prev) return 3;
      if (e > 0 && e >= avg) return 2;
      if (completedOf(dStr) >= 1) return 1;
      return 0;
    };

    let cursor = parseISO(recordedDates[0]);
    const end = parseISO(todayStr);

    while (cursor <= end) {
      const dStr = format(cursor, 'yyyy-MM-dd');
      const s = starsOf(dStr);

      if (dStr === todayStr) {
        if (s >= 3) {
          current += 1;
        }
        // live day today: < 3 stars holds, does not reset
      } else {
        if (s >= 3) {
          current += 1;
        } else if (s < 2) {
          current = 0;
        } // s === 2 holds current value
      }

      if (current > best) {
        best = current;
      }
      cursor = addDays(cursor, 1);
    }

    return { current, best };
  }, [dayTodos, xpMap, completedMap]);

  // 4. Comparative Periods (7d, 30d, 365d)
  const comparativeStats = useMemo(() => {
    const today = new Date();
    
    const getXpInRange = (startOffset: number, endOffset: number) => {
      let sum = 0;
      for (let i = startOffset; i <= endOffset; i++) {
        const dStr = format(subDays(today, i), 'yyyy-MM-dd');
        sum += xpMap.get(dStr) || 0;
      }
      return sum;
    };

    const xp7 = getXpInRange(0, 6);
    const prevXp7 = getXpInRange(7, 13);
    const isUp7 = xp7 >= prevXp7;

    const xp30 = getXpInRange(0, 29);
    const prevXp30 = getXpInRange(30, 59);
    const isUp30 = xp30 >= prevXp30;

    const xp365 = getXpInRange(0, 364);
    const prevXp365 = getXpInRange(365, 729);
    const isUp365 = xp365 >= prevXp365;

    return {
      xp7, isUp7, prevXp7,
      xp30, isUp30, prevXp30,
      xp365, isUp365, prevXp365
    };
  }, [xpMap]);

  // 5. Chart Data Prep
  const chartData = useMemo(() => {
    const today = new Date();
    const list = [];

    switch (chartInterval) {
      case 'day': {
        // Last 30 days
        for (let i = 29; i >= 0; i--) {
          const d = subDays(today, i);
          const dStr = format(d, 'yyyy-MM-dd');
          list.push({
            name: format(d, 'MMM d'),
            xp: xpMap.get(dStr) || 0,
            fullDate: format(d, 'EEEE, MMMM d, yyyy'),
            tasks: completedMap.get(dStr) || 0
          });
        }
        break;
      }
      case 'fourDays': {
        // Last 30 chunks of 4 days (120 days total)
        for (let i = 29; i >= 0; i--) {
          let sumXp = 0;
          let sumTasks = 0;
          const endDay = subDays(today, i * 4);
          const startDay = subDays(today, i * 4 + 3);
          
          for (let offset = 0; offset < 4; offset++) {
            const dStr = format(subDays(endDay, offset), 'yyyy-MM-dd');
            sumXp += xpMap.get(dStr) || 0;
            sumTasks += completedMap.get(dStr) || 0;
          }
          
          list.push({
            name: `${format(startDay, 'M/d')}-${format(endDay, 'M/d')}`,
            xp: sumXp,
            fullDate: `${format(startDay, 'MMM d')} - ${format(endDay, 'MMM d, yyyy')}`,
            tasks: sumTasks
          });
        }
        break;
      }
      case 'week': {
        // Last 26 weeks (sliding 7 days)
        for (let i = 25; i >= 0; i--) {
          let sumXp = 0;
          let sumTasks = 0;
          const endDay = subDays(today, i * 7);
          const startDay = subDays(today, i * 7 + 6);

          for (let offset = 0; offset < 7; offset++) {
            const dStr = format(subDays(endDay, offset), 'yyyy-MM-dd');
            sumXp += xpMap.get(dStr) || 0;
            sumTasks += completedMap.get(dStr) || 0;
          }

          list.push({
            name: `${format(startDay, 'M/d')}-${format(endDay, 'M/d')}`,
            xp: sumXp,
            fullDate: `${format(startDay, 'MMM d')} - ${format(endDay, 'MMM d, yyyy')}`,
            tasks: sumTasks
          });
        }
        break;
      }
      case 'month': {
        // Last 24 calendar months
        for (let i = 23; i >= 0; i--) {
          const monthDate = subMonths(today, i);
          const start = startOfMonth(monthDate);
          const end = endOfMonth(monthDate);

          let sumXp = 0;
          let sumTasks = 0;

          let cursor = new Date(start);
          while (cursor <= end) {
            const dStr = format(cursor, 'yyyy-MM-dd');
            sumXp += xpMap.get(dStr) || 0;
            sumTasks += completedMap.get(dStr) || 0;
            cursor = addDays(cursor, 1);
          }

          list.push({
            name: format(monthDate, 'MMM yy'),
            xp: sumXp,
            fullDate: format(monthDate, 'MMMM yyyy'),
            tasks: sumTasks
          });
        }
        break;
      }
    }
    return list;
  }, [chartInterval, xpMap, completedMap]);

  // 6. Category Calculations
  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    let totalCatXp = 0;

    dayTodos.forEach(d => {
      if (!hasDate(d.date)) return; // skip the undated Todos Hub bucket
      (d.todos || []).forEach(t => {
        if (t && t.completed && t.xp) {
          const tags = t.tags && t.tags.length > 0 ? t.tags : ['Untagged'];
          tags.forEach(tag => {
            cats[tag] = (cats[tag] || 0) + t.xp!;
            totalCatXp += t.xp!;
          });
        }
      });
    });

    return Object.entries(cats)
      .map(([name, xp]) => ({
        name,
        xp,
        percentage: totalCatXp > 0 ? Math.round((xp / totalCatXp) * 100) : 0,
        color: getCategoryColor(name)
      }))
      .sort((a, b) => b.xp - a.xp);
  }, [dayTodos]);

  // 7. Active log dates (days with completed tasks > 0)
  const activeDates = useMemo(() => {
    return Array.from(xpMap.keys())
      .filter(dStr => (completedMap.get(dStr) || 0) > 0)
      .sort((a, b) => b.localeCompare(a));
  }, [xpMap, completedMap]);

  // 8. Raw rows: every completed todo that has an XP value
  const rawRows = useMemo(() => {
    const rows: { date: string; text: string; xp: number; tags: string[]; notes: string }[] = [];
    dayTodos.forEach(d => {
      if (!hasDate(d.date)) return; // skip the undated Todos Hub bucket
      (d.todos || []).forEach(t => {
        if (t && t.completed && typeof t.xp === 'number') {
          rows.push({
            date: d.date,
            text: t.text,
            xp: t.xp,
            tags: t.tags || [],
            notes: t.notes || ''
          });
        }
      });
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [dayTodos]);

  // Most recent 50 for display (full set is available via CSV export)
  const displayedRawRows = useMemo(() => rawRows.slice(-50), [rawRows]);

  // Export every completed XP task as a CSV download
  const handleExportCsv = () => {
    const escape = (val: string) => {
      const s = String(val ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = ['Date', 'Text', 'XP', 'Tags', 'Notes'];
    const lines = [
      header.join(','),
      ...rawRows.map(row =>
        [
          format(parseISO(row.date), 'yyyy-MM-dd'),
          escape(row.text),
          row.xp,
          escape(row.tags.join('; ')),
          escape(row.notes)
        ].join(',')
      )
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chronos-xp-tasks-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Table Star renderer
  const renderStars = (dateStr: string) => {
    const earnedOf = (s: string) => xpMap.get(s) ?? 0;
    const completedOf = (s: string) => completedMap.get(s) ?? 0;

    const avg7Of = (parsed: Date) => {
      let sum = 0;
      for (let i = 1; i <= 7; i++) {
        sum += earnedOf(format(subDays(parsed, i), 'yyyy-MM-dd'));
      }
      return sum / 7;
    };

    const starsOf = (dStr: string) => {
      const parsed = parseISO(dStr);
      const e = earnedOf(dStr);
      const avg = avg7Of(parsed);
      const prev = earnedOf(format(subDays(parsed, 1), 'yyyy-MM-dd'));
      if (e > 0 && e >= avg && e >= prev) return 3;
      if (e > 0 && e >= avg) return 2;
      if (completedOf(dStr) >= 1) return 1;
      return 0;
    };

    const count = starsOf(dateStr);
    return (
      <div className="flex gap-0.5 text-white/20">
        {[0, 1, 2].map(i => (
          <Star 
            key={i} 
            size={14} 
            strokeWidth={2}
            fill={i < count ? GOLD : 'transparent'} 
            style={{ 
              color: i < count ? GOLD : 'rgba(255,255,255,0.15)',
              filter: i < count ? `drop-shadow(0 0 3px ${GOLD}66)` : 'none' 
            }} 
          />
        ))}
      </div>
    );
  };

  // Recharts Custom Tooltip Component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#1C1C1E]/95 border border-white/10 backdrop-blur-md rounded-xl p-3 text-xs shadow-2xl text-left select-none pointer-events-none">
          <p className="font-bold text-white mb-1.5 font-sans">{data.fullDate}</p>
          <div className="flex flex-col gap-1 font-mono text-white/70">
            <p>
              Earned: <span className="font-bold text-[var(--accent1)]">{data.xp} XP</span>
            </p>
            <p>
              Completed: <span className="font-bold text-white">{data.tasks} tasks</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="py-8 max-w-5xl mx-auto px-4 select-none">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent1)] text-black shadow-lg shadow-[var(--accent1)]/10">
          <BarChart2 size={22} strokeWidth={2.5} />
        </div>
        <h1 className="text-xl font-bold tracking-tight leading-none text-white">
          Stats & Analytics
        </h1>
      </div>

      {/* Centered Streak & Records Block */}
      <div className="w-full flex justify-center mb-10">
        <div className="flex flex-col sm:flex-row items-center gap-8 text-center sm:text-left">
          {/* Filled Circle badge */}
          <div 
            className="w-24 h-24 rounded-full flex items-center justify-center shrink-0 text-black text-4xl font-extrabold font-mono"
            style={{ 
              backgroundColor: GOLD, 
              boxShadow: `0 0 25px ${GOLD}50`,
            }}
          >
            {streakInfo.current}
          </div>
          
          {/* Records Text Block */}
          <div className="flex flex-col text-left font-sans">
            <div className="text-white/80 text-sm tracking-wide">
              Best Streak:{' '}
              <span className="font-bold text-lg font-mono" style={{ color: GOLD }}>
                {streakInfo.best} d
              </span>{' '}
            </div>
            <div className="text-white/80 text-sm tracking-wide">
              Best Day:{' '}
              <span className="font-bold text-lg font-mono" style={{ color: 'var(--accent1)' }}>
                {allTimeBestDay} xp 
              </span>{' '}
              (best last 7d:{' '}
              <span className="font-bold text-lg font-mono" style={{ color: 'var(--accent1)' }}>
                {bestDay7d} xp
              </span>
              )
            </div>
            <div className="text-white/80 text-sm tracking-wide">
              Total XP Achieved:{' '}
              <span className="font-bold text-lg font-mono" style={{ color: VIOLET }}>
                {totalXp} xp
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Comparative Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* 7d Card */}
        <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 shadow-xl flex flex-col justify-between">
          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Last 7 Days</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className={`text-xl font-bold ${comparativeStats.isUp7 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {comparativeStats.isUp7 ? '⏶' : '⏷'}
            </span>
            <span className="text-3xl font-bold tracking-tight text-white">
              {comparativeStats.xp7}
            </span>
            <span className="text-xs font-medium text-white/30 font-mono ml-0.5">XP</span>
          </div>
          <span className="text-xs text-white/60 font-medium mt-2">
            vs. {comparativeStats.prevXp7} XP in previous 7d
          </span>
        </div>

        {/* 30d Card */}
        <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 shadow-xl flex flex-col justify-between">
          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Last 30 Days</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className={`text-xl font-bold ${comparativeStats.isUp30 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {comparativeStats.isUp30 ? '⏶' : '⏷'}
            </span>
            <span className="text-3xl font-bold tracking-tight text-white">
              {comparativeStats.xp30}
            </span>
            <span className="text-xs font-medium text-white/30 font-mono ml-0.5">XP</span>
          </div>
          <span className="text-xs text-white/60 font-medium mt-2">
            vs. {comparativeStats.prevXp30} XP in previous 30d
          </span>
        </div>

        {/* 365d Card */}
        <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 shadow-xl flex flex-col justify-between">
          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Last 365 Days</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className={`text-xl font-bold ${comparativeStats.isUp365 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {comparativeStats.isUp365 ? '⏶' : '⏷'}
            </span>
            <span className="text-3xl font-bold tracking-tight text-white">
              {comparativeStats.xp365}
            </span>
            <span className="text-xs font-medium text-white/30 font-mono ml-0.5">XP</span>
          </div>
          <span className="text-xs text-white/60 font-medium mt-2">
            vs. {comparativeStats.prevXp365} XP in previous 365d
          </span>
        </div>
      </div>

      {/* Trend Bar Chart */}
      <div className="mb-10 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-bold text-sm tracking-wide">XP History Trend</h3>

          {/* Interval Toggles */}
          <div className="flex bg-neutral-900 rounded-lg p-1 text-xs">
            {(['day', 'fourDays', 'week', 'month'] as const).map(key => (
              <button
                key={key}
                onClick={() => handleSetInterval(key)}
                className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-all ${
                  chartInterval === key
                    ? 'bg-[var(--accent1)] text-black shadow'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                {key === 'day' ? 'Day' : key === 'fourDays' ? '4 Days' : key === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </div>

        <div className="h-96 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                stroke="rgba(255,255,255,0.3)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                fontFamily="Space Grotesk, monospace"
                dy={10}
                interval={chartInterval === 'month' ? 1 : 'preserveStartEnd'}
              />
              <YAxis
                stroke="rgba(255,255,255,0.3)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                fontFamily="Space Grotesk, monospace"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              <Bar dataKey="xp" fill="var(--accent1)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Categories Distribution */}
      <div className="mb-8 flex flex-col">
        <h3 className="text-white font-bold text-sm tracking-wide mb-4">Category Breakdown</h3>
        {categoryData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center opacity-30 py-12">
            <Tag size={32} className="mb-2" />
            <p className="text-xs">No tags found on completed tasks</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Labels (only when the partition is wide enough) */}
            <div className="flex w-full mb-1.5">
              {categoryData.map(cat => (
                <div
                  key={cat.name}
                  style={{ width: `${cat.percentage}%` }}
                  className="px-1 text-center overflow-hidden"
                >
                  {cat.percentage >= 8 && (
                    <span className="block truncate text-xs font-medium text-white/70">
                      {cat.name}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Partitioned bar */}
            <div className="flex w-full h-16">
              {categoryData.map(cat => (
                <div
                  key={cat.name}
                  style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                  className="group relative h-full transition-opacity hover:opacity-90"
                >
                  {/* Hover tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 whitespace-nowrap bg-[#1C1C1E]/95 border border-white/10 backdrop-blur-md rounded-xl p-3 text-xs shadow-2xl text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="font-bold text-white font-sans">{cat.name}</span>
                    </div>
                    <p className="font-mono text-white/70">
                      <span className="font-bold text-[var(--accent1)]">{cat.xp} XP</span> ({cat.percentage}%)
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Log Table Section */}
      <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 shadow-xl flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-bold text-sm tracking-wide">
            {tableMode === 'log' ? 'Daily Activity Log' : 'Raw Entries'}
          </h3>

          {/* Table Mode Toggle */}
          <div className="flex bg-neutral-900 rounded-lg p-1 text-xs">
            {(['log', 'raw'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleSetTableMode(mode)}
                className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-all ${
                  tableMode === mode
                    ? 'bg-[var(--accent1)] text-black shadow'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                {mode === 'log' ? 'Log' : 'Raw'}
              </button>
            ))}
          </div>
        </div>

        {tableMode === 'raw' ? (
          rawRows.length === 0 ? (
            <div className="py-16 text-center opacity-30 text-sm">
              No completed tasks with an XP value yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40 whitespace-nowrap">Date</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40 whitespace-nowrap">Text</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40 whitespace-nowrap">Points</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40 whitespace-nowrap">Group</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40 whitespace-nowrap">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRawRows.map((row, i) => (
                    <tr key={i} className="border-b border-white/5 odd:bg-white/[0.015]">
                      <td className="py-2.5 px-4 font-mono text-white/60 whitespace-nowrap">
                        {format(parseISO(row.date), 'M/d/yyyy')}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-white/90 whitespace-nowrap">
                        {row.text}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-[var(--accent1)] whitespace-nowrap">
                        {row.xp}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {row.tags.length === 0 ? (
                          <span className="text-white/20 italic text-xs">—</span>
                        ) : (
                          <span className="font-medium" style={{ color: getCategoryColor(row.tags[0]) }}>
                            {row.tags.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-white/50">
                        <div className="max-w-[360px] truncate">{row.notes}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-white/5">
                <span className="text-xs text-white/30">
                  {rawRows.length > 50
                    ? `Showing 50 most recent of ${rawRows.length} entries — export for all`
                    : `${rawRows.length} ${rawRows.length === 1 ? 'entry' : 'entries'}`}
                </span>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors cursor-pointer shrink-0"
                >
                  <Download size={14} />
                  Export CSV
                </button>
              </div>
            </div>
          )
        ) : activeDates.length === 0 ? (
          <div className="py-16 text-center opacity-30 text-sm">
            No activity history yet. Complete tasks in "Daily Todos" to populate this log.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40">Date</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40">XP Earned</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40">Completed</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40">Categories</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-white/40">Stars</th>
                  <th className="py-3 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {activeDates.map(dateStr => {
                  const dayTasks = completedTodosMap.get(dateStr) || [];
                  const totalCount = totalTasksMap.get(dateStr) || 0;
                  const isExpanded = !!expandedDates[dateStr];
                  
                  // Gather unique categories for this day
                  const tagsSet = new Set<string>();
                  dayTasks.forEach(t => {
                    if (t.tags && t.tags.length > 0) {
                      t.tags.forEach(tag => tagsSet.add(tag));
                    }
                  });
                  const dayTags = Array.from(tagsSet);

                  return (
                    <React.Fragment key={dateStr}>
                      <tr 
                        onClick={() => toggleExpand(dateStr)}
                        className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors select-none"
                      >
                        <td className="py-3.5 px-4 text-sm font-semibold text-white/80">
                          {format(parseISO(dateStr), 'EEE, MMM d')}
                        </td>
                        <td className="py-3.5 px-4 text-sm font-bold font-mono text-[var(--accent1)]">
                          {xpMap.get(dateStr) || 0} <span className="text-[10px] text-white/30 font-medium">XP</span>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-white/60">
                          {dayTasks.length} / {totalCount} tasks
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {dayTags.length === 0 ? (
                              <span className="text-[10px] text-white/20 italic">None</span>
                            ) : (
                              dayTags.slice(0, 3).map(tag => (
                                <span 
                                  key={tag} 
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 border text-white/60 transition-colors"
                                  style={{ borderColor: `${getCategoryColor(tag)}30`, color: getCategoryColor(tag) }}
                                >
                                  {tag}
                                </span>
                              ))
                            )}
                            {dayTags.length > 3 && (
                              <span className="text-[9px] font-bold text-white/30 px-1 py-0.5">
                                +{dayTags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {renderStars(dateStr)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isExpanded ? (
                            <ChevronUp size={16} className="text-white/40" />
                          ) : (
                            <ChevronDown size={16} className="text-white/40" />
                          )}
                        </td>
                      </tr>

                      {/* Expandable tasks list */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <tr key={`${dateStr}-details`}>
                            <td colSpan={6} className="bg-white/[0.01] border-b border-white/5 p-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                className="px-6 py-4 flex flex-col gap-3 overflow-hidden"
                              >
                                <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">
                                  Completed Tasks Details
                                </span>
                                <div className="flex flex-col gap-2 max-w-3xl">
                                  {dayTasks.map(todo => (
                                    <div 
                                      key={todo.id} 
                                      className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-emerald-400 shrink-0 text-xs">✔</span>
                                        <span className="text-sm text-white/80 font-medium truncate">{todo.text}</span>
                                        {todo.tags && todo.tags.length > 0 && (
                                          <div className="flex gap-1 shrink-0">
                                            {todo.tags.map(tag => (
                                              <span 
                                                key={tag} 
                                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                                style={{ 
                                                  backgroundColor: `${getCategoryColor(tag)}15`,
                                                  color: getCategoryColor(tag) 
                                                }}
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 text-[11px] font-mono font-medium text-[#ffba44] bg-[#ffba44]/5 px-2 py-0.5 rounded shrink-0 border border-[#ffba44]/10">
                                        <Sparkles size={11} />
                                        <span>{todo.xp || 0} XP</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
