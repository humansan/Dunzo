import { createFileRoute, redirect } from '@tanstack/react-router';
import { PlannerScreen, validatePlannerSearch, isPseudoView } from '@/features/planner';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { todosQueryOptions } from '@/features/tasks/api';

// /planner/$collectionId - the segment is the selected view: either one of the
// fixed pseudo-view tabs (uncategorized, categorized, archived, ...) or a real
// collection id, exactly the split resolveView() makes.
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
    const view = params.collectionId;
    // 'all' is a pseudo-view too, but bare /planner is its canonical URL - send
    // /planner/all there rather than serving the same view from two paths.
    if (view === 'all') throw redirect({ to: '/planner', replace: true });
    // Every other pseudo-view is a valid tab with no backing todo; only real
    // collection ids need to exist in the data.
    if (isPseudoView(view)) return;
    const todos = await queryClient.ensureQueryData(todosQueryOptions());
    if (!todos.some((t) => t.id === view && t.isCollection)) {
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
