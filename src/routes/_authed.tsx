import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppDataProvider } from '../data/AppDataContext';
import { AppShell } from '../components/AppShell';
import { authClient } from '../auth';

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
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppDataProvider>
      <AppShell />
    </AppDataProvider>
  );
}
