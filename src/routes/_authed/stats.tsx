import { createFileRoute } from '@tanstack/react-router';
import { StatsView } from '../../components/StatsView';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';
import { useAppData } from '../../data/AppDataContext';

export const Route = createFileRoute('/_authed/stats')({
  component: StatsRoute,
  errorComponent: ViewErrorFallback,
});

function StatsRoute() {
  const d = useAppData();
  return (
    <main className="max-w-5xl mx-auto px-6 py-6">
      <div>
        <StatsView dayTodos={d.dayTodos} />
      </div>
    </main>
  );
}
