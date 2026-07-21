import { createFileRoute } from '@tanstack/react-router';
import { PlannerScreen, validatePlannerSearch } from '@/features/planner';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';

// Bare /planner = the "all" view (no collection in the path).
export const Route = createFileRoute('/_authed/planner/')({
  component: PlannerIndexRoute,
  validateSearch: validatePlannerSearch,
  errorComponent: ViewErrorFallback,
});

function PlannerIndexRoute() {
  const { editCollection } = Route.useSearch();
  return <PlannerScreen selectedView="all" editCollectionId={editCollection ?? null} />;
}
