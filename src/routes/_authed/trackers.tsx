import { createFileRoute } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Clock, LayoutGrid, List, Maximize2 } from 'lucide-react';
import { TrackerCard } from '../../components/TrackerCard';
import { ActiveTodoTracker } from '../../components/ActiveTodoTracker';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';
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
    viewMode, setViewMode,
    isFullscreen, setIsFullscreen,
    activeTodo,
    setActiveTodoId,
    handleToggleAndClose,
  } = useAppData();

  return (
    <>
      {/* Header */}
      {!isFullscreen && (
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
                  <List size={18} strokeWidth={2.5} />
                </button>
              </div>

              <button
                onClick={() => setIsFullscreen(true)}
                className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all"
                title="Fullscreen Mode"
              >
                <Maximize2 size={18} strokeWidth={2.5} />
              </button>

              <button
                onClick={openTrackerModal}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all text-sm font-semibold"
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
      </main>
    </>
  );
}
