import { createFileRoute, redirect } from '@tanstack/react-router';
import { CalendarView } from '@/features/calendar';
import { hasInvalidDateParam, validateDateSearch } from '@/lib/dateParam';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { useAppData } from '@/lib/app-data';
import { useOverlayNav } from '@/common/hooks/useOverlayNav';

export const Route = createFileRoute('/_authed/calendar')({
  validateSearch: validateDateSearch,
  // Same as /today: an unusable `date` sends you to the bare calendar rather than
  // leaving a lying URL in the address bar (or an Invalid Date in the view).
  beforeLoad: ({ location }) => {
    if (hasInvalidDateParam(location.searchStr)) throw redirect({ to: '/calendar', replace: true });
  },
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
