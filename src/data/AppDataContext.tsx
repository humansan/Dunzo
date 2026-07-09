import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DayTodos, Todo, Tracker } from '../types';
import { UNDATED, todoIndex, collectionOptions, collectWithDescendants, normalizeVisibility, getOrganizerTodos } from '../utils/todoFilters';
import { toggledStatus } from '../utils/todoStatus';
import { authClient } from '../auth';
import { queryClient } from './queryClient';
import { useTodos, useCreateTodo, useUpdateTodo, useDeleteTodo, useBatchTodos } from './todos';
import { useTrackers, useCreateTracker, useUpdateTracker, useDeleteTracker } from './trackers';
import { useWorkspaces, useCreateWorkspace, useRenameWorkspace } from './workspaces';
import { useSettings, useUpdateSettings } from './settings';
import { applyTheme, type ThemeMode } from '../theme/applyTheme';
import { DEFAULT_THEME_ID } from '../theme/themes';
import { DEFAULT_COLLECTION_SLOT } from '../components/todosHub/constants';


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

// The data/handler bridge: everything that used to live in App.tsx's body, mounted
// once by `_authed.tsx` so every route reads it via `useAppData()`. Decomposed into
// feature hooks later (migration step 7).
function useProvideAppData() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Real Neon Auth session. The app is gated on this (see AppShell): server
  // data loads only once authenticated.
  const authSession = authClient.useSession();
  const sessionPending = authSession.isPending;
  const isAuthenticated = !!authSession.data;

  // Defense in depth against cross-account data leaks: whenever the signed-in
  // user identity changes (sign-out, or token swap from another tab), drop the
  // entire query cache so no resident data from the previous user can be served
  // under the global (non-user-scoped) query keys. The logout handler also clears
  // explicitly, but this catches every session transition.
  //
  // The first resolve of useSession() (undefined → id) is NOT such a transition:
  // there is no previous user, and the _authed loader already prefetched with this
  // user's token. Clearing there would evict that warm cache mid-mount, so every
  // cold load would render one frame with empty todos — long enough for the
  // "collection is gone" / "task is gone" effects downstream to bounce a deep link
  // back to /planner or out of the app entirely.
  const userId = authSession.data?.user?.id;
  const prevUserId = useRef(userId);
  useEffect(() => {
    if (prevUserId.current === userId) return;
    if (prevUserId.current !== undefined) queryClient.clear();
    prevUserId.current = userId;
  }, [userId]);

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

  // True once the server has actually answered for the data a URL can point at.
  // `todos` / `workspaces` are `data ?? []`, so they read "empty" while loading or
  // erroring — indistinguishable from "this collection/task really was deleted".
  // Anything that reacts to a missing id by navigating away must wait for this.
  const isDataReady =
    todosQuery.isSuccess && workspacesQuery.isSuccess && settingsQuery.isSuccess;

  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const setWeekStartsOn = (v: number) => updateSettings({ weekStartsOn: v });
  const countdownMode = settings?.countdownMode ?? 'off';
  const setCountdownMode = (v: 'off' | 'time' | 'percent') => updateSettings({ countdownMode: v });
  const xpEnabled = settings?.xpEnabled ?? true;
  const setXpEnabled = (v: boolean) => updateSettings({ xpEnabled: v });
  // Color theme + dark/light mode (DB-synced; applied to CSS vars by the effect below).
  const themeId = settings?.themeId ?? DEFAULT_THEME_ID;
  const setThemeId = (id: string) => updateSettings({ themeId: id });
  const mode: ThemeMode = settings?.mode ?? 'dark';
  const setMode = (m: ThemeMode) => updateSettings({ mode: m });

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
    // Only act on a CONFIRMED successful fetch of both queries. `workspaces` is
    // `data ?? []`, which also reads empty when a fetch ERRORS (data === undefined)
    // — e.g. a transient GET failure while the dev server restarts, or a 401
    // during token bootstrap. Gating on isLoading alone let those blips seed a
    // duplicate empty "Personal" workspace every time. isSuccess is only true once
    // the server actually returned a list (and stays true with retained data
    // across background refetches), so we never seed off an unconfirmed empty.
    if (!workspacesQuery.isSuccess || !settingsQuery.isSuccess) return;
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
  }, [isAuthenticated, workspacesQuery.isSuccess, settingsQuery.isSuccess, workspaces, activeWorkspaceId]);

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

  // Theme + mode are DB-synced; this effect reflects them onto the CSS variables.
  // applyTheme writes the role/color tokens (--color-*/--c-*), the theme-owned accents
  // (--accent1/2), and toggles `.dark`. When mode === 'system', re-apply on OS change.
  useEffect(() => {
    applyTheme(themeId, mode);
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(themeId, mode);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeId, mode]);

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

  // Open the AddTracker modal for a brand-new tracker.
  const openTrackerModal = () => {
    setEditingTracker(null);
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
    const upserts = todosForDate.map((t, i) => normalizeVisibility({ ...t, dueDate, dailyOrder: i }));
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
    updateTodo.mutate({ id: updatedTodo.id, patch: normalizeVisibility({ ...updatedTodo, dueDate, dailyOrder: maxDailyOrder + 1 }) });
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
    updateTodo.mutate({ id: updatedTodo.id, patch: normalizeVisibility({ ...updatedTodo, dueDate }) });
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
    createTodo.mutate(normalizeVisibility(newTodo));
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
      color: DEFAULT_COLLECTION_SLOT,
      parentId,
      workspaceId,
      hubOrder: maxOrder + 1,
      createdAt: Date.now(),
    };
    createTodo.mutate(normalizeVisibility(newCollection));
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

  // ── Global task search (⌘/Ctrl+K or the ribbon Search button) ────────────────
  // Search lives at the app level so it's reachable from every view. It scopes to
  // the active workspace's tasks; opening a result shows its full view (rendered
  // by AppShell).
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchEntries = useMemo(
    () => getOrganizerTodos(dayTodos).filter((e) => (e.todo.workspaceId ?? 'personal') === activeWorkspaceId),
    [dayTodos, activeWorkspaceId]
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const logout = async () => {
    await authClient.signOut();
    // Evict all cached data so the previous account's todos/trackers/etc.
    // can never be shown to the next account that signs in. The session goes
    // null, so AppShell's redirect-out effect routes to /login (closing /settings).
    queryClient.clear();
  };

  return {
    // session + gates (data pending/error is owned by the _authed route loader now)
    authSession,
    sessionPending,
    isAuthenticated,
    isDataReady,
    // data
    todos,
    trackers,
    workspaces,
    dayTodos,
    todoById,
    hubCollectionOptions,
    // settings/prefs
    themeId, setThemeId,
    mode, setMode,
    weekStartsOn, setWeekStartsOn,
    countdownMode, setCountdownMode,
    xpEnabled, setXpEnabled,
    activeWorkspaceId, setActiveWorkspaceId,
    addWorkspace, renameWorkspace,
    // active todo tracker
    activeTodoId, setActiveTodoId, activeTodo,
    // todo/hub handlers
    handleUpdateTodos,
    handleMoveTodo,
    handleToggleTodo,
    handleToggleAndClose,
    handleStartTracking,
    handleHubSaveTodo,
    handleHubAddTodo,
    handleAddSubtask,
    createCollection,
    addHubCollection,
    setTaskCollection,
    handleDeleteTodoById,
    handleArchiveTodo,
    handleDeleteCollection,
    handleReorderHubTodos,
    // tracker handlers + modal state
    handleAddTracker,
    handleDeleteTracker,
    handleEditTracker,
    openTrackerModal,
    isModalOpen, setIsModalOpen,
    editingTracker, setEditingTracker,
    // account (the settings route reads these)
    logout,
    // global task search
    isSearchOpen, setIsSearchOpen,
    searchEntries,
    // shell UI state
    isFullscreen, setIsFullscreen,
  };
}

export type AppData = ReturnType<typeof useProvideAppData>;

const AppDataContext = createContext<AppData | null>(null);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useProvideAppData();
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within an AppDataProvider');
  return ctx;
}
