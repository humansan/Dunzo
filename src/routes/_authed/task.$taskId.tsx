import { createFileRoute, useRouter, useSearch } from '@tanstack/react-router';
import { TaskOverlay } from '@/features/tasks';
import { withBase } from '@/lib/basePath';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';

// Standalone /task/$taskId route - only reached by a cold deep-link (reloading the
// masked URL from the address bar). In-app opens render TaskOverlay over the
// current page via a search param instead (see useOverlayNav), so the page never
// unmounts. Both paths render the same TaskOverlay.
export const Route = createFileRoute('/_authed/task/$taskId')({
  component: TaskRoute,
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
