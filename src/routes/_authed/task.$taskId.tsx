import { createFileRoute, redirect, useRouter, useSearch } from '@tanstack/react-router';
import { TaskOverlay } from '@/features/tasks';
import { todosQueryOptions } from '@/features/tasks/api';
import { withBase } from '@/lib/basePath';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';
import { pageHead } from '@/lib/pageTitle';

// Standalone /task/$taskId route - only reached by a cold deep-link (reloading the
// masked URL from the address bar). In-app opens render TaskOverlay over the
// current page via a search param instead (see useOverlayNav), so the page never
// unmounts. Both paths render the same TaskOverlay.
export const Route = createFileRoute('/_authed/task/$taskId')({
  // Cold deep-link only (see above). An in-app open masks the URL to /task/$id but
  // stays matched on the page underneath, so that keeps the page's own title -
  // which is right either way: the full view is a window over a page, not a page.
  head: () => pageHead('Task'),
  component: TaskRoute,
  // Same guard as /planner/$collectionId: an id that names nothing (or names a
  // collection, which has no full view) would mount an overlay over an empty
  // page. Send those to /today - the same exit `close` uses - and replace the
  // entry so Back doesn't return to the dead URL.
  beforeLoad: async ({ context: { queryClient }, params }) => {
    const todos = await queryClient.ensureQueryData(todosQueryOptions());
    const todo = todos.find((t) => t.id === params.taskId);
    if (!todo || todo.isCollection) throw redirect({ to: '/today', replace: true });
  },
  errorComponent: ViewErrorFallback,
});

function TaskRoute() {
  const router = useRouter();
  const { taskId } = Route.useParams();
  // Opening a subtask from a cold deep-link stacks a search-param overlay on top
  // of this one (AppShell renders it, since this route lives under _authed too).
  // Yield to it: two mounted full-views would both answer Escape and both close.
  const stacked = useSearch({ from: '/_authed' }).task;
  // This route only mounts on a cold deep-link, so there is no in-app history
  // entry behind it - history.back() would leave the app (to the new-tab page).
  // The in-app overlay close (AppShell.closeOverlay) is the one that pops.
  const close = () => router.history.push(withBase('/today'));
  if (stacked) return null;
  return <TaskOverlay taskId={taskId} onClose={close} />;
}
