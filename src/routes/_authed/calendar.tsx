import { createFileRoute } from '@tanstack/react-router';
import { CalendarView } from '../../components/CalendarView';
import { useAppData } from '../../data/AppDataContext';

export const Route = createFileRoute('/_authed/calendar')({
  component: CalendarRoute,
});

function CalendarRoute() {
  const d = useAppData();
  return (
    <main className="mx-auto px-2 h-screen py-0">
      <div>
        <CalendarView
          dayTodos={d.dayTodos}
          onUpdateTodos={d.handleUpdateTodos}
        />
      </div>
    </main>
  );
}
