import { createFileRoute, useRouter } from '@tanstack/react-router';
import { TaskOverlay } from '../../components/TaskOverlay';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';

// Standalone /task/$taskId route — only reached by a cold deep-link (reloading the
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
  const close = () => {
    if (window.history.length > 1) router.history.back();
    else router.history.push('/today');
  };
  return <TaskOverlay taskId={taskId} onClose={close} />;
}
