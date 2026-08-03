import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlannerScreen, validatePlannerSearch } from '@/features/planner';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { todosQueryOptions } from '@/features/tasks/api';

// /planner/$collectionId - the collection id is the selected view.
export const Route = createFileRoute('/_authed/planner/$collectionId')({
  component: PlannerCollectionRoute,
  validateSearch: validatePlannerSearch,
  // This route matches *any* single segment, so the id has to be checked: a
  // deleted collection (or a typo, or a stale bookmark) would otherwise render an
  // empty planner that looks broken. Fall back to the all-tasks view, replacing
  // the bad entry so Back doesn't bounce straight into it again.
  // ensureQueryData rather than the parent loader's data: child beforeLoad runs
  // before parent loaders, and it's a cache read once the todos are warm.
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const todos = await queryClient.ensureQueryData(todosQueryOptions());
    if (!todos.some((t) => t.id === params.collectionId && t.isCollection)) {
      throw redirect({ to: '/planner', replace: true });
    }
  },
  errorComponent: ViewErrorFallback,
});

function PlannerCollectionRoute() {
  const { collectionId } = Route.useParams();
  const { editCollection } = Route.useSearch();
  return <PlannerScreen selectedView={collectionId} editCollectionId={editCollection ?? null} />;
}
