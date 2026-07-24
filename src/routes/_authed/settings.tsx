import { createFileRoute, useRouter } from '@tanstack/react-router';
import { SettingsOverlay } from '@/features/settings';
import { withBase } from '@/lib/basePath';
import { ViewErrorFallback } from '@/app/ViewErrorFallback';

// Standalone /settings route - only reached by a cold deep-link (reloading the
// masked URL from the address bar). In-app opens render SettingsOverlay over the
// current page via a search param instead (see useOverlayNav), so the page never
// unmounts. Both paths render the same SettingsOverlay.
export const Route = createFileRoute('/_authed/settings')({
  component: SettingsRoute,
  errorComponent: ViewErrorFallback,
});

function SettingsRoute() {
  const router = useRouter();
  // Cold deep-link only (see above): nothing of ours is behind it in history.
  const close = () => router.history.push(withBase('/today'));
  return <SettingsOverlay onClose={close} />;
}
