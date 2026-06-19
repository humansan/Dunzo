import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Clock, LayoutGrid, List, Maximize2, Minimize2 } from 'lucide-react';
import { Tracker, Theme, DayTodos, Todo, Workspace } from './types';
import { TrackerCard } from './components/TrackerCard';
import { AddTrackerModal } from './components/AddTrackerModal';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { TodoView } from './components/TodoView';
import { TodosHubView } from './components/TodosHubView';
import { UNDATED, todoIndex, collectionOptions } from './utils/todoFilters';
import { CalendarView } from './components/CalendarView';
import { StatsView } from './components/StatsView';
import { ActiveTodoTracker } from './components/ActiveTodoTracker';
import { StopwatchWidget, TimerState } from './components/StopwatchWidget';
import { StopwatchFullscreen } from './components/StopwatchFullscreen';
import { authClient } from "./auth"

const DEFAULT_TRACKERS: Tracker[] = [
  {
    id: 'day-default',
    name: 'Day',
    type: 'day',
    color: '#e9ec6a',
    precision: 2,
    createdAt: Date.now(),
  },
  {
    id: 'year-default',
    name: 'Year',
    type: 'year',
    color: '#a2beb7',
    precision: 3,
    createdAt: Date.now() + 1,
  }
];

// A todo id together with every descendant id (subtasks, recursively), for
// cascading hub operations like delete/archive.
function collectWithDescendants(todos: Todo[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const t of todos) {
    if (t && t.parentId) {
      const arr = childrenByParent.get(t.parentId) ?? [];
      arr.push(t.id);
      childrenByParent.set(t.parentId, arr);
    }
  }
  const result = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenByParent.get(cur) ?? []) {
      if (!result.has(child)) { result.add(child); stack.push(child); }
    }
  }
  return result;
}

// Flat list → in-memory bucket view, grouped by dueDate (undated → UNDATED).
// Within-day order follows the flat array. This is a derived read model only: the
// persisted source of truth is the flat Todo[] (each task owns its scheduled day
// via `dueDate`); this grouping feeds the day-grouped read surfaces (daily list,
// calendar, stats) that still consume DayTodos[].
function groupByDueDate(todos: Todo[]): DayTodos[] {
  const m = new Map<string, Todo[]>();
  for (const t of todos || []) {
    if (!t) continue;
    const key = t.dueDate && t.dueDate !== UNDATED ? t.dueDate : UNDATED;
    let arr = m.get(key);
    if (!arr) { arr = []; m.set(key, arr); }
    arr.push(t);
  }
  return [...m.entries()].map(([date, todos]) => ({ date, todos }));
}

export default function App() {
  const [trackers, setTrackers] = useState<Tracker[]>(() => {
    const saved = localStorage.getItem('dun-trackers');
    return saved ? JSON.parse(saved) : DEFAULT_TRACKERS;
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [weekStartsOn, setWeekStartsOn] = useState<number>(() => {
    const saved = localStorage.getItem('dun-week-starts-on');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [countdownMode, setCountdownMode] = useState<'off' | 'time' | 'percent'>(() => {
    const saved = localStorage.getItem('dun-countdown-mode');
    return (saved as 'off' | 'time' | 'percent') || 'off';
  });
  const [xpEnabled, setXpEnabled] = useState<boolean>(() => {
    return localStorage.getItem('dun-xp-enabled') !== 'false'; // default on
  });


  const [session, setSession] = useState<any>(null);
  
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // TODO(neon-auth): replace with Neon Auth session check
    return localStorage.getItem('dun-auth-stub') === 'true';
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('dun-theme');
    return saved ? JSON.parse(saved) : { accent1: '#e9ec6a', accent2: '#a2beb7' };
  });
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
  const DEFAULT_WORKSPACE: Workspace = { id: 'personal', name: 'Personal' };
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dun-workspaces') || 'null');
      return Array.isArray(saved) && saved.length ? saved : [DEFAULT_WORKSPACE];
    } catch {
      return [DEFAULT_WORKSPACE];
    }
  });
  useEffect(() => { localStorage.setItem('dun-workspaces', JSON.stringify(workspaces)); }, [workspaces]);

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(
    () => localStorage.getItem('dun-active-workspace') || 'personal'
  );
  useEffect(() => { localStorage.setItem('dun-active-workspace', activeWorkspaceId); }, [activeWorkspaceId]);
  // Guard against a dangling active id (e.g. a deleted workspace).
  useEffect(() => {
    if (!workspaces.some(w => w.id === activeWorkspaceId)) setActiveWorkspaceId('personal');
  }, [workspaces, activeWorkspaceId]);

  const addWorkspace = (): string => {
    const id = Math.random().toString(36).substr(2, 9);
    setWorkspaces(prev => [...prev, { id, name: '' }]);
    setActiveWorkspaceId(id);
    return id;
  };
  const renameWorkspace = (id: string, name: string) =>
    setWorkspaces(prev => prev.map(w => (w.id === id ? { ...w, name } : w)));
  // Flat source of truth: every todo/collection across all dates. Each task owns
  // its scheduled day via `dueDate`.
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dun-todos') || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
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

  useEffect(() => {
    localStorage.setItem('dun-theme', JSON.stringify(theme));
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
    localStorage.setItem('dun-trackers', JSON.stringify(trackers));
  }, [trackers]);

  useEffect(() => {
    localStorage.setItem('dun-week-starts-on', weekStartsOn.toString());
  }, [weekStartsOn]);

  useEffect(() => {
    localStorage.setItem('dun-countdown-mode', countdownMode);
  }, [countdownMode]);

  useEffect(() => {
    localStorage.setItem('dun-xp-enabled', String(xpEnabled));
  }, [xpEnabled]);

  useEffect(() => {
    localStorage.setItem('dun-todos', JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    if (activeTodoId) {
      localStorage.setItem('dun-active-todo', activeTodoId);
    } else {
      localStorage.removeItem('dun-active-todo');
    }
  }, [activeTodoId]);

  const handleAddTracker = (newTracker: Tracker) => {
    if (editingTracker) {
      setTrackers(trackers.map(t => t.id === newTracker.id ? newTracker : t));
    } else {
      setTrackers([...trackers, newTracker]);
    }
    setEditingTracker(null);
  };

  const handleDeleteTracker = (id: string) => {
    setTrackers(trackers.filter(t => t.id !== id));
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
  const handleUpdateTodos = (date: string, todosForDate: Todo[]) => {
    const dueDate = date && date !== UNDATED ? date : undefined;
    setTodos(prev => {
      const others = prev.filter(t => t && bucketKeyOf(t) !== date);
      const normalized = todosForDate.map(t => ({ ...t, dueDate }));
      const updated = [...others, ...normalized];
      if (activeTodoId && !updated.some(t => t && t.id === activeTodoId)) setActiveTodoId(null);
      return updated;
    });
  };

  // Move a todo to a new scheduled day (its dueDate). fromDate is no longer
  // needed — the date lives on the task now.
  const handleMoveTodo = (_fromDate: string, toDate: string, updatedTodo: Todo) => {
    const dueDate = toDate && toDate !== UNDATED ? toDate : undefined;
    setTodos(prev => prev.map(t => (t && t.id === updatedTodo.id ? { ...updatedTodo, dueDate } : t)));
  };

  const handleToggleTodo = (todoId: string) => {
    setTodos(prev => prev.map(todo => {
      if (!todo || todo.id !== todoId) return todo;
      const completed = !todo.completed;
      // Keep the workflow status in sync with the checkbox: checking marks the
      // task Completed; unchecking a Completed task drops it back to Todo.
      let status = todo.status;
      if (completed) status = 'completed';
      else if (todo.status === 'completed') status = 'todo';
      return { ...todo, completed, status, completedAt: completed ? Date.now() : undefined };
    }));

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
    setTodos(prev => prev.map(todo =>
      todo && todo.id === todoId ? { ...todo, trackingStartedAt: Date.now() } : todo
    ));
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
    setTodos(prev => prev.map(t => (t && t.id === updatedTodo.id ? { ...updatedTodo, dueDate } : t)));
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
    const dueDate = opts?.date && opts.date !== UNDATED ? opts.date : undefined;
    const newTodo: Todo = {
      id,
      text: '',
      completed: false,
      showInDatabase: true,
      showInDailyList: false,
      workspaceId: activeWorkspaceId,
      ...(parentId ? { parentId } : {}),
      hubOrder: maxOrder + 1,
      createdAt: Date.now(),
      status: "todo",
      ...(opts?.patch ?? {}),
      dueDate,
    };
    setTodos(prev => [...prev, newTodo]);
    return id;
  };
  const handleHubAddTodo = (opts?: { date?: string | null; patch?: Partial<Todo> }): string =>
    addHubTodo(null, opts);
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
      completed: false,
      showInDatabase: true,
      isCollection: true,
      color: '#9ca3af',
      parentId,
      workspaceId,
      hubOrder: maxOrder + 1,
      createdAt: Date.now(),
    };
    setTodos(prev => [...prev, newCollection]);
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
    setTodos(prev => {
      const maxOrder = prev
        .filter(t => t && (t.parentId ?? null) === (collectionId ?? null))
        .reduce((m, t) => Math.max(m, t.hubOrder ?? 0), 0);
      return prev.map(t =>
        t && t.id === taskId ? { ...t, parentId: collectionId, hubOrder: maxOrder + 1 } : t
      );
    });
  };

  // Remove a todo entirely (cascading to its subtasks).
  const handleDeleteTodoById = (id: string) => {
    setTodos(prev => {
      const toRemove = collectWithDescendants(prev.filter(Boolean) as Todo[], id);
      return prev.filter(t => t && !toRemove.has(t.id));
    });
    if (activeTodoId === id) setActiveTodoId(null);
  };

  // Archive a todo (and its subtasks): hides them from the hub.
  const handleArchiveTodo = (id: string) => {
    setTodos(prev => {
      const toArchive = collectWithDescendants(prev.filter(Boolean) as Todo[], id);
      return prev.map(t => t && toArchive.has(t.id) ? { ...t, archived: true } : t);
    });
  };

  // Delete a collection. 'cascade' removes the collection and its whole subtree.
  // 'promote' deletes only the collection node and moves its direct children
  // (tasks and sub-collections) up to the collection's parent (or uncategorized
  // if it was top-level).
  const handleDeleteCollection = (id: string, mode: 'cascade' | 'promote') => {
    if (mode === 'cascade') { handleDeleteTodoById(id); return; }
    setTodos(prev => {
      const coll = prev.find(t => t && t.id === id);
      const grandparentId = coll?.parentId ?? null;
      return prev.flatMap(t => {
        if (!t) return [];
        if (t.id === id) return [];                                  // drop the collection node
        if ((t.parentId ?? null) === id) return [{ ...t, parentId: grandparentId }]; // reparent children
        return [t];
      });
    });
  };

  // Persist hub order + nesting: assign hubOrder by position and set parentId.
  const handleReorderHubTodos = (items: { id: string; parentId: string | null }[]) => {
    const map = new Map(items.map((it, i) => [it.id, { order: i, parentId: it.parentId }]));
    setTodos(prev => prev.map(t => {
      const u = t && map.get(t.id);
      return u ? { ...t, hubOrder: u.order, parentId: u.parentId } : t;
    }));
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

  return (
    <div className={`${(activeView === 'calendar' || activeView === 'todos' || activeView === 'hub') ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-neutral-950 text-white font-sans selection:bg-[var(--accent1)] selection:text-black`}>
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        isVisible={!isFullscreen && !isStopwatchFullscreen}
        isAuthenticated={isAuthenticated}
        onAccountClick={() => setIsAuthModalOpen(true)}
        onSettingsClick={() => setIsSettingsModalOpen(true)}
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

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        weekStartsOn={weekStartsOn}
        onUpdateWeekStartsOn={setWeekStartsOn}
        countdownMode={countdownMode}
        onUpdateCountdownMode={setCountdownMode}
        xpEnabled={xpEnabled}
        onUpdateXpEnabled={setXpEnabled}
        theme={theme}
        onUpdateTheme={setTheme}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        isAuthenticated={isAuthenticated}
        onAuthenticated={() => {
          // TODO(neon-auth): replace with real session persistence from Neon Auth
          localStorage.setItem('dun-auth-stub', 'true');
          setIsAuthenticated(true);
          setIsAuthModalOpen(false);
        }}
        onLogout={() => {
          // TODO(neon-auth): replace with Neon Auth sign-out call
          localStorage.removeItem('dun-auth-stub');
          setIsAuthenticated(false);
          setIsAuthModalOpen(false);
        }}
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
