import { createFileRoute } from '@tanstack/react-router';
import { PlannerScreen, validatePlannerSearch } from '@/features/planner';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';

// /planner/$collectionId - the collection id is the selected view.
export const Route = createFileRoute('/_authed/planner/$collectionId')({
  component: PlannerCollectionRoute,
  validateSearch: validatePlannerSearch,
  errorComponent: ViewErrorFallback,
});

function PlannerCollectionRoute() {
  const { collectionId } = Route.useParams();
  const { editCollection } = Route.useSearch();
  return <PlannerScreen selectedView={collectionId} editCollectionId={editCollection ?? null} />;
}
