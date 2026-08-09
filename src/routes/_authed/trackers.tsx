import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createFileRoute } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Clock, LayoutGrid, List, Maximize2, ListOrdered } from 'lucide-react';
import { TrackerCard, TrackerOrderMenu } from '@/features/trackers';
import { sortTrackers, moveTrackerId } from '@/features/trackers/model';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { btnGhost, btnNeutral, btnSwitch } from '../../theme/buttons';
import { useAppData } from '@/lib/app-data';
import { pageHead } from '@/lib/pageTitle';

export const Route = createFileRoute('/_authed/trackers')({
  head: () => pageHead('Trackers'),
  component: TrackersRoute,
  errorComponent: ViewErrorFallback,
});

function TrackersRoute() {
  const {
    trackers,
    handleDeleteTracker,
    handleEditTracker,
    handleReorderTrackers,
    openTrackerModal,
    isFullscreen, setIsFullscreen,
  } = useAppData();
  // Grid/list toggle is local to this view (no other view reads it).
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  // Anchor ({right, top}) of the Order menu, or null when closed.
  const [orderMenu, setOrderMenu] = useState<{ right: number; top: number } | null>(null);

  // The user's order - the same list the daily page's rail shows.
  const ordered = useMemo(() => sortTrackers(trackers), [trackers]);

  // A drag hands back the whole list in its new order; the mutation renumbers it.
  const moveTracker = (dragId: string, targetId: string, pos: 'before' | 'after') =>
    handleReorderTrackers(moveTrackerId(ordered.map((t) => t.id), dragId, targetId, pos));

  return (
    <>
      {/* Header */}
      {!isFullscreen && (
        <header className="sticky top-0 z-40 bg-canvas/80 backdrop-blur-md border-bottom border-line-subtle">
          <div className="max-w-5xl mx-auto px-6 pt-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg flex items-center justify-center transition-colors bg-fill`}>
                <Clock size={18} strokeWidth={2.5} className='text-fg' />
              </div>
              <h1 className="text-xl font-bold leading-none">
                Time Widgets
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex bg-fill-subtle rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded-md transition-colors ${viewMode === 'grid' ? btnSwitch(true) : btnSwitch()}`}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1 rounded-md transition-colors ${viewMode === 'list' ? btnSwitch(true) : btnSwitch()}`}
                >
                  <List size={18} strokeWidth={2.5} />
                </button>
              </div>

              {/* <button
                onClick={() => setIsFullscreen(true)}
                className={`p-2 rounded-lg ${btnNeutral}`}
                title="Fullscreen Mode"
              >
                <Maximize2 size={18} strokeWidth={2.5} />
              </button> */}

              {/* Anchored to the button's bottom-right, like the planner's
                  toolbar menus. Clicking again closes it. */}
              <button
                onClick={(e) => {
                  if (orderMenu) { setOrderMenu(null); return; }
                  const r = e.currentTarget.getBoundingClientRect();
                  setOrderMenu({ right: window.innerWidth - r.right, top: r.bottom + 6 });
                }}
                title="Reorder widgets"
                className={`p-2 rounded-lg ${btnNeutral}`}
              >
                <ListOrdered size={18} strokeWidth={2.5} />
              </button>

              <button
                onClick={openTrackerModal}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${btnNeutral}`}
              >
                <Plus size={18} strokeWidth={2.5} />
                <span>Add Widget</span>
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={`max-w-5xl mx-auto px-6 ${isFullscreen ? 'min-h-screen flex flex-col justify-center py-6' : 'py-6'}`}>
        <div>
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'flex flex-col gap-6'}>
            <AnimatePresence>
              {ordered.map((tracker) => (
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
                <div className="w-20 h-20 bg-fill-subtle rounded-full flex items-center justify-center text-fg-ghost">
                  <Clock size={40} />
                </div>
                <div>
                  <h2 className="text-xl font-medium text-fg-subtle">No trackers yet</h2>
                  <p className="text-fg-ghost text-sm">Create your first progress widget to get started.</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* The active-task tracker now renders globally from AppShell, pinned to
              the bottom of every page (sharing the stopwatch's overlay slot). */}
        </div>
      </main>

      {/* Order menu - drag to set the order used here AND on the daily page. */}
      {orderMenu && createPortal(
        <TrackerOrderMenu
          anchor={orderMenu}
          trackers={ordered}
          onMove={moveTracker}
          onClose={() => setOrderMenu(null)}
        />,
        document.body
      )}
    </>
  );
}
