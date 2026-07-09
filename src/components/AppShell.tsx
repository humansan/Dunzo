import { useEffect } from 'react';
import { Outlet, useRouter, useRouterState, useSearch } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Minimize2 } from 'lucide-react';
import { AddTrackerModal } from './AddTrackerModal';
import { LoadingScreen } from './LoadingScreen';
import { Sidebar } from './Sidebar';
import { StopwatchWidget } from './StopwatchWidget';
import { ActiveTodoTracker } from './ActiveTodoTracker';
import { StopwatchFullscreen } from './StopwatchFullscreen';
import { SettingsOverlay } from './SettingsOverlay';
import { TaskOverlay } from './TaskOverlay';
import { TaskFinder } from './todosHub/TaskFinder';
import { useAppData } from '../data/AppDataContext';
import { useOverlayNav } from '../data/useOverlayNav';
import { useStopwatch } from '../data/StopwatchContext';

// The persistent shell: the chrome (Sidebar + modals + stopwatch + search) renders
// once and only the routed <Outlet/> changes, so sibling views never remount. Also
// keeps the current auth/data gating (converted to a route boundary in step 2).
export const AppShell: React.FC = () => {
  const {
    sessionPending,
    isAuthenticated,
    authSession,
    logout,
    isFullscreen, setIsFullscreen,
    isModalOpen, setIsModalOpen,
    editingTracker, setEditingTracker,
    handleAddTracker,
    // global search
    isSearchOpen, setIsSearchOpen,
    searchEntries,
    todoById,
    handleHubSaveTodo,
    handleToggleTodo,
    // active-task tracker (shares the bottom overlay slot with the stopwatch)
    activeTodo,
    activeTodoId,
    setActiveTodoId,
    handleToggleAndClose,
    countdownMode,
  } = useAppData();
  // Stopwatch is its own context so its 50ms tick doesn't re-render this shell.
  const {
    timerState,
    startTimer, pauseTimer, stopTimer, resetTimer,
    isStopwatchVisible, setIsStopwatchVisible,
    isStopwatchFullscreen, setIsStopwatchFullscreen,
  } = useStopwatch();

  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { openTask, openSettings } = useOverlayNav();

  // Overlays are search-param state on the current page (settings / task), so the
  // routed page under <Outlet/> stays mounted underneath. Closing pops the history
  // entry the open pushed (back button also closes); a masked deep-link reload is
  // handled by the standalone /settings and /task/$taskId routes instead.
  const { task: taskOverlayId, settings: settingsOverlayOpen } = useSearch({ from: '/_authed' });
  const closeOverlay = () => {
    if (window.history.length > 1) router.history.back();
    else router.navigate({ to: '.', search: (prev) => ({ ...prev, task: undefined, settings: undefined }) });
  };
  // Fullscreen is a trackers-only affordance; leaving that view exits it (matches
  // the old handleViewChange behavior).
  const isTrackers = pathname.startsWith('/trackers');
  useEffect(() => {
    if (!isTrackers && isFullscreen) setIsFullscreen(false);
  }, [isTrackers, isFullscreen, setIsFullscreen]);

  // The stopwatch widget and the active-task tracker share the bottom overlay
  // slot, so only one may be open: activating a task hides the stopwatch, and
  // opening the stopwatch clears the active task.
  useEffect(() => {
    if (activeTodoId) setIsStopwatchVisible(false);
  }, [activeTodoId, setIsStopwatchVisible]);

  const toggleStopwatch = () => {
    const next = !isStopwatchVisible;
    setIsStopwatchVisible(next);
    if (next) setActiveTodoId(null);
  };

  // Auth is a route boundary now (`_authed` beforeLoad). A *confirmed* sign-out
  // while inside the app — logout or a mid-session token expiry surfaced by the
  // window-focus revalidation — routes back to /login. This replaces the old
  // `!isAuthenticated → AuthModal` render gate that used to live here.
  useEffect(() => {
    if (!sessionPending && !isAuthenticated) router.history.push('/login');
  }, [sessionPending, isAuthenticated, router]);

  // ── Auth bootstrap: the beforeLoad guard already proved a session, so this only
  // shows a spinner while the in-component useSession() resolves on first mount;
  // it never renders the login form (that lives on /login). Once authenticated,
  // better-auth retains `data` across background revalidation, so this doesn't
  // flash on refocus. ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return <LoadingScreen message="Loading…" />;
  }
  // Data pending/error is owned by the `_authed` route loader now
  // (pendingComponent / errorComponent) — no render-time data gate here.

  // /today, /planner and /calendar are full-height scroll-locked surfaces; the rest
  // (/trackers, /stats) scroll the page. Derived from the route (was `activeView`).
  const lockHeight = pathname.startsWith('/today') || pathname.startsWith('/planner') || pathname.startsWith('/calendar');

  return (
    <div className={`${lockHeight ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-canvas text-fg font-sans selection:bg-[var(--accent1)] selection:text-canvas`}>
      <Sidebar
        isVisible={!isFullscreen && !isStopwatchFullscreen}
        isAuthenticated={isAuthenticated}
        email={authSession.data?.user?.email}
        onOpenSettings={openSettings}
        onLogout={logout}
        onStopwatchClick={toggleStopwatch}
        isStopwatchActive={timerState !== 'idle'}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      <div className={`transition-all duration-500 ${!isFullscreen ? 'pl-14' : 'pl-0'}`}>
        {/* Exit Fullscreen Button */}
        <AnimatePresence>
          {isFullscreen && (
            <div className="fixed bottom-0 right-0 z-50 w-40 h-40 flex items-end justify-end p-8 group">
              <button
                className="p-3 bg-fill hover:bg-fill-stronger backdrop-blur-xl text-fg-faint hover:text-fg rounded-full shadow-2xl border border-line transition-all opacity-0 group-hover:opacity-100"
                onClick={() => setIsFullscreen(false)}
                title="Exit Fullscreen"
              >
                <Minimize2 size={18} />
              </button>
            </div>
          )}
        </AnimatePresence>

        <Outlet />
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

      {/* Global task search (⌘/Ctrl+K or the ribbon Search button). Opening a
          result opens the task full-view overlay (masked to /task/$taskId). */}
      {isSearchOpen && (
        <TaskFinder
          entries={searchEntries}
          todoById={todoById}
          onSaveTodo={handleHubSaveTodo}
          onToggleTodo={handleToggleTodo}
          onPick={(id) => { openTask(id); setIsSearchOpen(false); }}
          onClose={() => setIsSearchOpen(false)}
        />
      )}

      {/* Overlays layered above the persistent page <Outlet/> — driven by search
          params so the page underneath never unmounts while they're open. */}
      {settingsOverlayOpen && <SettingsOverlay onClose={closeOverlay} />}
      {taskOverlayId && <TaskOverlay taskId={taskOverlayId} onClose={closeOverlay} />}

      {/* Bottom overlay slot — the stopwatch widget and the active-task tracker
          occupy the same spot, so at most one of them renders at a time. */}
      <AnimatePresence mode="wait">
        {isStopwatchVisible ? (
          <StopwatchWidget
            key="stopwatch"
            timerState={timerState}
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
        ) : activeTodo ? (
          <ActiveTodoTracker
            key="active-tracker"
            todo={activeTodo}
            countdownMode={countdownMode}
            onClose={() => setActiveTodoId(null)}
            onToggle={() => handleToggleAndClose(activeTodo.id)}
          />
        ) : null}
      </AnimatePresence>

      {/* Stopwatch Fullscreen */}
      <AnimatePresence>
        {isStopwatchFullscreen && (
          <StopwatchFullscreen
            timerState={timerState}
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
};
