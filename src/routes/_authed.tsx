import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { AppDataProvider } from '../data/AppDataContext';
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
      <AppShell />
    </AppDataProvider>
  );
}

// Full-screen fallback when the shared-data prefetch fails (was the inline
// `isDataError` retry screen in AppShell). Retry re-runs the loader.
function DataErrorScreen() {
  const router = useRouter();
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-neutral-950 text-white/60 text-sm">
      <p>Couldn’t load your data.</p>
      <button
        onClick={() => router.invalidate()}
        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold"
      >
        Retry
      </button>
    </div>
  );
}
