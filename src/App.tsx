import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Clock, LayoutGrid, List, Maximize2, Minimize2 } from 'lucide-react';
import { Tracker, Theme, DayTodos, Todo } from './types';
import { TrackerCard } from './components/TrackerCard';
import { AddTrackerModal } from './components/AddTrackerModal';
import { SettingsModal } from './components/SettingsModal';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { TodoView } from './components/TodoView';
import { TodosHubView } from './components/TodosHubView';
import { UNDATED } from './utils/todoFilters';
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
  const [activeView, setActiveView] = useState<'trackers' | 'todos' | 'hub' | 'calendar' | 'stats'>('todos');
  const [dayTodos, setDayTodos] = useState<DayTodos[]>(() => {
    const saved = localStorage.getItem('dun-todos');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTodoId, setActiveTodoId] = useState<string | null>(() => {
    return localStorage.getItem('dun-active-todo');
  });

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
    localStorage.setItem('dun-todos', JSON.stringify(dayTodos));
  }, [dayTodos]);

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

  const handleUpdateTodos = (date: string, todos: Todo[]) => {
    setDayTodos(prev => {
      const existing = prev.find(d => d.date === date);
      const updated = existing
        ? prev.map(d => d.date === date ? { ...d, todos } : d)
        : [...prev, { date, todos }];

      // If active todo was deleted, clear it
      if (activeTodoId) {
        const stillExists = updated.some(d => (d.todos || []).some(t => t && t.id === activeTodoId));
        if (!stillExists) {
          setActiveTodoId(null);
        }
      }
      return updated;
    });
  };

  const handleMoveTodo = (fromDate: string, toDate: string, updatedTodo: Todo) => {
    setDayTodos(prev => {
      // 1. Remove from old date
      const withoutOld = prev.map(d => d.date === fromDate
        ? { ...d, todos: (d.todos || []).filter(t => t && t.id !== updatedTodo.id) }
        : d
      );

      // 2. Add to new date
      const existingToDate = withoutOld.find(d => d.date === toDate);
      const withNew = existingToDate
        ? withoutOld.map(d => d.date === toDate
          ? { ...d, todos: [...(d.todos || []), updatedTodo] }
          : d
        )
        : [...withoutOld, { date: toDate, todos: [updatedTodo] }];

      return withNew;
    });
  };

  const handleToggleTodo = (todoId: string) => {
    setDayTodos(prev => prev.map(day => ({
      ...day,
      todos: day.todos.map(todo =>
        todo.id === todoId ? { ...todo, completed: !todo.completed } : todo
      )
    })));

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
    setDayTodos(prev => (prev || []).map(day => ({
      ...day,
      todos: (day.todos || []).map(todo =>
        todo && todo.id === todoId
          ? { ...todo, trackingStartedAt: Date.now() }
          : todo
      )
    })));
    setActiveTodoId(todoId);
  };

  const activeTodo = dayTodos
    .flatMap(d => d.todos || [])
    .find(t => t && t.id === activeTodoId);

  // ── Todos Hub handlers ─────────────────────────────────────────────────────
  // The hub spans every day plus the UNDATED bucket, so these operate across the
  // whole dayTodos array rather than a single day.

  const hubBucketKey = (date: string | null) => date ?? UNDATED;

  // Save an edited hub todo, moving it between date buckets (incl. UNDATED) when
  // its date changes. Mirrors the move/update logic used by the daily view.
  const handleHubSaveTodo = (oldDate: string | null, newDate: string | null, updatedTodo: Todo) => {
    const from = hubBucketKey(oldDate);
    const to = hubBucketKey(newDate);
    setDayTodos(prev => {
      if (from === to) {
        return prev.map(d => d.date === to
          ? { ...d, todos: (d.todos || []).map(t => t && t.id === updatedTodo.id ? updatedTodo : t) }
          : d
        );
      }
      const withoutOld = prev.map(d => d.date === from
        ? { ...d, todos: (d.todos || []).filter(t => t && t.id !== updatedTodo.id) }
        : d
      );
      const existingTo = withoutOld.find(d => d.date === to);
      return existingTo
        ? withoutOld.map(d => d.date === to ? { ...d, todos: [...(d.todos || []), updatedTodo] } : d)
        : [...withoutOld, { date: to, todos: [updatedTodo] }];
    });
  };

  // Create a fresh undated database todo at the bottom of the hub. An optional
  // parentId nests it as a subtask of an existing todo.
  const addHubTodo = (parentId: string | null) => {
    const maxOrder = dayTodos
      .flatMap(d => d.todos || [])
      .reduce((m, t) => Math.max(m, t?.hubOrder ?? 0), 0);
    const newTodo: Todo = {
      id: Math.random().toString(36).substr(2, 9),
      text: '',
      completed: false,
      showInDatabase: true,
      ...(parentId ? { parentId } : {}),
      hubOrder: maxOrder + 1,
      createdAt: Date.now(),
    };
    setDayTodos(prev => {
      const existing = prev.find(d => d.date === UNDATED);
      return existing
        ? prev.map(d => d.date === UNDATED ? { ...d, todos: [...(d.todos || []), newTodo] } : d)
        : [...prev, { date: UNDATED, todos: [newTodo] }];
    });
  };
  const handleHubAddTodo = () => addHubTodo(null);
  const handleAddSubtask = (parentId: string) => addHubTodo(parentId);

  // Remove a todo entirely (cascading to its subtasks).
  const handleDeleteTodoById = (id: string) => {
    setDayTodos(prev => {
      const all = prev.flatMap(d => d.todos || []).filter(Boolean) as Todo[];
      const toRemove = collectWithDescendants(all, id);
      return prev.map(d => ({ ...d, todos: (d.todos || []).filter(t => t && !toRemove.has(t.id)) }));
    });
    if (activeTodoId === id) setActiveTodoId(null);
  };

  // Archive a todo (and its subtasks): hides them from the hub.
  const handleArchiveTodo = (id: string) => {
    setDayTodos(prev => {
      const all = prev.flatMap(d => d.todos || []).filter(Boolean) as Todo[];
      const toArchive = collectWithDescendants(all, id);
      return prev.map(d => ({
        ...d,
        todos: (d.todos || []).map(t => t && toArchive.has(t.id) ? { ...t, archived: true } : t),
      }));
    });
  };

  // Persist hub order + nesting: assign hubOrder by position and set parentId.
  const handleReorderHubTodos = (items: { id: string; parentId: string | null }[]) => {
    const map = new Map(items.map((it, i) => [it.id, { order: i, parentId: it.parentId }]));
    setDayTodos(prev => prev.map(d => ({
      ...d,
      todos: (d.todos || []).map(t => {
        const u = t && map.get(t.id);
        return u ? { ...t, hubOrder: u.order, parentId: u.parentId } : t;
      }),
    })));
  };

  // Every tag in use, for hub/full-view autocomplete.
  const allTags = useMemo(
    () => Array.from(
      new Set(dayTodos.flatMap(d => (d.todos || []).flatMap(t => (t && t.tags) || [])))
    ).sort(),
    [dayTodos]
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

      <div className={`transition-all duration-500 ${!isFullscreen ? 'pl-20' : 'pl-0'}`}>
        {/* Header */}
          {!isFullscreen && activeView === 'trackers' && (
            <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-md border-bottom border-white/5">
              <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-black transition-colors ${activeView === 'trackers' ? 'bg-[var(--accent1)]' : 'bg-[var(--accent2)]'}`}>
                    {activeView === 'trackers' ? <Clock size={24} strokeWidth={2.5} /> : <Plus size={24} strokeWidth={2.5} />}
                  </div>
                  <h1 className="text-xl font-bold tracking-tight leading-none">
                    {activeView === 'trackers' ? 'Dunzo' : 'Objectives'}
                  </h1>
                </div>

                <div className="flex items-center gap-4">
                  {activeView === 'trackers' && (
                    <div className="hidden sm:flex bg-white/5 rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-[var(--accent1)]' : 'text-white/40 hover:text-white'}`}
                      >
                        <LayoutGrid size={18} />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white/10 text-[var(--accent1)]' : 'text-white/40 hover:text-white'}`}
                      >
                        <List size={18} />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="p-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl transition-all"
                    title="Fullscreen Mode"
                  >
                    <Maximize2 size={18} />
                  </button>

                  {activeView === 'trackers' && (
                    <button
                      onClick={() => {
                        setEditingTracker(null);
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-2 bg-[var(--accent1)] hover:opacity-90 text-black px-5 py-2.5 rounded-xl font-bold text-sm transition-all transform active:scale-95 shadow-lg shadow-[var(--accent1)]/10"
                    >
                      <Plus size={18} strokeWidth={3} />
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
                />
              </div>
            ) : activeView === 'hub' ? (
              <div key="hub-view" className="h-screen">
                <TodosHubView
                  dayTodos={dayTodos}
                  allTags={allTags}
                  onSaveTodo={handleHubSaveTodo}
                  onAddTodo={handleHubAddTodo}
                  onAddSubtask={handleAddSubtask}
                  onDeleteTodo={handleDeleteTodoById}
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
