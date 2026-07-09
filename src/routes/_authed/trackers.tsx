import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Clock, LayoutGrid, List, Maximize2 } from 'lucide-react';
import { TrackerCard } from '../../components/TrackerCard';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';
import { btnNeutral } from '../../theme/buttons';
import { useAppData } from '../../data/AppDataContext';

export const Route = createFileRoute('/_authed/trackers')({
  component: TrackersRoute,
  errorComponent: ViewErrorFallback,
});

function TrackersRoute() {
  const {
    trackers,
    handleDeleteTracker,
    handleEditTracker,
    openTrackerModal,
    isFullscreen, setIsFullscreen,
  } = useAppData();
  // Grid/list toggle is local to this view (no other view reads it).
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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
                Time Trackers
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex bg-fill-subtle rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-fill text-fg' : 'text-fg-faint hover:text-fg'}`}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1 rounded-md transition-colors ${viewMode === 'list' ? 'bg-fill text-fg' : 'text-fg-faint hover:text-fg'}`}
                >
                  <List size={18} strokeWidth={2.5} />
                </button>
              </div>

              <button
                onClick={() => setIsFullscreen(true)}
                className={`p-2 rounded-lg ${btnNeutral}`}
                title="Fullscreen Mode"
              >
                <Maximize2 size={18} strokeWidth={2.5} />
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
    </>
  );
}
