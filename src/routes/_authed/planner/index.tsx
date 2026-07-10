import { createFileRoute } from '@tanstack/react-router';
import { PlannerScreen } from '@/features/planner';
import { ViewErrorFallback } from '../../../components/ViewErrorFallback';

// Bare /planner = the "all" view (no collection in the path).
export const Route = createFileRoute('/_authed/planner/')({
  component: PlannerIndexRoute,
  errorComponent: ViewErrorFallback,
});

function PlannerIndexRoute() {
  return <PlannerScreen selectedView="all" />;
}
