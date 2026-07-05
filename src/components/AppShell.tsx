import { useEffect } from 'react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Minimize2 } from 'lucide-react';
import { AddTrackerModal } from './AddTrackerModal';
import { LoadingScreen } from './LoadingScreen';
import { Sidebar } from './Sidebar';
import { StopwatchWidget } from './StopwatchWidget';
import { StopwatchFullscreen } from './StopwatchFullscreen';
import { TaskFinder } from './todosHub/TaskFinder';
import { useAppData } from '../data/AppDataContext';

// The persistent shell: the chrome (Sidebar + modals + stopwatch + search) renders
// once and only the routed <Outlet/> changes, so sibling views never remount. Also
// keeps the current auth/data gating (converted to a route boundary in step 2).
export const AppShell: React.FC = () => {
  const {
    sessionPending,
    isAuthenticated,
    isFullscreen, setIsFullscreen,
    isStopwatchVisible, setIsStopwatchVisible,
    isStopwatchFullscreen, setIsStopwatchFullscreen,
    timerState, elapsed,
    startTimer, pauseTimer, stopTimer, resetTimer,
    isModalOpen, setIsModalOpen,
    editingTracker, setEditingTracker,
    handleAddTracker,
    // global search
    isSearchOpen, setIsSearchOpen,
    searchEntries,
    todoById,
    handleHubSaveTodo,
    handleToggleTodo,
  } = useAppData();

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Fullscreen is a trackers-only affordance; leaving that view exits it (matches
  // the old handleViewChange behavior).
  const isTrackers = pathname.startsWith('/trackers');
  useEffect(() => {
    if (!isTrackers && isFullscreen) setIsFullscreen(false);
  }, [isTrackers, isFullscreen, setIsFullscreen]);

  // Auth is a route boundary now (`_authed` beforeLoad). A *confirmed* sign-out
  // while inside the app — logout or a mid-session token expiry surfaced by the
  // window-focus revalidation — routes back to /login. This replaces the old
  // `!isAuthenticated → AuthModal` render gate that used to live here.
  const router = useRouter();
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
    <div className={`${lockHeight ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-neutral-950 text-white font-sans selection:bg-[var(--accent1)] selection:text-black`}>
      <Sidebar
        isVisible={!isFullscreen && !isStopwatchFullscreen}
        isAuthenticated={isAuthenticated}
        onAccountClick={() => router.history.push('/settings')}
        onStopwatchClick={() => setIsStopwatchVisible(v => !v)}
        isStopwatchActive={timerState !== 'idle'}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      <div className={`transition-all duration-500 ${!isFullscreen ? 'pl-14' : 'pl-0'}`}>
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
          result navigates to the shared /task/$taskId route. */}
      {isSearchOpen && (
        <TaskFinder
          entries={searchEntries}
          todoById={todoById}
          onSaveTodo={handleHubSaveTodo}
          onToggleTodo={handleToggleTodo}
          onPick={(id) => { router.history.push('/task/' + encodeURIComponent(id)); setIsSearchOpen(false); }}
          onClose={() => setIsSearchOpen(false)}
        />
      )}

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
};
