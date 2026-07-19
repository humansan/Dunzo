import { createFileRoute, useRouter } from '@tanstack/react-router';
import { TaskOverlay } from '@/features/tasks';
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
  // This route only mounts on a cold deep-link, so there is no in-app history
  // entry behind it - history.back() would leave the app (to the new-tab page).
  // The in-app overlay close (AppShell.closeOverlay) is the one that pops.
  const close = () => router.history.push('/today');
  return <TaskOverlay taskId={taskId} onClose={close} />;
}
