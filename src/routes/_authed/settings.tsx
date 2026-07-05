import { createFileRoute, useRouter } from '@tanstack/react-router';
import { SettingsOverlay } from '../../components/SettingsOverlay';
import { ViewErrorFallback } from '../../components/ViewErrorFallback';

// Standalone /settings route — only reached by a cold deep-link (reloading the
// masked URL from the address bar). In-app opens render SettingsOverlay over the
// current page via a search param instead (see useOverlayNav), so the page never
// unmounts. Both paths render the same SettingsOverlay.
export const Route = createFileRoute('/_authed/settings')({
  component: SettingsRoute,
  errorComponent: ViewErrorFallback,
});

function SettingsRoute() {
  const router = useRouter();
  const close = () => {
    if (window.history.length > 1) router.history.back();
    else router.history.push('/today');
  };
  return <SettingsOverlay onClose={close} />;
}
