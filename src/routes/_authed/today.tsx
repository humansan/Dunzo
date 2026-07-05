import { createFileRoute, useRouter } from '@tanstack/react-router';
import { format } from 'date-fns';
import { TodoView } from '../../components/TodoView';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';
import { useAppData } from '../../data/AppDataContext';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute('/_authed/today')({
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search.date === 'string' && DATE_RE.test(search.date) ? { date: search.date } : {},
  component: TodayRoute,
  errorComponent: ViewErrorFallback,
});

function TodayRoute() {
  const d = useAppData();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const { date } = Route.useSearch();
  const selectedDate = date ?? format(new Date(), 'yyyy-MM-dd');
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
          selectedDate={selectedDate}
          onSelectDate={(next) => navigate({ search: { date: next } })}
          onOpenTask={(id) => router.history.push('/task/' + encodeURIComponent(id))}
        />
      </div>
    </main>
  );
}
