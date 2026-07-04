import { createFileRoute } from '@tanstack/react-router';
import { AppDataProvider } from '../data/AppDataContext';
import { AppShell } from '../components/AppShell';

// Pathless layout route. Mounts the data bridge once and renders the persistent
// shell (which renders the routed <Outlet/>). The auth guard lands here in
// migration step 2; for now AppShell keeps the existing gating.
export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppDataProvider>
      <AppShell />
    </AppDataProvider>
  );
}
