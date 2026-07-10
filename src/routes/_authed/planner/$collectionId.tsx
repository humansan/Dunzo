import { createFileRoute } from '@tanstack/react-router';
import { PlannerScreen } from '@/features/planner';
import { ViewErrorFallback } from '../../../components/ViewErrorFallback';

// /planner/$collectionId — the collection id is the selected view.
export const Route = createFileRoute('/_authed/planner/$collectionId')({
  component: PlannerCollectionRoute,
  errorComponent: ViewErrorFallback,
});

function PlannerCollectionRoute() {
  const { collectionId } = Route.useParams();
  return <PlannerScreen selectedView={collectionId} />;
}
