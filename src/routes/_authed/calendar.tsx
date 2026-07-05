import { createFileRoute } from '@tanstack/react-router';
import { CalendarView } from '../../components/CalendarView';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';
import { useAppData } from '../../data/AppDataContext';

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
  const { date } = Route.useSearch();
  return (
    <main className="mx-auto px-2 h-screen py-0">
      <div>
        <CalendarView
          dayTodos={d.dayTodos}
          onUpdateTodos={d.handleUpdateTodos}
          initialDate={date}
          onFocusDateChange={(next) => navigate({ search: { date: next } })}
        />
      </div>
    </main>
  );
}
