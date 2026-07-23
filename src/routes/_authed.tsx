import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { AppDataProvider } from '../data/AppDataContext';
import { StopwatchProvider } from '../data/StopwatchContext';
import { AppShell } from '../components/AppShell';
import { LoadingScreen } from '../components/LoadingScreen';
import { authClient } from '../auth';
import { todosQueryOptions } from '../data/todos';
import { trackersQueryOptions } from '../data/trackers';
import { workspacesQueryOptions } from '../data/workspaces';
import { settingsQueryOptions } from '../data/settings';

// Pathless layout route. Mounts the data bridge once and renders the persistent
// shell (which renders the routed <Outlet/>). The auth boundary lives here: a
// confirmed-null session redirects to /login. Because beforeLoad runs on
// navigation (not on window focus), a background session revalidation on refocus
// no longer remounts the login form — the old focus-flash / form-wipe bug.
export const Route = createFileRoute('/_authed')({
  // Overlays (settings / task full-view) are modeled as search-param state on the
  // *current* page rather than sibling routes, so the page under AppShell's
  // <Outlet/> never unmounts while an overlay is open. Validated here so every
  // child page inherits them. See useOverlayNav for how they're opened (masked to
  // the /settings and /task/$id URLs).
  validateSearch: (search: Record<string, unknown>): { task?: string; settings?: boolean } => ({
    task: typeof search.task === 'string' ? search.task : undefined,
    settings: search.settings === true || search.settings === 'true' ? true : undefined,
  }),
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession();
    if (!data) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  // Pre-warm the react-query cache before AppDataProvider mounts, so the provider's
  // hooks read warm data and never render a loading state. ensureQueryData returns
  // cached data immediately once warm (no flash on navigation or window-focus
  // revalidation) and only awaits a fetch on a genuine cold load.
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(todosQueryOptions()),
      queryClient.ensureQueryData(workspacesQueryOptions()),
      queryClient.ensureQueryData(settingsQueryOptions()),
      queryClient.ensureQueryData(trackersQueryOptions()),
    ]),
  pendingComponent: () => <LoadingScreen message="Loading your workspace…" />,
  errorComponent: DataErrorScreen,
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppDataProvider>
      <StopwatchProvider>
        <AppShell />
      </StopwatchProvider>
    </AppDataProvider>
  );
}

// Full-screen fallback when the shared-data prefetch fails (was the inline
// `isDataError` retry screen in AppShell). Retry re-runs the loader.
function DataErrorScreen() {
  const router = useRouter();
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-canvas text-fg-subtle text-sm">
      <p>Couldn’t load your data.</p>
      <button
        onClick={() => router.invalidate()}
        className="px-4 py-2 rounded-xl bg-fill-subtle hover:bg-fill text-fg font-semibold"
      >
        Retry
      </button>
    </div>
  );
}
