import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Clock, LayoutGrid, List, Maximize2, Minimize2, LoaderCircle } from 'lucide-react';
import { Tracker, Theme, DayTodos, Todo, Workspace } from './types';
import appLogo from './assets/icon-invert2.png';
import { TrackerCard } from './components/TrackerCard';
import { AddTrackerModal } from './components/AddTrackerModal';
import { AccountModal } from './components/AccountModal';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { TodoView } from './components/TodoView';
import { TodosHubView } from './components/TodosHubView';
import { UNDATED, todoIndex, collectionOptions, collectWithDescendants } from './utils/todoFilters';
import { toggledStatus } from './utils/todoStatus';
import { CalendarView } from './components/CalendarView';
import { StatsView } from './components/StatsView';
import { ActiveTodoTracker } from './components/ActiveTodoTracker';
import { StopwatchWidget, TimerState } from './components/StopwatchWidget';
import { StopwatchFullscreen } from './components/StopwatchFullscreen';
import { authClient } from "./auth"
import { useTodos, useCreateTodo, useUpdateTodo, useDeleteTodo, useBatchTodos } from './data/todos';
import { useTrackers, useCreateTracker, useUpdateTracker, useDeleteTracker } from './data/trackers';
import { useWorkspaces, useCreateWorkspace, useRenameWorkspace } from './data/workspaces';
import { useSettings, useUpdateSettings } from './data/settings';

const DEFAULT_THEME: Theme = { accent1: '#e9ec6a', accent2: '#a2beb7' };

// Full-screen loading state: app logo, a continuously spinning loader, and a
// short status message. Shared by the auth/data gates below.
const LoadingScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="h-screen flex flex-col items-center justify-center gap-5 bg-neutral-950 text-white/40 text-sm">
    <img src={appLogo} alt="" className="w-16 h-16" />
    <LoaderCircle className="w-6 h-6 animate-spin text-white/60" />
    <p>{message}</p>
  </div>
);

// Flat list → in-memory bucket view, grouped by dueDate (undated → UNDATED).
// Within-day order follows `dailyOrder` (the daily list's own persisted order;
// SQL rows come back unordered, so array order can't be relied on). This is a
// derived read model only: the persisted source of truth is the flat Todo[] (each
// task owns its scheduled day via `dueDate`); this grouping feeds the day-grouped
// read surfaces (daily list, calendar, stats) that still consume DayTodos[].
function groupByDueDate(todos: Todo[]): DayTodos[] {
  const m = new Map<string, Todo[]>();
  for (const t of todos || []) {
    if (!t) continue;
    const key = t.dueDate && t.dueDate !== UNDATED ? t.dueDate : UNDATED;
    let arr = m.get(key);
    if (!arr) { arr = []; m.set(key, arr); }
    arr.push(t);
  }
  return [...m.entries()].map(([date, todos]) => ({
    date,
    todos: todos.sort((a, b) => (a.dailyOrder ?? a.createdAt) - (b.dailyOrder ?? b.createdAt)),
  }));
}

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  // Real Neon Auth session. The app is gated on this (see render below): server
  // data loads only once authenticated.
  const authSession = authClient.useSession();
  const sessionPending = authSession.isPending;
  const isAuthenticated = !!authSession.data;

  // ── Server data (TanStack Query); fetched once authenticated ───────────────
  const todosQuery = useTodos(isAuthenticated);
  const trackersQuery = useTrackers(isAuthenticated);
  const workspacesQuery = useWorkspaces(isAuthenticated);
  const todos = todosQuery.data ?? [];
  const trackers = trackersQuery.data ?? [];
  const workspaces = workspacesQuery.data ?? [];

  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodoMut = useDeleteTodo();
  const batchTodos = useBatchTodos();
  const createTracker = useCreateTracker();
  const updateTracker = useUpdateTracker();
  const deleteTrackerMut = useDeleteTracker();
  const createWorkspace = useCreateWorkspace();
  const renameWorkspaceMut = useRenameWorkspace();

  // ── Per-user settings (DB-synced; replaces the old localStorage prefs) ───────
  const settingsQuery = useSettings(isAuthenticated);
  const settings = settingsQuery.data;
  const updateSettings = useUpdateSettings();

  const theme = settings?.theme ?? DEFAULT_THEME;
  const setTheme = (t: Theme) => updateSettings({ theme: t });
  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const setWeekStartsOn = (v: number) => updateSettings({ weekStartsOn: v });
  const countdownMode = settings?.countdownMode ?? 'off';
  const setCountdownMode = (v: 'off' | 'time' | 'percent') => updateSettings({ countdownMode: v });
  const xpEnabled = settings?.xpEnabled ?? true;
  const setXpEnabled = (v: boolean) => updateSettings({ xpEnabled: v });
  const [activeView, setActiveView] = useState<'trackers' | 'todos' | 'hub' | 'calendar' | 'stats'>(() => {
    const saved = localStorage.getItem('dun-active-view');
    return saved === 'trackers' || saved === 'todos' || saved === 'hub' || saved === 'calendar' || saved === 'stats'
      ? saved
      : 'todos';
  });
  useEffect(() => {
    localStorage.setItem('dun-active-view', activeView);
  }, [activeView]);

  // ── Task Planner workspaces (independent todo databases) ───────────────────
  // The workspace list is server data; activeWorkspaceId is now a DB-synced pref
  // (cross-device "last workspace"). There is no fixed 'personal' id anymore — a
  // new user is seeded a "Personal" workspace below (workspace id is a global PK).
  const activeWorkspaceId = settings?.activeWorkspaceId ?? '';
  const setActiveWorkspaceId = (id: string) => updateSettings({ activeWorkspaceId: id });

  // First-run seeding + keep activeWorkspaceId valid once data has loaded.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) { seededRef.current = false; return; }
    if (workspacesQuery.isLoading || settingsQuery.isLoading) return;
    if (workspaces.length === 0) {
      if (seededRef.current) return;
      seededRef.current = true;
      const id = Math.random().toString(36).substr(2, 9);
      createWorkspace.mutate({ id, name: 'Personal' });
      setActiveWorkspaceId(id);
      return;
    }
    if (!workspaces.some(w => w.id === activeWorkspaceId)) {
      setActiveWorkspaceId(workspaces[0].id);
    }
  }, [isAuthenticated, workspacesQuery.isLoading, settingsQuery.isLoading, workspaces, activeWorkspaceId]);

  const addWorkspace = (): string => {
    const id = Math.random().toString(36).substr(2, 9);
    createWorkspace.mutate({ id, name: '' });
    setActiveWorkspaceId(id);
    return id;
  };
  const renameWorkspace = (id: string, name: string) =>
    renameWorkspaceMut.mutate({ id, name });

  const [activeTodoId, setActiveTodoId] = useState<string | null>(() => {
    return localStorage.getItem('dun-active-todo');
  });

  // Derived per-day bucket view for the day-grouped read surfaces (daily list,
  // calendar, stats) that still consume DayTodos[]. Not persisted.
  const dayTodos = useMemo(() => groupByDueDate(todos), [todos]);

  // Stopwatch state — lives here so the timer keeps running while the widget UI is hidden
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [isStopwatchVisible, setIsStopwatchVisible] = useState(false);
  const [isStopwatchFullscreen, setIsStopwatchFullscreen] = useState(false);
  const startTimeRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    const now = Date.now();
    setTimerState(prev => {
      if (prev === 'idle') {
        pausedElapsedRef.current = 0;
      }
      startTimeRef.current = now;
      return 'running';
    });
  }, []);

  const pauseTimer = useCallback(() => {
    pausedElapsedRef.current = pausedElapsedRef.current + (Date.now() - startTimeRef.current);
    setElapsed(pausedElapsedRef.current);
    setTimerState('paused');
  }, []);

  const stopTimer = useCallback(() => {
    setTimerState('idle');
    setElapsed(0);
    pausedElapsedRef.current = 0;
  }, []);

  const resetTimer = useCallback(() => {
    setTimerState('idle');
    setElapsed(0);
    pausedElapsedRef.current = 0;
  }, []);

  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setElapsed(pausedElapsedRef.current + (Date.now() - startTimeRef.current));
      }, 50);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState]);

  // Theme is DB-synced now; this effect only reflects it onto the CSS variables.
  useEffect(() => {
    document.documentElement.style.setProperty('--accent1', theme.accent1);
    document.documentElement.style.setProperty('--accent2', theme.accent2);
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    if (activeTodoId) {
      localStorage.setItem('dun-active-todo', activeTodoId);
    } else {
      localStorage.removeItem('dun-active-todo');
    }
  }, [activeTodoId]);

  const handleAddTracker = (newTracker: Tracker) => {
    if (editingTracker) updateTracker.mutate(newTracker);
    else createTracker.mutate(newTracker);
    setEditingTracker(null);
  };

  const handleDeleteTracker = (id: string) => {
    deleteTrackerMut.mutate(id);
  };

  const handleEditTracker = (tracker: Tracker) => {
    setEditingTracker(tracker);
    setIsModalOpen(true);
  };

  // Bucket key for a flat task (its scheduled day, or the UNDATED sentinel).
  const bucketKeyOf = (t: Todo) => (t.dueDate && t.dueDate !== UNDATED ? t.dueDate : UNDATED);

  // Replace the whole set of todos scheduled on `date` with `todosForDate` (the
  // daily/calendar views hand back the full day in its new order). Other days are
  // left untouched; the provided todos are pinned to `date` via dueDate.
  // Replace the set of todos scheduled on `date`. Existing todos for that day
  // that are no longer present are deleted; the rest are upserted with the new
  // dueDate/order. Server stamps completedAt from status.
  const handleUpdateTodos = (date: string, todosForDate: Todo[]) => {
    const dueDate = date && date !== UNDATED ? date : undefined;
    const newIds = new Set(todosForDate.map(t => t.id));
    const deletes = todos.filter(t => t && bucketKeyOf(t) === date && !newIds.has(t.id)).map(t => t.id);
    // Persist within-day position: the array order the daily/calendar view hands
    // back becomes each task's dailyOrder.
    const upserts = todosForDate.map((t, i) => ({ ...t, dueDate, dailyOrder: i }));
    batchTodos.mutate({ upserts, deletes });
    if (activeTodoId && deletes.includes(activeTodoId)) setActiveTodoId(null);
  };

  // Move a todo to a new scheduled day (its dueDate). fromDate is no longer
  // needed — the date lives on the task now. Land it at the bottom of the target
  // day by giving it the next dailyOrder.
  const handleMoveTodo = (_fromDate: string, toDate: string, updatedTodo: Todo) => {
    const dueDate = toDate && toDate !== UNDATED ? toDate : undefined;
    const maxDailyOrder = todos
      .filter(t => t && bucketKeyOf(t) === toDate && t.id !== updatedTodo.id)
      .reduce((m, t) => Math.max(m, t.dailyOrder ?? 0), -1);
    updateTodo.mutate({ id: updatedTodo.id, patch: { ...updatedTodo, dueDate, dailyOrder: maxDailyOrder + 1 } });
  };

  const handleToggleTodo = (todoId: string) => {
    const todo = todos.find(t => t && t.id === todoId);
    if (!todo) return;
    // Status is the source of truth; the server stamps completedAt.
    updateTodo.mutate({ id: todoId, patch: { status: toggledStatus(todo) } });

    // If we're toggling the active todo, close the tracker
    if (activeTodoId === todoId) {
      setActiveTodoId(null);
    }
  };

  const handleToggleAndClose = (todoId: string) => {
    handleToggleTodo(todoId);
    setActiveTodoId(null);
  };

  const handleStartTracking = (todoId: string) => {
    if (activeTodoId === todoId) {
      setActiveTodoId(null);
      return;
    }
    updateTodo.mutate({ id: todoId, patch: { trackingStartedAt: Date.now() } });
    setActiveTodoId(todoId);
  };

  const activeTodo = todos.find(t => t && t.id === activeTodoId);

  // ── Task Planner handlers ─────────────────────────────────────────────────────
  // Operate on the flat todos array; a task's scheduled day is its `dueDate`.

  // Save an edited hub todo. The date lives on the task itself (`dueDate`), so the
  // todo is the whole payload. Normalize the date here (empty/UNDATED ⇒ undated)
  // so callers can just set `dueDate` without worrying about the sentinel.
  const handleHubSaveTodo = (updatedTodo: Todo) => {
    const dueDate = updatedTodo.dueDate && updatedTodo.dueDate !== UNDATED ? updatedTodo.dueDate : undefined;
    updateTodo.mutate({ id: updatedTodo.id, patch: { ...updatedTodo, dueDate } });
  };

  // Create a fresh database todo at the bottom of the hub. An optional parentId
  // nests it as a subtask. `opts` lets a quick-add seed the task with attributes
  // (status/priority via `patch`) and/or a scheduled day (`date`) — used by the
  // grouped-view section "+" buttons so the new task lands in that section.
  const addHubTodo = (
    parentId: string | null,
    opts?: { date?: string | null; patch?: Partial<Todo> }
  ): string => {
    const maxOrder = todos.reduce((m, t) => Math.max(m, t?.hubOrder ?? 0), 0);
    const id = Math.random().toString(36).substr(2, 9);
    // An explicit group-create date wins over anything in the patch (e.g. a date
    // filter); when none is given we keep whatever dueDate the patch carries.
    const dueDate = opts?.date && opts.date !== UNDATED ? opts.date : undefined;
    const newTodo: Todo = {
      id,
      text: '',
      showInDatabase: true,
      showInDailyList: false,
      workspaceId: activeWorkspaceId,
      ...(parentId ? { parentId } : {}),
      hubOrder: maxOrder + 1,
      createdAt: Date.now(),
      status: "todo",
      ...(opts?.patch ?? {}),
      ...(dueDate !== undefined ? { dueDate } : {}),
    };
    createTodo.mutate(newTodo);
    return id;
  };
  const handleHubAddTodo = (opts?: { date?: string | null; patch?: Partial<Todo>; parentId?: string | null }): string =>
    addHubTodo(opts?.parentId ?? null, opts);
  const handleAddSubtask = (parentId: string): string => addHubTodo(parentId);

  // Create a collection with the given name (workspace-scoped), nested under
  // parentId when given, and return its id. Lives in the UNDATED bucket like
  // other database nodes.
  const createCollection = (
    name: string,
    workspaceId: string = activeWorkspaceId,
    parentId: string | null = null,
  ): string => {
    const id = Math.random().toString(36).substr(2, 9);
    const maxOrder = todos.reduce((m, t) => Math.max(m, t?.hubOrder ?? 0), 0);
    const newCollection: Todo = {
      id,
      text: name,
      showInDatabase: true,
      isCollection: true,
      color: '#9ca3af',
      parentId,
      workspaceId,
      hubOrder: maxOrder + 1,
      createdAt: Date.now(),
    };
    createTodo.mutate(newCollection);
    return id;
  };
  // Sidebar "New collection": create an empty one to inline-rename. An optional
  // parentId nests it under an existing collection.
  const addHubCollection = (parentId: string | null = null): string =>
    createCollection('', activeWorkspaceId, parentId);

  // Assign a task to a collection (or null = uncategorized) by reparenting it.
  // Membership is positional, so this just sets parentId; the task lands at the
  // end of the target's children. Works for hub and daily todos alike.
  const setTaskCollection = (taskId: string, collectionId: string | null) => {
    const maxOrder = todos
      .filter(t => t && (t.parentId ?? null) === (collectionId ?? null))
      .reduce((m, t) => Math.max(m, t.hubOrder ?? 0), 0);
    updateTodo.mutate({ id: taskId, patch: { parentId: collectionId, hubOrder: maxOrder + 1 } });
  };

  // Remove a todo entirely (server FK-cascades subtasks; cache drops them too).
  const handleDeleteTodoById = (id: string) => {
    deleteTodoMut.mutate(id);
    if (activeTodoId === id) setActiveTodoId(null);
  };

  // Archive a todo (and its subtasks): hides them from the hub.
  const handleArchiveTodo = (id: string) => {
    const ids = [...collectWithDescendants(todos.filter(Boolean) as Todo[], id)];
    batchTodos.mutate({ patches: ids.map(tid => ({ id: tid, archived: true })) });
  };

  // Delete a collection. 'cascade' removes the collection and its whole subtree.
  // 'promote' deletes only the collection node and moves its direct children
  // (tasks and sub-collections) up to the collection's parent (or uncategorized
  // if it was top-level).
  const handleDeleteCollection = (id: string, mode: 'cascade' | 'promote') => {
    if (mode === 'cascade') { handleDeleteTodoById(id); return; }
    const coll = todos.find(t => t && t.id === id);
    const grandparentId = coll?.parentId ?? null;
    const children = todos.filter(t => t && (t.parentId ?? null) === id);
    // Reparent children (patches) before deleting the node (deletes) — the
    // server applies patches first, so the FK cascade won't take the children.
    batchTodos.mutate({
      patches: children.map(c => ({ id: c.id, parentId: grandparentId })),
      deletes: [id],
    });
  };

  // Persist hub order + nesting: assign hubOrder by position and set parentId.
  const handleReorderHubTodos = (items: { id: string; parentId: string | null }[]) => {
    batchTodos.mutate({
      patches: items.map((it, i) => ({ id: it.id, hubOrder: i, parentId: it.parentId })),
    });
  };

  // Collection index + options for the pickers. The hub scopes to its active
  // workspace; the daily surfaces search every collection (they're not
  // workspace-aware).
  const todoById = useMemo(() => todoIndex(dayTodos), [dayTodos]);
  const hubCollectionOptions = useMemo(
    () => collectionOptions(dayTodos, todoById, { workspaceId: activeWorkspaceId }),
    [dayTodos, todoById, activeWorkspaceId]
  );
  const allCollectionOptions = useMemo(
    () => collectionOptions(dayTodos, todoById),
    [dayTodos, todoById]
  );

  const handleViewChange = (view: 'trackers' | 'todos' | 'hub' | 'calendar' | 'stats') => {
    setActiveView(view);
    if (view === 'todos' || view === 'hub' || view === 'calendar' || view === 'stats') {
      setIsFullscreen(false);
    }
  };

  // ── Auth / data gates ──────────────────────────────────────────────────────
  if (sessionPending) {
    return <LoadingScreen message="Loading…" />;
  }
  if (!isAuthenticated) {
    // Forced sign-in gate (the screen renders its own full-screen background).
    return (
      <div className="h-screen bg-neutral-950">
        <AuthModal isOpen onAuthenticated={() => {}} />
      </div>
    );
  }
  if (todosQuery.isError || trackersQuery.isError || workspacesQuery.isError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-neutral-950 text-white/60 text-sm">
        <p>Couldn’t load your data.</p>
        <button
          onClick={() => {
            todosQuery.refetch();
            trackersQuery.refetch();
            workspacesQuery.refetch();
          }}
          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }
  if (todosQuery.isLoading || workspacesQuery.isLoading || settingsQuery.isLoading) {
    return <LoadingScreen message="Loading your workspace…" />;
  }

  return (
    <div className={`${(activeView === 'calendar' || activeView === 'todos' || activeView === 'hub') ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-neutral-950 text-white font-sans selection:bg-[var(--accent1)] selection:text-black`}>
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        isVisible={!isFullscreen && !isStopwatchFullscreen}
        isAuthenticated={isAuthenticated}
        onAccountClick={() => setIsAccountModalOpen(true)}
        onStopwatchClick={() => setIsStopwatchVisible(v => !v)}
        isStopwatchActive={timerState !== 'idle'}
      />

      <div className={`transition-all duration-500 ${!isFullscreen ? 'pl-14' : 'pl-0'}`}>
        {/* Header */}
          {!isFullscreen && activeView === 'trackers' && (
            <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-md border-bottom border-white/5">
              <div className="max-w-5xl mx-auto px-6 pt-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg flex items-center justify-center transition-colors bg-white/10`}>
                    <Clock size={18} strokeWidth={2.5} className='text-white' />
                  </div>
                  <h1 className="text-xl font-bold leading-none">
                    Time Trackers
                  </h1>
                </div>

                <div className="flex items-center gap-4">
                  {activeView === 'trackers' && (
                    <div className="hidden sm:flex bg-white/5 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                      >
                        <LayoutGrid size={18} />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-1 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                      >
                        <List size={18} strokeWidth={2.5}/>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all"
                    title="Fullscreen Mode"
                  >
                    <Maximize2 size={18} strokeWidth={2.5} />
                  </button>

                  {activeView === 'trackers' && (
                    <button
                      onClick={() => {
                        setEditingTracker(null);
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all text-sm font-semibold"
                    >
                      <Plus size={18} strokeWidth={2.5} />
                      <span>Add Widget</span>
                    </button>
                  )}
                </div>
              </div>
            </header>
          )}

        {/* Exit Fullscreen Button */}
        <AnimatePresence>
          {isFullscreen && (
            <div className="fixed bottom-0 right-0 z-50 w-40 h-40 flex items-end justify-end p-8 group">
              <button
                className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-xl text-white/40 hover:text-white rounded-full shadow-2xl border border-white/10 transition-all opacity-0 group-hover:opacity-100"
                onClick={() => setIsFullscreen(false)}
                title="Exit Fullscreen"
              >
                <Minimize2 size={18} />
              </button>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className={`${(activeView === 'calendar' || activeView === 'todos') ? 'mx-auto px-2 h-screen' : activeView === 'hub' ? 'h-screen' : 'max-w-5xl mx-auto px-6'} ${isFullscreen
          ? 'min-h-screen flex flex-col justify-center py-6'
          : activeView === 'todos'
            ? 'py-0'
            : activeView === 'calendar'
              ? 'py-0'
              : activeView === 'hub'
                ? 'py-0'
                : 'py-6'
          }`}>
            {activeView === 'trackers' ? (
              <div key="trackers-view">
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'flex flex-col gap-6'}>
                  <AnimatePresence>
                    {trackers.map((tracker) => (
                      <TrackerCard
                        key={tracker.id}
                        tracker={tracker}
                        onDelete={handleDeleteTracker}
                        onEdit={handleEditTracker}
                      />
                    ))}
                  </AnimatePresence>

                  {trackers.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="col-span-full py-32 flex flex-col items-center justify-center text-center space-y-4"
                    >
                      <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-white/20">
                        <Clock size={40} />
                      </div>
                      <div>
                        <h2 className="text-xl font-medium text-white/60">No trackers yet</h2>
                        <p className="text-white/30 text-sm">Create your first progress widget to get started.</p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Active Todo Tracker */}
                <AnimatePresence>
                  {activeTodo && (
                    <div className="mt-12 flex justify-center">
                      <ActiveTodoTracker
                        todo={activeTodo}
                        onClose={() => setActiveTodoId(null)}
                        onToggle={() => handleToggleAndClose(activeTodo.id)}
                      />
                    </div>
                  )}
                </AnimatePresence>
              </div>
            ) : activeView === 'todos' ? (
              <div key="todos-view">
                <TodoView
                  dayTodos={dayTodos}
                  onUpdateTodos={handleUpdateTodos}
                  onMoveTodo={handleMoveTodo}
                  onStartTracking={handleStartTracking}
                  activeTodoId={activeTodoId}
                  onToggleTodo={handleToggleTodo}
                  trackers={trackers}
                  onDeleteTracker={handleDeleteTracker}
                  onEditTracker={handleEditTracker}
                  weekStartsOn={weekStartsOn}
                  onUpdateWeekStartsOn={setWeekStartsOn}
                  countdownMode={countdownMode}
                  onUpdateCountdownMode={setCountdownMode}
                  xpEnabled={xpEnabled}
                  onCreateCollection={createCollection}
                />
              </div>
            ) : activeView === 'hub' ? (
              <div key="hub-view" className="h-screen">
                <TodosHubView
                  dayTodos={dayTodos}
                  collectionOptions={hubCollectionOptions}
                  onSetTaskCollection={setTaskCollection}
                  onCreateCollection={createCollection}
                  onSaveTodo={handleHubSaveTodo}
                  onAddTodo={handleHubAddTodo}
                  onAddSubtask={handleAddSubtask}
                  onAddCollection={addHubCollection}
                  workspaces={workspaces}
                  activeWorkspaceId={activeWorkspaceId}
                  onSelectWorkspace={setActiveWorkspaceId}
                  onAddWorkspace={addWorkspace}
                  onRenameWorkspace={renameWorkspace}
                  onDeleteTodo={handleDeleteTodoById}
                  onDeleteCollection={handleDeleteCollection}
                  onArchiveTodo={handleArchiveTodo}
                  onReorder={handleReorderHubTodos}
                  onToggleTodo={handleToggleTodo}
                />
              </div>
            ) : activeView === 'calendar' ? (
              <div key="calendar-view">
                <CalendarView
                  dayTodos={dayTodos}
                  onUpdateTodos={handleUpdateTodos}
                />
              </div>
            ) : (
              <div key="stats-view">
                <StatsView
                  dayTodos={dayTodos}
                />
              </div>
            )}
        </main>
      </div>

      <AddTrackerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTracker(null);
        }}
        onAdd={handleAddTracker}
        editingTracker={editingTracker}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        email={authSession.data?.user?.email}
        name={authSession.data?.user?.name}
        onLogout={async () => {
          await authClient.signOut();
          setIsAccountModalOpen(false);
        }}
        weekStartsOn={weekStartsOn}
        onUpdateWeekStartsOn={setWeekStartsOn}
        countdownMode={countdownMode}
        onUpdateCountdownMode={setCountdownMode}
        xpEnabled={xpEnabled}
        onUpdateXpEnabled={setXpEnabled}
        theme={theme}
        onUpdateTheme={setTheme}
      />

      {/* Stopwatch Widget */}
      <AnimatePresence>
        {isStopwatchVisible && (
          <StopwatchWidget
            timerState={timerState}
            elapsed={elapsed}
            onStart={startTimer}
            onPause={pauseTimer}
            onStop={stopTimer}
            onReset={resetTimer}
            onClose={() => setIsStopwatchVisible(false)}
            onMaximize={() => {
              setIsStopwatchVisible(false);
              setIsStopwatchFullscreen(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* Stopwatch Fullscreen */}
      <AnimatePresence>
        {isStopwatchFullscreen && (
          <StopwatchFullscreen
            timerState={timerState}
            elapsed={elapsed}
            onStart={startTimer}
            onPause={pauseTimer}
            onStop={stopTimer}
            onReset={resetTimer}
            onMinimize={() => {
              setIsStopwatchFullscreen(false);
              setIsStopwatchVisible(true);
            }}
            onClose={() => setIsStopwatchFullscreen(false)}
          />
        )}
      </AnimatePresence>

      {/* Footer Decoration */}
      <AnimatePresence>
        {!isFullscreen && (
          <motion.footer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-12 text-center"
          >
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}
