import { createFileRoute } from '@tanstack/react-router';
import { TodoView } from '../../components/TodoView';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';
import { useAppData } from '../../data/AppDataContext';

export const Route = createFileRoute('/_authed/today')({
  component: TodayRoute,
  errorComponent: ViewErrorFallback,
});

function TodayRoute() {
  const d = useAppData();
  return (
    <main className="mx-auto px-2 h-screen py-0">
      <div>
        <TodoView
          dayTodos={d.dayTodos}
          onUpdateTodos={d.handleUpdateTodos}
          onMoveTodo={d.handleMoveTodo}
          onStartTracking={d.handleStartTracking}
          activeTodoId={d.activeTodoId}
          onToggleTodo={d.handleToggleTodo}
          trackers={d.trackers}
          onDeleteTracker={d.handleDeleteTracker}
          onEditTracker={d.handleEditTracker}
          weekStartsOn={d.weekStartsOn}
          onUpdateWeekStartsOn={d.setWeekStartsOn}
          countdownMode={d.countdownMode}
          onUpdateCountdownMode={d.setCountdownMode}
          xpEnabled={d.xpEnabled}
          onCreateCollection={d.createCollection}
        />
      </div>
    </main>
  );
}
