import { createFileRoute } from '@tanstack/react-router';
import { PlannerScreen, validatePlannerSearch } from '@/features/planner';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { pageHead } from '@/lib/pageTitle';

// Bare /planner = the "all" view (no collection in the path).
export const Route = createFileRoute('/_authed/planner/')({
  head: () => pageHead('Task Planner'),
  component: PlannerIndexRoute,
  validateSearch: validatePlannerSearch,
  errorComponent: ViewErrorFallback,
});

function PlannerIndexRoute() {
  const { editCollection } = Route.useSearch();
  return <PlannerScreen selectedView="all" editCollectionId={editCollection ?? null} />;
}
