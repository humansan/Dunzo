import { createFileRoute, redirect } from '@tanstack/react-router';
import { format } from 'date-fns';
import { hasInvalidDateParam, validateDateSearch } from '@/lib/dateParam';
import { DailyScreen } from '@/features/daily';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { useAppData } from '@/lib/app-data';
import { useOverlayNav } from '@/common/hooks/useOverlayNav';

export const Route = createFileRoute('/_authed/today')({
  validateSearch: validateDateSearch,
  // A `date` that isn't a real day (deleted, typo'd, hand-edited) would otherwise
  // be dropped by validateSearch but stay in the address bar, and the view would
  // silently show today under a URL claiming otherwise. Land on the bare tab
  // instead, replacing the bad entry so Back doesn't return to it.
  beforeLoad: ({ location }) => {
    if (hasInvalidDateParam(location.searchStr)) throw redirect({ to: '/today', replace: true });
  },
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
          onDeleteTodo={d.requestDeleteTodo}
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
