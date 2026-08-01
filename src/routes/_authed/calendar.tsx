import { createFileRoute } from '@tanstack/react-router';
import { CalendarView } from '@/features/calendar';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { useAppData } from '@/lib/app-data';
import { useOverlayNav } from '@/common/hooks/useOverlayNav';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute('/_authed/calendar')({
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search.date === 'string' && DATE_RE.test(search.date) ? { date: search.date } : {},
  component: CalendarRoute,
  errorComponent: ViewErrorFallback,
});

function CalendarRoute() {
  const d = useAppData();
  const navigate = Route.useNavigate();
  const { openTask } = useOverlayNav();
  const { date } = Route.useSearch();
  return (
    <main className="mx-auto h-screen py-0">
      <div>
        <CalendarView
          dayTodos={d.dayTodos}
          onSaveTodo={d.handleHubSaveTodo}
          onMoveTodo={d.handleMoveTodo}
          onToggleTodo={d.handleToggleTodo}
          initialDate={date}
          onFocusDateChange={(next) => navigate({ search: { date: next } })}
          onCreateTask={d.handleCalendarAddTodo}
          onOpenTask={openTask}
        />
      </div>
    </main>
  );
}
