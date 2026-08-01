import React, { useMemo, useDeferredValue } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  isSameWeek,
  parseISO,
  eachDayOfInterval,
  endOfWeek
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import { btnNeutral, btnToggle } from '@/theme/buttons';
import { Todo, DayTodos, Tracker } from '@shared/types';
import { todoIndex, collectionOptions as buildCollectionOptions, showsOnDailyChecklist } from '@/features/tasks/model';

import { TrackerCard } from '@/features/trackers';
import { CalendarView } from '@/features/calendar';
import { QuickEditValues } from '@/features/tasks';
import { XpProgressBar } from '@/features/xp';
import { StarStreak, StarStreakPopup, STAR_CELEBRATE_DELAY_MS } from '@/features/xp';
import { computeXpStats, getWeeklyXp, computeStarStreak, buildXpHistory } from '@/features/xp';
import { useDelayedValue } from '@/common/hooks/useDelayedValue';
import { DailyList } from '@/features/daily/DailyList';
import { DatePickerPopover } from '@/common/ui';

interface DailyScreenProps {
  dayTodos: DayTodos[];
  // Per-row save - the same handler the Task Planner and the full view use, so a
  // field edited here gets identical normalization and the same subtask prompts.
  onSaveTodo: (todo: Todo) => void;
  // Create one task on `date`, with the day's resulting order (ids, in order).
  onCreateInDay: (date: string, todo: Todo, orderedIds: string[]) => void;
  // Set the within-day order. Ids only - never touches a task's fields.
  onReorderDay: (orderedIds: string[]) => void;
  onDeleteTodo: (id: string) => void;
  // Currently unwired: the daily list's time chip used to start the tracker, but
  // it is now a time picker (matching the quick-edit panel), so nothing in this
  // screen starts tracking. AppShell still owns the tracker + its state, so this
  // only needs a new trigger to come back.
  onStartTracking: (id: string) => void;
  activeTodoId: string | null;
  onToggleTodo: (id: string) => void;
  trackers: Tracker[];
  onDeleteTracker: (id: string) => void;
  onEditTracker: (tracker: Tracker) => void;
  weekStartsOn: number;
  onUpdateWeekStartsOn: (val: number) => void;
  countdownMode: 'off' | 'time' | 'percent';
  onUpdateCountdownMode: (val: 'off' | 'time' | 'percent') => void;
  xpEnabled: boolean;
  // Default for new daily-list tasks: whether they also show in the Task Planner
  // (showInDatabase). Undefined-safe upstream (defaults to true). Creation-time only.
  dailyTasksInPlanner: boolean;
  onCreateCollection: (name: string) => string;
  // The focused day (YYYY-MM-DD) is URL-driven (?date); the route owns it.
  selectedDate: string;
  onSelectDate: (date: string) => void;
  // Opening a task navigates to /task/$taskId (the shared full-view route).
  onOpenTask: (id: string) => void;
  // Drawing a block on the embedded calendar creates a timed task; returns its id.
  onCreateTask: (date: string, startTime: string, dueTime: string) => string;
}

// ─── DailyScreen ────────────────────────────────────────────────────────────────
export const DailyScreen: React.FC<DailyScreenProps> = ({
  dayTodos,
  onSaveTodo,
  onCreateInDay,
  onReorderDay,
  onDeleteTodo,
  onStartTracking,
  activeTodoId,
  onToggleTodo,
  trackers,
  onDeleteTracker,
  onEditTracker,
  weekStartsOn,
  onUpdateWeekStartsOn,
  countdownMode,
  onUpdateCountdownMode,
  xpEnabled,
  dailyTasksInPlanner,
  onCreateCollection,
  selectedDate,
  onSelectDate,
  onOpenTask,
  onCreateTask,
}) => {
  const orderedTrackers = useMemo(() => {
    const dayTracker = trackers.find(t => t.type === 'day');
    const others = trackers.filter(t => t.type !== 'day');
    return dayTracker ? [dayTracker, ...others] : others;
  }, [trackers]);

  // `selectedDate` comes from the route (?date); alias the setter so the existing
  // date-nav call sites (prev/next/today/pick) stay unchanged.
  const setSelectedDate = onSelectDate;

  const currentDayData = useMemo(() => {
    return dayTodos.find(d => d.date === selectedDate) || { date: selectedDate, todos: [] };
  }, [dayTodos, selectedDate]);

  // Only todos explicitly sent to the daily list show here; a dated planner task
  // (showInDailyList off) still lives in this day's bucket but stays hidden.
  const dailyTodos = useMemo(
    () => (currentDayData.todos || []).filter(t => t && showsOnDailyChecklist(t, selectedDate)),
    [currentDayData, selectedDate]
  );

  // Decouple the XP/star/streak math from the check-off interaction. The checkbox
  // list (`dailyTodos` above) reads the LIVE day data, so a toggle paints and
  // animates instantly. The gamification widgets below read a DEFERRED copy, so
  // React commits the urgent tick first and only recomputes XP in a later,
  // low-priority render - a heavy recompute can never delay the check-off.
  const deferredDayTodos = useDeferredValue(dayTodos);


  // One shared per-day rollup for the current day's XP + streak reads, so the
  // three memos below don't each rebuild it. The corner streak (below) runs on a
  // delayed copy of dayTodos, so it intentionally keeps its own.
  const xpHistory = useMemo(() => buildXpHistory(deferredDayTodos), [deferredDayTodos]);
  
  const xpStats = useMemo(
    () => computeXpStats(deferredDayTodos, selectedDate, weekStartsOn, xpHistory),
    [deferredDayTodos, selectedDate, weekStartsOn, xpHistory]
  );

  const weeklyXp = useMemo(() => getWeeklyXp(deferredDayTodos, 4, xpHistory), [deferredDayTodos, xpHistory]);
  
  // Star/streak flags are computed here and passed in - the widgets don't touch task
  // state. The popup gets the LIVE flags (it snapshots + animates them itself); the
  // corner gets a lagged copy so - with no animation of its own - it silently settles
  // to the new total right as the popup lights up.
  const starStreak = useMemo(() => computeStarStreak(deferredDayTodos, selectedDate, xpHistory), [deferredDayTodos, selectedDate, xpHistory]);

  const lit = useMemo(
    () => [starStreak.flags.completedTask, starStreak.flags.beatYesterday, starStreak.flags.beatAverage],
    [starStreak]
  );

  const cornerTodos = useDelayedValue(dayTodos, STAR_CELEBRATE_DELAY_MS);
  const cornerStreak = useMemo(() => computeStarStreak(cornerTodos, selectedDate), [cornerTodos, selectedDate]);
  const cornerLit = useMemo(
    () => [cornerStreak.flags.completedTask, cornerStreak.flags.beatYesterday, cornerStreak.flags.beatAverage],
    [cornerStreak]
  );

  const weekDays = useMemo(() => {
    const start = startOfWeek(parseISO(selectedDate), { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
    return eachDayOfInterval({
      start,
      end: endOfWeek(start, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
    });
  }, [selectedDate, weekStartsOn]);

  const newTodoId = () => Math.random().toString(36).substr(2, 9);
  // The day's order is expressed as a list of ids; the writes below never carry
  // field data alongside it.
  const idsOf = (list: (Todo | null | undefined)[]) =>
    list.filter(Boolean).map((t) => t!.id);

  const buildTodo = (vals: QuickEditValues): Todo => ({
    id: newTodoId(),
    text: vals.text,
    // A daily-list task always shows on the daily list; whether it ALSO lands in
    // the Task Planner is the user's "Default Visibility" setting (default true).
    showInDatabase: dailyTasksInPlanner,
    showInDailyList: true,
    notes: vals.notes || undefined,
    startTime: vals.startTime,
    dueTime: vals.dueTime,
    xp: vals.xp,
    status: vals.status ?? "todo",
    priority: vals.priority,
    parentId: vals.parentId ?? undefined,
    autoMoveDate: vals.autoMoveDate,
    createdAt: Date.now(),
  });

  const handleAddTodo = (vals: QuickEditValues) => {
    if (!vals.text.trim()) return;

    const newTodo = buildTodo(vals);
    const target = vals.date;
    const day = target === selectedDate
      ? currentDayData.todos
      : (dayTodos.find(d => d.date === target)?.todos ?? []);
    onCreateInDay(target, newTodo, [...idsOf(day), newTodo.id]);
    // Panel stays open (QuickEditTodo resets itself) for rapid entry.
  };

  // "Add task above/below": the new task's place in the day's order is its index in
  // this array, which onCreateInDay writes back as dailyOrder. A task dated to
  // another day can't be positioned here, so it just joins that day's bucket.
  const addTodoAt = (vals: QuickEditValues, anchorId: string, pos: 'above' | 'below') => {
    if (!vals.text.trim()) return;
    if (vals.date !== selectedDate) {
      handleAddTodo(vals);
      return;
    }
    const all = currentDayData.todos || [];
    const idx = all.findIndex(t => t && t.id === anchorId);
    if (idx === -1) {
      handleAddTodo(vals);
      return;
    }
    const newTodo = buildTodo(vals);
    const order = idsOf(all);
    order.splice(pos === 'above' ? idx : idx + 1, 0, newTodo.id);
    onCreateInDay(selectedDate, newTodo, order);
  };

  // Copy a task's fields under a fresh id, placed directly below the original.
  // Completion/tracking stamps belong to the original, so they aren't carried.
  const duplicateTodo = (id: string) => {
    const all = currentDayData.todos || [];
    const idx = all.findIndex(t => t && t.id === id);
    if (idx === -1) return;
    const copy: Todo = {
      ...all[idx],
      id: newTodoId(),
      createdAt: Date.now(),
      completedAt: undefined,
      trackingStartedAt: undefined,
    };
    const order = idsOf(all);
    order.splice(idx + 1, 0, copy.id);
    onCreateInDay(selectedDate, copy, order);
  };

  // Deleting is its own operation now - it used to be expressed as "save the day
  // without this row", which only worked because the day array was authoritative.
  const deleteTodo = (id: string) => onDeleteTodo(id);

  // Persist edits without closing the panel (used by Save and the unmount flush).
  const persistEdit = (id: string, vals: QuickEditValues) => {
    const todoToEdit = currentDayData.todos.find(t => t && t.id === id);
    if (!todoToEdit) return;

    // A field edit is a one-row write, so it takes the same handler the Planner and
    // the full view use. It used to re-save the WHOLE day through onUpdateTodos,
    // which meant editing one XP chip rewrote every task on that day (and every
    // dailyOrder with it), skipped reconcileArchived, and - because that array is
    // authoritative - carried an implicit "delete anything not in this list".
    //
    // The date rides along in the same payload: a reschedule is just a save whose
    // dueDate differs, and onSaveTodo lands the task at the bottom of whatever day
    // it moves to. This used to branch to a separate move handler for that.
    onSaveTodo({
      ...todoToEdit,
      text: vals.text,
      notes: vals.notes || undefined,
      dueDate: vals.date || undefined,
      startTime: vals.startTime,
      dueTime: vals.dueTime,
      xp: vals.xp,
      status: vals.status,
      priority: vals.priority,
      parentId: vals.parentId ?? undefined,
      autoMoveDate: vals.autoMoveDate,
    });
  };

  // The context menu edits one field at a time; round-tripping the row through
  // persistEdit keeps every write on the same path as the quick-edit panel.
  const valuesOf = (todo: Todo): QuickEditValues => ({
    text: todo.text,
    notes: todo.notes || '',
    date: selectedDate,
    startTime: todo.startTime,
    dueTime: todo.dueTime,
    xp: todo.xp,
    status: todo.status,
    priority: todo.priority,
    parentId: todo.parentId ?? null,
    autoMoveDate: todo.autoMoveDate,
  });

  const patchTodo = (id: string, patch: (todo: Todo) => Partial<QuickEditValues>) => {
    const todo = currentDayData.todos.find(t => t && t.id === id);
    if (!todo) return;
    persistEdit(id, { ...valuesOf(todo), ...patch(todo) });
  };

  // Clearing the date drops the task off the daily list entirely, so it's only
  // allowed for tasks that also live in the planner (matching the Clear button's
  // visibility in the menu's calendar panel).
  const setTodoDate = (id: string, date: string) => {
    const todo = currentDayData.todos.find(t => t && t.id === id);
    if (!todo || (!date && !todo.showInDatabase)) return;
    patchTodo(id, () => ({ date }));
  };

  // Clearing the end time drops the start time with it, mirroring the quick editor
  // (a start with no end is meaningless).
  const setTodoTime = (id: string, time: string) =>
    patchTodo(id, (todo) => time
      ? { dueTime: time, startTime: todo.startTime }
      : { dueTime: undefined, startTime: undefined });

  const setTodoParent = (id: string, parentId: string | null) =>
    patchTodo(id, () => ({ parentId }));

  const setTodoXp = (id: string, xp: number | undefined) =>
    patchTodo(id, () => ({ xp }));

  // Collection index + options for the quick-edit pickers.
  const byId = useMemo(() => todoIndex(dayTodos), [dayTodos]);
  const collOptions = useMemo(() => buildCollectionOptions(dayTodos, byId), [dayTodos, byId]);


  const navigateWeek = (direction: 'prev' | 'next') => {
    const current = parseISO(selectedDate);
    const wso = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    // Land on the near edge of the adjacent week (start of next / end of prev)
    // so a single press feels like stepping to the next sequential day.
    const target = direction === 'next'
      ? startOfWeek(addDays(current, 7), { weekStartsOn: wso })
      : endOfWeek(addDays(current, -7), { weekStartsOn: wso });
    // If the landing week contains today, prefer today over the week's edge.
    const today = new Date();
    const landing = isSameWeek(today, target, { weekStartsOn: wso }) ? today : target;
    setSelectedDate(format(landing, 'yyyy-MM-dd'));
  };

  return (
    <div className="mx-auto px-1 pt-2 flex gap-4 h-screen overflow-hidden">
      {/* Left side: Trackers List */}
      <div className="w-[20%] min-w-45 hidden md:block flex-shrink-0 overflow-y-auto pr-1 pb-12 no-scrollbar">
        <div className="flex flex-col gap-3 pt-1">
          <AnimatePresence>
            {orderedTrackers.map((tracker) => (
              <TrackerCard
                key={tracker.id}
                tracker={tracker}
                onDelete={onDeleteTracker}
                onEdit={onEditTracker}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Middle side: Todo List */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-visible no-scrollbar">
        {/* Date Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4 mt-1">
            <div>
              <h2 className="text-xl font-bold text-fg">
                {format(parseISO(selectedDate), 'MMMM yyyy')}
              </h2>
            </div>
            <div className="flex gap-2 items-center">
              <DatePickerPopover
                value={selectedDate}
                onChange={(val) => { if (val) setSelectedDate(val); }}
              >
                {({ open }) => (
                  <button
                    onClick={open}
                    title="Jump to date"
                    className={`p-1.5 rounded-lg ${btnNeutral}`}
                  >
                    <CalendarDays size={16} />
                  </button>
                )}
              </DatePickerPopover>
              <button
                onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${btnNeutral}`}
              >
                Today
              </button>
              <button
                onClick={() => navigateWeek('prev')}
                className={`p-1.5 rounded-lg ${btnNeutral}`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navigateWeek('next')}
                className={`p-1.5 rounded-lg ${btnNeutral}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex justify-between items-end border-b border-line-subtle pb-3 px-1">
            {weekDays.map((day) => {
              const isSelected = isSameDay(day, parseISO(selectedDate));
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(format(day, 'yyyy-MM-dd'))}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <span className={`text-xs font-bold transition-colors ${isSelected ? 'text-[var(--accent2)]' : 'text-fg-ghost group-hover:text-fg-subtle'
                    }`}>
                    {format(day, 'EEE')}
                  </span>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${btnToggle(isSelected)} ${isSelected ? 'scale-110' : ''} ${isToday && !isSelected ? 'ring-2 ring-[var(--accent2)]/40' : ''}`}>
                    {format(day, 'd')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Todo List */}
        <DailyList
          todos={dailyTodos}
          date={selectedDate}
          onToggle={onToggleTodo}
          onDelete={deleteTodo}
          onSaveEdit={persistEdit}
          onCommitEdit={persistEdit}
          onOpenFull={onOpenTask}
          activeTodoId={activeTodoId}
          onAdd={handleAddTodo}
          onAddAt={addTodoAt}
          onDuplicate={duplicateTodo}
          onSetDate={setTodoDate}
          onSetTime={setTodoTime}
          onSetXp={setTodoXp}
          onSetParent={setTodoParent}
          countdownMode={countdownMode}
          collectionOptions={collOptions}
          onCreateCollection={onCreateCollection}
          onReorder={(newTodos) => {
            // DailyList only sees the daily-visible subset. The day's hidden (dated
            // planner) tasks are appended so they keep a defined place in the order
            // rather than interleaving with stale indexes - they used to be passed
            // for a sharper reason, to stop the whole-day write from deleting them.
            const hidden = (currentDayData.todos || []).filter(t => t && !showsOnDailyChecklist(t, selectedDate));
            onReorderDay([...idsOf(newTodos), ...idsOf(hidden)]);
          }}
        />
        <div className="h-26 shrink-0" />
      </div>

      {/* Right side: 1-Day Calendar */}
      <div className="max-w-110 w-[24%] shrink-0 hidden lg:block h-full">
        <div className="h-full overflow-hidden flex flex-col">
          <CalendarView
            dayTodos={dayTodos}
            onSaveTodo={onSaveTodo}
            onToggleTodo={onToggleTodo}
            initialDate={selectedDate}
            initialDays={1}
            hideHeader={true}
            hideMiniCalendar={true}
            onCreateTask={onCreateTask}
            onOpenTask={onOpenTask}
          />
        </div>
      </div>


      {xpEnabled && (
        <>
          <XpProgressBar stats={xpStats} weeklyXp={weeklyXp} />
          <StarStreak lit={cornerLit} streak={cornerStreak.streak} />
          <StarStreakPopup lit={lit} streak={starStreak.streak} date={selectedDate} />
        </>
      )}

    </div>
  );
};
