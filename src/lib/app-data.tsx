// The app-wide data/handler bridge. It is the one module that breaks the layering
// rule in both directions: it imports the tasks/trackers query layers (upward),
// while ~10 modules across features, routes and theme call useAppData() (downward).
//
// It can't be split into a low-level context + a high-level provider, because
// `AppData` is `ReturnType<typeof useProvideAppData>` - the type is derived from
// the provider's implementation. It sits in `lib/` rather than `app/providers/`
// because that direction has 2 violating edges instead of ~10.
//
// The real fix is the decomposition this file already promises below: split it
// into per-feature hooks, at which point the context shrinks to shell UI state
// and each feature reads its own queries directly.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DayTodos, Todo, Tracker } from '@shared/types';
import { UNDATED, todoIndex, collectionOptions, collectWithDescendants, normalizeVisibility, getOrganizerTodos, getSearchableTodos, inWorkspace } from '@/features/tasks/model';
import { normalizeCompletion, toggledStatus, isDone, reconcileSchedule, reconcileArchived, descendantsToArchive, ancestorsToUnarchive, descendantsToUnarchive } from '@/features/tasks/model';
import { format } from 'date-fns';
import { authClient } from '@/lib/auth';
import { queryClient } from '@/lib/query/queryClient';
import { useTodos, useCreateTodo, useUpdateTodo, useDeleteTodo, useBatchTodos } from '@/features/tasks/api';
import { useTrackers, useCreateTracker, useUpdateTracker, useDeleteTracker } from '@/features/trackers/api';
import { useWorkspaces, useCreateWorkspace, useRenameWorkspace } from '@/lib/query/workspaces';
import { useSettings, useUpdateSettings } from '@/lib/query/settings';
import { applyTheme, type ThemeMode } from '@/theme/applyTheme';
import { DEFAULT_THEME_ID } from '@/theme/themes';
import { DEFAULT_COLLECTION_SLOT } from '@/theme/collectionColor';
import { buildSeedTrackers } from '@/lib/onboarding';
import { useFieldCascadeConfirm, type CascadeField } from '@/lib/useFieldCascadeConfirm';


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
  // cold load would render one frame with empty todos - long enough for the
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
  // erroring - indistinguishable from "this collection/task really was deleted".
  // Anything that reacts to a missing id by navigating away must wait for this.
  const isDataReady =
    todosQuery.isSuccess && workspacesQuery.isSuccess && settingsQuery.isSuccess;

  const weekStartsOn = settings?.weekStartsOn ?? 1;
  const setWeekStartsOn = (v: number) => updateSettings({ weekStartsOn: v });
  const countdownMode = settings?.countdownMode ?? 'off';
  const setCountdownMode = (v: 'off' | 'time' | 'percent') => updateSettings({ countdownMode: v });
  const xpEnabled = settings?.xpEnabled ?? true;
  const setXpEnabled = (v: boolean) => updateSettings({ xpEnabled: v });
  // Per-task XP chip visibility (independent of the XP bar/streaks above).
  const showXpChips = settings?.showXpChips ?? true;
  const setShowXpChips = (v: boolean) => updateSettings({ showXpChips: v });
  // Default XP seeded onto new daily-list tasks: undefined ⇒ 1, 0 ⇒ None, 1–5 ⇒ value.
  const defaultDailyXp = settings?.defaultDailyXp ?? 3;
  const setDefaultDailyXp = (v: number) => updateSettings({ defaultDailyXp: v });
  // Cross-surface default for new tasks (undefined ⇒ true, the legacy both-on
  // behavior). Applied only at creation time in addHubTodo / DailyScreen.buildTodo.
  const plannerTasksInDailyList = settings?.plannerTasksInDailyList ?? true;
  const setPlannerTasksInDailyList = (v: boolean) => updateSettings({ plannerTasksInDailyList: v });
  const dailyTasksInPlanner = settings?.dailyTasksInPlanner ?? true;
  const setDailyTasksInPlanner = (v: boolean) => updateSettings({ dailyTasksInPlanner: v });
  // Default auto-move-date flag seeded onto NEW daily-list tasks (undefined ⇒ false).
  // Planner-created tasks default off regardless of this setting.
  const defaultAutoMoveDate = settings?.defaultAutoMoveDate ?? false;
  const setDefaultAutoMoveDate = (v: boolean) => updateSettings({ defaultAutoMoveDate: v });
  // Color theme + dark/light mode (DB-synced; applied to CSS vars by the effect below).
  const themeId = settings?.themeId ?? DEFAULT_THEME_ID;
  const setThemeId = (id: string) => updateSettings({ themeId: id });
  const mode: ThemeMode = settings?.mode ?? 'dark';
  const setMode = (m: ThemeMode) => updateSettings({ mode: m });

  // ── Task Planner workspaces (independent todo databases) ───────────────────
  // The workspace list is server data; activeWorkspaceId is now a DB-synced pref
  // (cross-device "last workspace"). There is no fixed 'personal' id anymore - a
  // new user is seeded a "Personal" workspace below (workspace id is a global PK).
  const activeWorkspaceId = settings?.activeWorkspaceId ?? '';
  const setActiveWorkspaceId = (id: string) => updateSettings({ activeWorkspaceId: id });

  // First-run seeding + keep activeWorkspaceId valid once data has loaded.
  // "No workspace at all" is the one signal that means a genuinely new account:
  // every other collection is user-deletable, so seeding off an empty todo or
  // tracker list would resurrect content the user threw away.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) { seededRef.current = false; return; }
    // Only act on a CONFIRMED successful fetch of both queries. `workspaces` is
    // `data ?? []`, which also reads empty when a fetch ERRORS (data === undefined)
    // - e.g. a transient GET failure while the dev server restarts, or a 401
    // during token bootstrap. Gating on isLoading alone let those blips seed a
    // duplicate empty "Personal" workspace every time. isSuccess is only true once
    // the server actually returned a list (and stays true with retained data
    // across background refetches), so we never seed off an unconfirmed empty.
    // The trackers query is gated on too (not just used) so the seed below can
    // trust `trackers`: a still-loading list also reads as `[]`, and seeding off
    // that would duplicate the widgets on an account whose workspace create failed.
    if (!workspacesQuery.isSuccess || !settingsQuery.isSuccess || !trackersQuery.isSuccess) return;
    if (workspaces.length === 0) {
      if (seededRef.current) return;
      seededRef.current = true;
      const id = Math.random().toString(36).substr(2, 9);
      createWorkspace.mutate({ id, name: 'Personal' });
      setActiveWorkspaceId(id);
      // Onboarding content for a brand-new account (see @/lib/onboarding): the
      // starter time widgets, so the app isn't blank on first sign-in.
      if (trackers.length === 0) for (const t of buildSeedTrackers()) createTracker.mutate(t);
      // No view config is seeded: "hide completed tasks" is a code default in
      // resolveViewFilters, so it holds for every account and every workspace
      // without depending on a write here having succeeded.
      return;
    }
    if (!workspaces.some(w => w.id === activeWorkspaceId)) {
      setActiveWorkspaceId(workspaces[0].id);
    }
  }, [isAuthenticated, workspacesQuery.isSuccess, settingsQuery.isSuccess, trackersQuery.isSuccess, workspaces, trackers, activeWorkspaceId]);

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

  // Next free Planner order: one past the highest one in use. EVERY task must
  // carry a hubOrder. The Planner sorts siblings by `hubOrder ?? createdAt`, and
  // those two don't share a scale (an index vs epoch ms), so a task without one
  // sinks below every ordered task while this max ignores it - which is what made
  // a section's "+" drop the new task above such tasks instead of at the end.
  const nextHubOrder = () => todos.reduce((m, t) => Math.max(m, t?.hubOrder ?? 0), 0) + 1;

  // ── Daily-list writes ───────────────────────────────────────────────────────
  // These replaced a single `handleUpdateTodos(date, todos[])` that re-saved a
  // whole day at once. That signature made the array authoritative, so ANY todo on
  // that day missing from it was deleted - which meant a field edit carried an
  // implicit "and delete anything I didn't mention", and every caller had to
  // remember to pass rows it wasn't even editing (see the daily reorder, which
  // hand-appended the day's hidden planner tasks purely to keep them alive). Each
  // operation now says what it is: save one row, create one row, order the day,
  // delete one row. Nothing deletes by omission.

  // Set the within-day order. Ids only - this never touches a task's fields, so it
  // can't collide with an edit in flight.
  const handleReorderDay = (orderedIds: string[]) => {
    if (!orderedIds.length) return;
    batchTodos.mutate({ patches: orderedIds.map((id, i) => ({ id, dailyOrder: i })) });
  };

  // Create `todo` on `date` and set the day's order, in ONE batch. The row goes as
  // an upsert and the order as patches; the server applies upserts before patches
  // inside one transaction, so the ordering can never reference a row that doesn't
  // exist yet (the create-then-reorder race that a second request would open).
  const handleCreateInDay = (date: string, todo: Todo, orderedIds: string[]) => {
    const dueDate = date && date !== UNDATED ? date : undefined;
    // Daily-created tasks are built by the daily screen, not addHubTodo, so they
    // arrive without a Planner order - hand out the next one (see nextHubOrder).
    const upsert = reconcileSchedule(
      normalizeCompletion(
        normalizeVisibility({ ...todo, dueDate, hubOrder: todo.hubOrder ?? nextHubOrder() })
      )
    );
    batchTodos.mutate({
      upserts: [upsert],
      patches: orderedIds.map((id, i) => ({ id, dailyOrder: i })),
    });
  };

  // Rescheduling is just a save whose dueDate happens to differ, so there is no
  // separate move handler: writeHubTodo below derives the new day's position
  // itself. It used to be its own path, which meant the SAME edit behaved
  // differently depending on which screen made it - the daily list and the
  // calendar landed a rescheduled task at the bottom of its new day, while the
  // planner's Set-date and the full view left it with a stale dailyOrder and it
  // dropped in at an arbitrary spot. Worse, that path recomputed the order
  // unconditionally, so every caller had to guard it with its own "did the date
  // actually change?" test.
  // Auto-move-date sweep: reschedule any incomplete task whose dueDate has passed
  // and that carries the autoMoveDate flag onto today, so it keeps rolling forward
  // until completed. Runs at most once per local calendar day per mount (the ref
  // guard); swept tasks land on today and stop matching, so it converges. "Today"
  // is the user's LOCAL date - the reason this lives client-side rather than a cron.
  const sweptDateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isDataReady) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    if (sweptDateRef.current === today) return;

    const overdue = todos.filter(
      (t) =>
        t &&
        t.autoMoveDate === true &&
        !isDone(t) &&
        !!t.dueDate &&
        t.dueDate !== UNDATED &&
        t.dueDate < today
    );
    // Record the pass even when empty - we've checked for today.
    sweptDateRef.current = today;
    if (overdue.length === 0) return;

    // Land the moved tasks at the bottom of today's list, preserving their order.
    const overdueIds = new Set(overdue.map((t) => t.id));
    let nextOrder =
      todos
        .filter((t) => t && bucketKeyOf(t) === today && !overdueIds.has(t.id))
        .reduce((m, t) => Math.max(m, t.dailyOrder ?? 0), -1) + 1;
    const patches = overdue.map((t) => ({ id: t.id, dueDate: today, dailyOrder: nextOrder++ }));
    batchTodos.mutate({ patches });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDataReady, todos]);

  // ── Status / priority cascade ───────────────────────────────────────────────
  // Changing either on a task with subtasks asks whether it applies to them too
  // (see useFieldCascadeConfirm). Both handlers below are the chokepoints every
  // edit in the app reaches - the row cells, the cell popover, the full view, the
  // grouped-view drag reassignment, the daily row menu, and every checkbox - so
  // this is the only place that needs to know about it.
  const { askFieldCascade, fieldCascadeModal } = useFieldCascadeConfirm();

  // The task descendants of `id`: the rows a cascade could reach. Collections are
  // excluded - they carry neither status nor priority.
  const taskDescendantsOf = (id: string): string[] =>
    [...collectWithDescendants(todos.filter(Boolean) as Todo[], id)].filter(
      (tid) => tid !== id && !todoById.get(tid)?.isCollection
    );
  const patchMany = (ids: string[], patch: Partial<Todo>) => {
    if (ids.length) batchTodos.mutate({ patches: ids.map((id) => ({ id, ...patch })) });
  };

  // Wrap any whole-todo write with the cascade question, so a save and a
  // reschedule can't disagree about it: the daily quick-editor sends BOTH through
  // one payload, and routing on "did the date change" used to decide whether the
  // status change in that same payload got asked about.
  const saveWithCascade = (updatedTodo: Todo, write: () => void) => {
    const prev = todoById.get(updatedTodo.id);
    // Status is checked first so an edit that moved both asks about the more
    // consequential one; the other field still saves on this task either way,
    // since `write` persists the whole todo.
    const field: CascadeField | null =
      prev && prev.status !== updatedTodo.status
        ? 'status'
        : prev && prev.priority !== updatedTodo.priority
          ? 'priority'
          : null;
    if (!field || updatedTodo.isCollection) {
      write();
      return;
    }
    const value = field === 'status'
      ? { status: updatedTodo.status, completedAt: normalizeCompletion(updatedTodo).completedAt }
      : { priority: updatedTodo.priority };
    askFieldCascade({
      field,
      name: updatedTodo.text || 'Untitled',
      descendantIds: taskDescendantsOf(updatedTodo.id),
      applySelf: write,
      applyToDescendants: (ids) => patchMany(ids, value),
    });
  };

  const handleToggleTodo = (todoId: string) => {
    const todo = todos.find(t => t && t.id === todoId);
    if (!todo) return;
    // Status is the source of truth. The server stamps completedAt, but its reply
    // never reaches the cache (mutations invalidate without refetching), so mirror
    // the stamp client-side - otherwise completedAt stays undefined until the next
    // natural refetch and the completion timestamp renders as absent.
    const { status, completedAt } = normalizeCompletion({ ...todo, status: toggledStatus(todo) });
    const applySelf = () => {
      updateTodo.mutate({ id: todoId, patch: { status, completedAt } });
      // If we're toggling the active todo, close the tracker
      if (activeTodoId === todoId) {
        setActiveTodoId(null);
      }
    };
    // Ticking the checkbox is a status change like any other, so it takes the same
    // route. Subtasks inherit the parent's completedAt, so a subtree completed in
    // one click shares one timestamp.
    askFieldCascade({
      field: 'status',
      name: todo.text || 'Untitled',
      descendantIds: taskDescendantsOf(todoId),
      applySelf,
      applyToDescendants: (ids) => patchMany(ids, { status, completedAt }),
    });
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
  const writeHubTodo = (updatedTodo: Todo) => {
    const dueDate = updatedTodo.dueDate && updatedTodo.dueDate !== UNDATED ? updatedTodo.dueDate : undefined;
    // reconcileArchived here too: without it an edit could park an illegal row in
    // the optimistic cache (the server corrects the write, but onSettled doesn't
    // refetch, so the wrong row would stay on screen until some later refetch).
    const parent = updatedTodo.parentId ? todoById.get(updatedTodo.parentId) : undefined;
    // Hand out a Planner order if the task somehow lacks one. Daily-created tasks
    // used to get theirs from handleUpdateTodos' whole-day pass, which a field edit
    // no longer goes through; a null hubOrder sorts by createdAt on a different
    // scale entirely, which is the bug 0006_backfill_hub_order existed to clean up.
    const hubOrder = updatedTodo.hubOrder ?? nextHubOrder();
    // A save that MOVES the task to another day also gives it a place in that day:
    // the bottom, like anything newly arriving there. Its old dailyOrder is an index
    // into a list it just left, so keeping it would drop the task at an arbitrary
    // spot among its new neighbours. Derived here from the todo's own before/after
    // date rather than asked for by the caller, so every surface reschedules the
    // same way and nobody has to remember to request it.
    const prevBucket = todoById.get(updatedTodo.id)?.dueDate ?? undefined;
    const movedDay = bucketKeyOf({ ...updatedTodo, dueDate }) !== bucketKeyOf({ ...updatedTodo, dueDate: prevBucket });
    const dailyOrder = movedDay
      ? todos
          .filter((t) => t && bucketKeyOf(t) === bucketKeyOf({ ...updatedTodo, dueDate }) && t.id !== updatedTodo.id)
          .reduce((m, t) => Math.max(m, t.dailyOrder ?? 0), -1) + 1
      : updatedTodo.dailyOrder;
    updateTodo.mutate({
      id: updatedTodo.id,
      patch: reconcileArchived(
        reconcileSchedule(normalizeCompletion(normalizeVisibility({ ...updatedTodo, dueDate, hubOrder, dailyOrder }))),
        parent
      ),
    });
  };

  const handleHubSaveTodo = (updatedTodo: Todo) =>
    saveWithCascade(updatedTodo, () => writeHubTodo(updatedTodo));

  // Create a fresh database todo at the bottom of the hub. An optional parentId
  // nests it as a subtask. `opts` lets a quick-add seed the task with attributes
  // (status/priority via `patch`) and/or a scheduled day (`date`) - used by the
  // grouped-view section "+" buttons so the new task lands in that section.
  const addHubTodo = (
    parentId: string | null,
    opts?: { date?: string | null; patch?: Partial<Todo> }
  ): string => {
    const id = Math.random().toString(36).substr(2, 9);
    // An explicit group-create date wins over anything in the patch (e.g. a date
    // filter); when none is given we keep whatever dueDate the patch carries.
    const dueDate = opts?.date && opts.date !== UNDATED ? opts.date : undefined;
    const newTodo: Todo = {
      id,
      text: '',
      showInDatabase: true,
      showInDailyList: plannerTasksInDailyList,
      workspaceId: activeWorkspaceId,
      ...(parentId ? { parentId } : {}),
      hubOrder: nextHubOrder(),
      createdAt: Date.now(),
      status: "todo",
      ...(opts?.patch ?? {}),
      ...(dueDate !== undefined ? { dueDate } : {}),
    };
    // reconcileArchived: a task created inside an archived parent is archived with
    // it, so it can never be a live child of an archived row (see
    // shared/domain/todoArchive). The server enforces the same rule authoritatively;
    // doing it here keeps the optimistic row honest instead of showing it live for
    // a beat and then having it change under the user.
    const parent = parentId ? todoById.get(parentId) : undefined;
    createTodo.mutate(
      reconcileArchived(reconcileSchedule(normalizeCompletion(normalizeVisibility(newTodo))), parent)
    );
    return id;
  };
  const handleHubAddTodo = (opts?: { date?: string | null; patch?: Partial<Todo>; parentId?: string | null }): string =>
    addHubTodo(opts?.parentId ?? null, opts);
  const handleAddSubtask = (parentId: string): string => addHubTodo(parentId);

  // A block drawn on the full calendar page is a dated, timed task. Like every
  // other new task it defaults to both surfaces (Planner + that day's daily
  // checklist); the only thing special here is the drawn start/due time.
  const handleCalendarAddTodo = (date: string, startTime: string, dueTime: string): string =>
    addHubTodo(null, {
      date,
      patch: {
        // A single-day timed block: start and due both live on the drawn day, so a
        // time never sits without its date (the schedule invariant).
        startDate: date,
        startTime,
        dueTime,
        showInDatabase: true,
        showInDailyList: true,
      },
    });

  // A block drawn on the DAILY screen's 1-day calendar is a daily-list task, so it
  // adopts the same creation defaults as a daily quick-add: always on the daily
  // checklist, Planner visibility follows `dailyTasksInPlanner`, and it seeds the
  // default XP (0/None ⇒ unset) and auto-move flag. The showInDatabase=false case
  // survives normalizeVisibility because the task has a date + showInDailyList.
  const handleDailyCalendarAddTodo = (date: string, startTime: string, dueTime: string): string =>
    addHubTodo(null, {
      date,
      patch: {
        // Start and due both live on the drawn day (see handleCalendarAddTodo).
        startDate: date,
        startTime,
        dueTime,
        showInDailyList: true,
        showInDatabase: dailyTasksInPlanner,
        autoMoveDate: defaultAutoMoveDate,
        ...(defaultDailyXp > 0 ? { xp: defaultDailyXp } : {}),
      },
    });

  // Create a collection with the given name (workspace-scoped), nested under
  // parentId when given, and return its id. Lives in the UNDATED bucket like
  // other database nodes.
  const createCollection = (
    name: string,
    workspaceId: string = activeWorkspaceId,
    parentId: string | null = null,
  ): string => {
    const id = Math.random().toString(36).substr(2, 9);
    const newCollection: Todo = {
      id,
      text: name,
      showInDatabase: true,
      isCollection: true,
      color: DEFAULT_COLLECTION_SLOT,
      parentId,
      workspaceId,
      hubOrder: nextHubOrder(),
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

  // Archive a todo and its whole subtree; unarchive it and its archived ancestors.
  // Both directions are one constraint - a live todo may not sit under an archived
  // one (shared/domain/todoArchive) - and neither can be expressed as a single-row
  // write, so both go out as one batch. The server re-derives the same set, so a
  // partial batch can't leave the tree half-archived.
  const handleArchiveTodo = (id: string) => {
    const ids = descendantsToArchive(todos.filter(Boolean) as Todo[], id);
    if (!ids.length) return;
    batchTodos.mutate({ patches: ids.map((tid) => ({ id: tid, archived: true })) });
  };

  // Archive several todos (each with its subtree) as ONE write - the planner's
  // "Archive completed tasks in view" button, which can reach dozens of rows. The
  // union is taken before the batch so a task that is both selected and a
  // descendant of another selected task is patched once, and so the count the
  // confirmation showed is the count that goes out.
  const handleArchiveTodos = (ids: string[]) => {
    const all = todos.filter(Boolean) as Todo[];
    const union = new Set<string>();
    for (const id of ids) for (const tid of descendantsToArchive(all, id)) union.add(tid);
    if (!union.size) return;
    batchTodos.mutate({ patches: [...union].map((tid) => ({ id: tid, archived: true })) });
  };

  // `mode` decides what happens BELOW the todo, which is a preference rather than
  // an invariant: 'self' restores just this row (its archived subtree stays put -
  // a legal state), 'subtree' restores everything archived inside it too. What
  // happens ABOVE is not a choice - the archived ancestors always come back, or
  // the result would be a live todo inside an archived one.
  const handleUnarchiveTodo = (id: string, mode: 'self' | 'subtree' = 'self') => {
    const all = todos.filter(Boolean) as Todo[];
    const ids = new Set(ancestorsToUnarchive(all, id));
    if (mode === 'subtree') for (const d of descendantsToUnarchive(all, id)) ids.add(d);
    if (!ids.size) return;
    batchTodos.mutate({ patches: [...ids].map((tid) => ({ id: tid, archived: false })) });
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
    // Reparent children (patches) before deleting the node (deletes) - the
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
  // Search lives at the app level so it's reachable from every view. It covers the
  // user's whole task set (inWorkspace is a no-op while workspaces are disabled -
  // see filters.ts); opening a result shows its full view (rendered by AppShell).
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Organizer-scoped set: the two-pane (table) search view groups tasks by their
  // collection, and the reparent/parent pickers choose a Planner task - both want
  // only tasks that live in the Task Planner.
  const searchEntries = useMemo(
    () => getOrganizerTodos(dayTodos).filter((e) => inWorkspace(e.todo, activeWorkspaceId)),
    [dayTodos, activeWorkspaceId]
  );
  // Broad set: the flat (list) search view searches every unarchived task, whether
  // it lives in the Planner, the daily list, or both - so a daily-list-only task is
  // still findable via ⌘/Ctrl+K.
  const searchFlatEntries = useMemo(
    () => getSearchableTodos(dayTodos).filter((e) => inWorkspace(e.todo, activeWorkspaceId)),
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
    showXpChips, setShowXpChips,
    defaultDailyXp, setDefaultDailyXp,
    plannerTasksInDailyList, setPlannerTasksInDailyList,
    dailyTasksInPlanner, setDailyTasksInPlanner,
    defaultAutoMoveDate, setDefaultAutoMoveDate,
    activeWorkspaceId, setActiveWorkspaceId,
    addWorkspace, renameWorkspace,
    // active todo tracker
    activeTodoId, setActiveTodoId, activeTodo,
    // todo/hub handlers
    handleReorderDay,
    handleCreateInDay,
    handleToggleTodo,
    handleToggleAndClose,
    handleStartTracking,
    handleHubSaveTodo,
    handleHubAddTodo,
    handleCalendarAddTodo,
    handleDailyCalendarAddTodo,
    handleAddSubtask,
    createCollection,
    addHubCollection,
    setTaskCollection,
    handleDeleteTodoById,
    handleArchiveTodo,
    handleArchiveTodos,
    handleUnarchiveTodo,
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
    searchFlatEntries,
    // shell UI state
    isFullscreen, setIsFullscreen,
    // Rendered by the provider, not by any one surface: a status/priority edit can
    // come from the planner, the daily list, the calendar or the full view, and
    // they all reach it through the two handlers above.
    fieldCascadeModal,
  };
}

export type AppData = ReturnType<typeof useProvideAppData>;

const AppDataContext = createContext<AppData | null>(null);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useProvideAppData();
  return (
    <AppDataContext.Provider value={value}>
      {children}
      {value.fieldCascadeModal}
    </AppDataContext.Provider>
  );
};

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within an AppDataProvider');
  return ctx;
}
