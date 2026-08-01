import { createFileRoute } from '@tanstack/react-router';
import { format } from 'date-fns';
import { DailyScreen } from '@/features/daily';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { useAppData } from '@/lib/app-data';
import { useOverlayNav } from '@/common/hooks/useOverlayNav';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute('/_authed/today')({
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search.date === 'string' && DATE_RE.test(search.date) ? { date: search.date } : {},
  component: TodayRoute,
  errorComponent: ViewErrorFallback,
});

function TodayRoute() {
  const d = useAppData();
  const { openTask } = useOverlayNav();
  const navigate = Route.useNavigate();
  const { date } = Route.useSearch();
  const selectedDate = date ?? format(new Date(), 'yyyy-MM-dd');
  return (
    <main className="mx-auto px-2 h-screen py-0">
      <div>
        <DailyScreen
          dayTodos={d.dayTodos}
          onSaveTodo={d.handleHubSaveTodo}
          onCreateInDay={d.handleCreateInDay}
          onReorderDay={d.handleReorderDay}
          onDeleteTodo={d.handleDeleteTodoById}
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
          dailyTasksInPlanner={d.dailyTasksInPlanner}
          onCreateCollection={d.createCollection}
          selectedDate={selectedDate}
          onSelectDate={(next) => navigate({ search: { date: next } })}
          onOpenTask={(id) => openTask(id)}
          onCreateTask={d.handleDailyCalendarAddTodo}
        />
      </div>
    </main>
  );
}
