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
import { DayTodos, Todo } from '@shared/types';
import { hasDate, showsOnDailyChecklist, todoIndex, collectionOf, collectionPath } from '@/features/tasks/model';
import { isDone } from '@/features/tasks/model';
import { buildXpHistory, starsFor } from '@/features/xp';
import { motion, AnimatePresence } from 'motion/react';
import { pillBg, pillBorder } from '@/theme/pill';
import { collectionColor } from '@/theme/collectionColor';
import { useThemeColor } from '@/theme/useThemeColor';

interface StatsViewProps {
  dayTodos: DayTodos[];
}

// A collection along a task's path, as the stats surfaces consume it.
interface CollChip { id: string; name: string; color: string }
const UNCATEGORIZED: CollChip = { id: '__uncategorized__', name: 'Uncategorized', color: 'var(--color-fg-muted)' };

export const StatsView: React.FC<StatsViewProps> = ({ dayTodos }) => {
  // XP stars/streak keep their fixed signature colors (gold/purple) across themes; the
  // chart grid/axis follow the theme (resolved to concrete colors for recharts SVG).
  const GOLD = useThemeColor('xp-tier1');
  const CORAL = useThemeColor('xp-bar');
  const VIOLET = useThemeColor('xp-tier2');
  const FG = useThemeColor('fg');
  const AXIS = useThemeColor('fg-muted');
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

  // Resolve a task's collection path (root → leaf). Stats group tasks by the
  // collections they belong to, replacing the old free-text tags.
  const byId = useMemo(() => todoIndex(dayTodos), [dayTodos]);
  const collsForTodo = (t: Todo): CollChip[] =>
    collectionPath(collectionOf(t, byId), byId).map((c) => ({
      id: c.id,
      name: c.text || 'Untitled',
      color: collectionColor(c.color),
    }));

  // 1. Build Pre-Aggregated Data Maps for Speed
  const { history, xpMap, completedMap, totalTasksMap, completedTodosMap, allTimeBestDay, totalXp } = useMemo(() => {
    // Shared with the stars/streak below - only daily-checklist todos count.
    const hist = buildXpHistory(dayTodos);
    const xpM = hist.earnedByDate;
    const compM = hist.completedCountByDate;
    const totM = hist.totalTasksByDate;
    const todosM = hist.completedTodosByDate;

    let best = 0;
    let sumXp = 0;
    for (const dailyXp of xpM.values()) {
      sumXp += dailyXp;
      if (dailyXp > best) best = dailyXp;
    }

    return {
      history: hist,
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

    let cursor = parseISO(recordedDates[0]);
    const end = parseISO(todayStr);

    while (cursor <= end) {
      const dStr = format(cursor, 'yyyy-MM-dd');
      const s = starsFor(history, dStr).stars;

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
  }, [dayTodos, history]);

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
    const list: { name: string; xp: number; fullDate: string; tasks: number }[] = [];

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

  // 6. Collection Calculations - each completed task's XP rolls up to every
  // collection along its path (so ancestors accumulate their descendants' XP);
  // tasks with no collection fall under "Uncategorized".
  const categoryData = useMemo(() => {
    const cats: Record<string, { name: string; color: string; xp: number }> = {};
    let totalCatXp = 0;

    dayTodos.forEach(d => {
      if (!hasDate(d.date)) return; // skip the undated Task Planner bucket
      (d.todos || []).forEach(t => {
        if (t && showsOnDailyChecklist(t, d.date) && isDone(t) && t.xp) {
          const path = collsForTodo(t);
          const buckets = path.length > 0 ? path : [UNCATEGORIZED];
          buckets.forEach(c => {
            const cur = cats[c.id] || { name: c.name, color: c.color, xp: 0 };
            cur.xp += t.xp!;
            cats[c.id] = cur;
            totalCatXp += t.xp!;
          });
        }
      });
    });

    return Object.values(cats)
      .map(({ name, color, xp }) => ({
        name,
        xp,
        percentage: totalCatXp > 0 ? Math.round((xp / totalCatXp) * 100) : 0,
        color,
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
    const rows: { date: string; text: string; xp: number; colls: CollChip[]; notes: string }[] = [];
    dayTodos.forEach(d => {
      if (!hasDate(d.date)) return; // skip the undated Task Planner bucket
      (d.todos || []).forEach(t => {
        if (t && showsOnDailyChecklist(t, d.date) && isDone(t) && typeof t.xp === 'number') {
          rows.push({
            date: d.date,
            text: t.text,
            xp: t.xp,
            colls: collsForTodo(t),
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

    const header = ['Date', 'Text', 'XP', 'Collection', 'Notes'];
    const lines = [
      header.join(','),
      ...rawRows.map(row =>
        [
          format(parseISO(row.date), 'yyyy-MM-dd'),
          escape(row.text),
          row.xp,
          escape(row.colls.map(c => c.name).join(' › ')),
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

  // Table Star renderer. The goals are independent, so each slot shows its own
  // goal rather than filling left-to-right from a count.
  const renderStars = (dateStr: string) => {
    const { flags } = starsFor(history, dateStr);
    const slots: [boolean, string][] = [
      [flags.completedTask, 'Completed a task'],
      [flags.beatYesterday, "Matched or beat yesterday's XP"],
      [flags.beatAverage, 'Matched or beat the 7/30-day average XP']
    ];
    return (
      <div className="flex gap-0.5 text-fg-ghost">
        {slots.map(([active, label], i) => (
          <Star
            key={i}
            size={14}
            strokeWidth={2}
            aria-label={label}
            fill={active ? GOLD : 'transparent'}
            style={{
              color: active ? GOLD : `color-mix(in srgb, ${FG} 15%, transparent)`,
              filter: active ? `drop-shadow(0 0 3px color-mix(in srgb, ${GOLD} 40%, transparent))` : 'none'
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
        <div className="bg-surface/95 border border-line backdrop-blur-md rounded-xl p-3 text-xs shadow-2xl text-left select-none pointer-events-none">
          <p className="font-bold text-fg mb-1.5 font-sans">{data.fullDate}</p>
          <div className="flex flex-col gap-1 font-mono text-fg-muted">
            <p>
              Earned: <span className="font-bold text-[var(--accent1)]">{data.xp} XP</span>
            </p>
            <p>
              Completed: <span className="font-bold text-fg">{data.tasks} tasks</span>
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
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--accent1)] text-canvas shadow-lg shadow-[var(--accent1)]/10">
          <BarChart2 size={22} strokeWidth={2.5} />
        </div>
        <h1 className="text-xl font-bold tracking-tight leading-none text-fg">
          Stats & Analytics
        </h1>
      </div>

      {/* Centered Streak & Records Block */}
      <div className="w-full flex justify-center mb-10">
        <div className="flex flex-col sm:flex-row items-center gap-8 text-center sm:text-left">
          {/* Filled Circle badge */}
          <div 
            className="min-w-24 h-24 pl-9 pr-5 rounded-full flex items-center justify-center shrink-0 text-black text-4xl font-extrabold font-mono tracking-tighter"
            style={{
              backgroundColor: GOLD,
              boxShadow: `0 0 25px color-mix(in srgb, ${GOLD} 31%, transparent)`,
            }}
          >
            {streakInfo.current}🔥
          </div>
          
          {/* Records Text Block */}
          <div className="flex flex-col text-left font-sans">
            <div className="text-fg-muted text-sm tracking-wide">
              Best Streak:{' '}
              <span className="font-bold text-lg font-mono" style={{ color: CORAL }}>
                {streakInfo.best} d
              </span>{' '}
            </div>
            <div className="text-fg-muted text-sm tracking-wide">
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
            <div className="text-fg-muted text-sm tracking-wide">
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
        <div className="bg-surface p-5 rounded-2xl border border-line-subtle shadow-xl flex flex-col justify-between">
          <span className="text-fg-faint text-xs font-bold uppercase tracking-wider">Last 7 Days</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className={`text-xl font-bold ${comparativeStats.isUp7 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {comparativeStats.isUp7 ? '⏶' : '⏷'}
            </span>
            <span className="text-3xl font-bold tracking-tight text-fg">
              {comparativeStats.xp7}
            </span>
            <span className="text-xs font-medium text-fg-ghost font-mono ml-0.5">XP</span>
          </div>
          <span className="text-xs text-fg-subtle font-medium mt-2">
            vs. {comparativeStats.prevXp7} XP in previous 7d
          </span>
        </div>

        {/* 30d Card */}
        <div className="bg-surface p-5 rounded-2xl border border-line-subtle shadow-xl flex flex-col justify-between">
          <span className="text-fg-faint text-xs font-bold uppercase tracking-wider">Last 30 Days</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className={`text-xl font-bold ${comparativeStats.isUp30 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {comparativeStats.isUp30 ? '⏶' : '⏷'}
            </span>
            <span className="text-3xl font-bold tracking-tight text-fg">
              {comparativeStats.xp30}
            </span>
            <span className="text-xs font-medium text-fg-ghost font-mono ml-0.5">XP</span>
          </div>
          <span className="text-xs text-fg-subtle font-medium mt-2">
            vs. {comparativeStats.prevXp30} XP in previous 30d
          </span>
        </div>

        {/* 365d Card */}
        <div className="bg-surface p-5 rounded-2xl border border-line-subtle shadow-xl flex flex-col justify-between">
          <span className="text-fg-faint text-xs font-bold uppercase tracking-wider">Last 365 Days</span>
          <div className="flex items-baseline gap-1.5 mt-3">
            <span className={`text-xl font-bold ${comparativeStats.isUp365 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {comparativeStats.isUp365 ? '⏶' : '⏷'}
            </span>
            <span className="text-3xl font-bold tracking-tight text-fg">
              {comparativeStats.xp365}
            </span>
            <span className="text-xs font-medium text-fg-ghost font-mono ml-0.5">XP</span>
          </div>
          <span className="text-xs text-fg-subtle font-medium mt-2">
            vs. {comparativeStats.prevXp365} XP in previous 365d
          </span>
        </div>
      </div>

      {/* Trend Bar Chart */}
      <div className="mb-10 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-fg font-bold text-sm tracking-wide">XP History Trend</h3>

          {/* Interval Toggles */}
          <div className="flex bg-surface rounded-lg p-1 text-xs">
            {(['day', 'fourDays', 'week', 'month'] as const).map(key => (
              <button
                key={key}
                onClick={() => handleSetInterval(key)}
                className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-all ${
                  chartInterval === key
                    ? 'bg-[var(--accent1)] text-canvas shadow'
                    : 'text-fg-faint hover:text-fg'
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
              <CartesianGrid stroke={FG} strokeOpacity={0.06} vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                stroke={AXIS}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                fontFamily="Space Grotesk, monospace"
                dy={10}
                interval={chartInterval === 'month' ? 1 : 'preserveStartEnd'}
              />
              <YAxis
                stroke={AXIS}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                fontFamily="Space Grotesk, monospace"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: FG, fillOpacity: 0.05 }} />
              <Bar dataKey="xp" fill="var(--accent1)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Categories Distribution */}
      <div className="mb-8 flex flex-col">
        <h3 className="text-fg font-bold text-sm tracking-wide mb-4">Collection Breakdown</h3>
        {categoryData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center opacity-30 py-12">
            <Tag size={32} className="mb-2" />
            <p className="text-xs">No completed tasks with XP yet</p>
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
                    <span className="block truncate text-xs font-medium text-fg-muted">
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
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 whitespace-nowrap bg-surface/95 border border-line backdrop-blur-md rounded-xl p-3 text-xs shadow-2xl text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="font-bold text-fg font-sans">{cat.name}</span>
                    </div>
                    <p className="font-mono text-fg-muted">
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
      <div className="bg-surface p-5 rounded-2xl border border-line-subtle shadow-xl flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-fg font-bold text-sm tracking-wide">
            {tableMode === 'log' ? 'Daily Activity Log' : 'Raw Entries'}
          </h3>

          {/* Table Mode Toggle */}
          <div className="flex bg-surface rounded-lg p-1 text-xs">
            {(['log', 'raw'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleSetTableMode(mode)}
                className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer transition-all ${
                  tableMode === mode
                    ? 'bg-[var(--accent1)] text-canvas shadow'
                    : 'text-fg-faint hover:text-fg'
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
                  <tr className="border-b border-line">
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint whitespace-nowrap">Date</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint whitespace-nowrap">Text</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint whitespace-nowrap">Points</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint whitespace-nowrap">Collection</th>
                    <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint whitespace-nowrap">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRawRows.map((row, i) => (
                    <tr key={i} className="border-b border-line-subtle odd:bg-fill-subtle">
                      <td className="py-2.5 px-4 font-mono text-fg-subtle whitespace-nowrap">
                        {format(parseISO(row.date), 'M/d/yyyy')}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-fg whitespace-nowrap">
                        {row.text}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-[var(--accent1)] whitespace-nowrap">
                        {row.xp}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {row.colls.length === 0 ? (
                          <span className="text-fg-ghost italic text-xs">-</span>
                        ) : (
                          <span className="font-medium" style={{ color: row.colls[row.colls.length - 1].color }}>
                            {row.colls.map(c => c.name).join(' › ')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-fg-subtle">
                        <div className="max-w-[360px] truncate">{row.notes}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-line-subtle">
                <span className="text-xs text-fg-ghost">
                  {rawRows.length > 50
                    ? `Showing 50 most recent of ${rawRows.length} entries - export for all`
                    : `${rawRows.length} ${rawRows.length === 1 ? 'entry' : 'entries'}`}
                </span>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-fill-subtle hover:bg-fill text-fg-muted hover:text-fg border border-line transition-colors cursor-pointer shrink-0"
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
                <tr className="border-b border-line-subtle">
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint">Date</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint">XP Earned</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint">Completed</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint">Categories</th>
                  <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-fg-faint">Stars</th>
                  <th className="py-3 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {activeDates.map(dateStr => {
                  const dayTasks = completedTodosMap.get(dateStr) || [];
                  const totalCount = totalTasksMap.get(dateStr) || 0;
                  const isExpanded = !!expandedDates[dateStr];
                  
                  // Gather the unique collections touched by this day's tasks
                  // (deduped by id across each task's full path).
                  const dayCollMap = new Map<string, CollChip>();
                  dayTasks.forEach(t => {
                    collsForTodo(t).forEach(c => dayCollMap.set(c.id, c));
                  });
                  const dayColls = Array.from(dayCollMap.values());

                  return (
                    <React.Fragment key={dateStr}>
                      <tr 
                        onClick={() => toggleExpand(dateStr)}
                        className="border-b border-line-subtle hover:bg-fill-subtle cursor-pointer transition-colors select-none"
                      >
                        <td className="py-3.5 px-4 text-sm font-semibold text-fg-muted">
                          {format(parseISO(dateStr), 'EEE, MMM d')}
                        </td>
                        <td className="py-3.5 px-4 text-sm font-bold font-mono text-[var(--accent1)]">
                          {xpMap.get(dateStr) || 0} <span className="text-[10px] text-fg-ghost font-medium">XP</span>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-fg-subtle">
                          {dayTasks.length} / {totalCount} tasks
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {dayColls.length === 0 ? (
                              <span className="text-[10px] text-fg-ghost italic">None</span>
                            ) : (
                              dayColls.slice(0, 3).map(c => (
                                <span
                                  key={c.id}
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-fill-subtle border text-fg-subtle transition-colors"
                                  style={{ borderColor: pillBorder(c.color), color: c.color }}
                                >
                                  {c.name}
                                </span>
                              ))
                            )}
                            {dayColls.length > 3 && (
                              <span className="text-[9px] font-bold text-fg-ghost px-1 py-0.5">
                                +{dayColls.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {renderStars(dateStr)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isExpanded ? (
                            <ChevronUp size={16} className="text-fg-faint" />
                          ) : (
                            <ChevronDown size={16} className="text-fg-faint" />
                          )}
                        </td>
                      </tr>

                      {/* Expandable tasks list */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <tr key={`${dateStr}-details`}>
                            <td colSpan={6} className="bg-fill-subtle border-b border-line-subtle p-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                className="px-6 py-4 flex flex-col gap-3 overflow-hidden"
                              >
                                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-ghost">
                                  Completed Tasks Details
                                </span>
                                <div className="flex flex-col gap-2 max-w-3xl">
                                  {dayTasks.map(todo => (
                                    <div 
                                      key={todo.id} 
                                      className="flex items-center justify-between py-1.5 border-b border-line-subtle last:border-0"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-emerald-400 shrink-0 text-xs">✔</span>
                                        <span className="text-sm text-fg-muted font-medium truncate">{todo.text}</span>
                                        {collsForTodo(todo).length > 0 && (
                                          <div className="flex gap-1 shrink-0">
                                            {collsForTodo(todo).map(c => (
                                              <span
                                                key={c.id}
                                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                                style={{
                                                  backgroundColor: pillBg(c.color),
                                                  color: c.color
                                                }}
                                              >
                                                {c.name}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 text-[11px] font-mono font-medium text-warning bg-warning-tint px-2 py-0.5 rounded shrink-0 border border-warning-tint">
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
